import * as http from 'http';
import * as https from 'https';

interface LogEvent {
  [key: string]: any;
}

interface PendingCodeState {
  codeStateId: string;
  fileName: string;
  content: string;
}

/**
 * Buffers log events and periodically sends them to the backend server.
 *
 * - Only one flush runs at a time; callers of flush() wait for the one in flight and then
 *   send whatever is left, so "await flush()" really means "everything so far is sent".
 * - Failed event batches and failed code state uploads stay queued and are retried.
 */
export class LogUploader {
  private serverUrl: string;
  private subjectId: string;
  private assignmentId: string;
  private sessionId: string;
  private buffer: LogEvent[] = [];
  private codeStates: PendingCodeState[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private flushIntervalMs: number = 10000; // Flush every 10 seconds
  private inFlight: Promise<void> | undefined;

  constructor(serverUrl: string, subjectId: string, assignmentId: string, sessionId: string) {
    this.serverUrl = serverUrl;
    this.subjectId = subjectId;
    this.assignmentId = assignmentId;
    this.sessionId = sessionId;

    // Start periodic flush
    this.flushTimer = setInterval(() => { void this.flush(); }, this.flushIntervalMs);
  }

  addEvent(event: LogEvent): void {
    this.buffer.push(event);
  }

  updateAssignmentId(assignmentId: string): void {
    this.assignmentId = assignmentId;
  }

  /** Send everything buffered so far. Resolves once the server has it (or the attempt failed). */
  async flush(): Promise<void> {
    // Wait for a flush that is already sending, then send what arrived meanwhile.
    while (this.inFlight) {
      await this.inFlight;
    }
    if (this.buffer.length === 0 && this.codeStates.length === 0) { return; }
    this.inFlight = this.doFlush().finally(() => { this.inFlight = undefined; });
    await this.inFlight;
  }

  private async doFlush(): Promise<void> {
    // Code states first, so the events that reference them never arrive before them.
    const states = this.codeStates;
    this.codeStates = [];
    const failedStates: PendingCodeState[] = [];
    for (const s of states) {
      try {
        await this.sendToServer('/api/logs/codestate', {
          subjectId: this.subjectId,
          assignmentId: this.assignmentId,
          codeStateId: s.codeStateId,
          fileName: s.fileName,
          content: s.content,
        });
      } catch (err: any) {
        // 4xx = the server rejected this snapshot; retrying would fail the same way.
        if (!/Server returned 4\d\d/.test(String(err?.message))) { failedStates.push(s); }
      }
    }
    this.codeStates.unshift(...failedStates);

    // Events logged with no assignment ('-', e.g. after a successful submission) are not
    // stored by the server; dropping them here keeps them out of the previous assignment's
    // MainTable, which this uploader still targets until a new assignment is set.
    const events = this.buffer.filter(e => e.AssignmentID !== '-');
    this.buffer = [];
    if (events.length === 0) { return; }

    try {
      await this.sendToServer('/api/logs', {
        subjectId: this.subjectId,
        assignmentId: this.assignmentId,
        sessionId: this.sessionId,
        events,
      });
    } catch {
      // Put events back in buffer for retry
      this.buffer.unshift(...events);
    }
  }

  /** Queue a code snapshot; it is sent with the next flush (before the events that reference it). */
  uploadCodeState(codeStateId: string, fileName: string, content: string): void {
    this.codeStates.push({ codeStateId, fileName, content });
  }

  /**
   * Stop the timer and send what is left. Retries a few times so the last events
   * (e.g. Session.End, or edits made just before switching assignment) are not dropped.
   */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.flush();
      if (this.buffer.length === 0 && this.codeStates.length === 0) { return; }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
    if (this.buffer.length > 0) {
      console.error(`[LogUploader] Dropping ${this.buffer.length} events after repeated upload failures`);
    }
  }

  private sendToServer(path: string, body: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const url = new URL(`${this.serverUrl}${path}`);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
          timeout: 60000, // log uploads are small; don't hang a flush for minutes
        },
        (res) => {
          let responseData = '';
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`Server returned ${res.statusCode}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      req.write(data);
      req.end();
    });
  }
}
