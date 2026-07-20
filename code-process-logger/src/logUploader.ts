import * as http from 'http';
import * as https from 'https';

interface LogEvent {
  [key: string]: any;
}

/**
 * Buffers log events and periodically sends them to the backend server.
 */
export class LogUploader {
  private serverUrl: string;
  private subjectId: string;
  private assignmentId: string;
  private sessionId: string;
  private buffer: LogEvent[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private flushIntervalMs: number = 10000; // Flush every 10 seconds

  constructor(serverUrl: string, subjectId: string, assignmentId: string, sessionId: string) {
    this.serverUrl = serverUrl;
    this.subjectId = subjectId;
    this.assignmentId = assignmentId;
    this.sessionId = sessionId;

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  addEvent(event: LogEvent): void {
    this.buffer.push(event);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) { return; }

    const events = [...this.buffer];
    this.buffer = [];

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

  async uploadCodeState(codeStateId: string, fileName: string, content: string): Promise<void> {
    try {
      await this.sendToServer('/api/logs/codestate', {
        subjectId: this.subjectId,
        sessionId: this.sessionId,
        codeStateId,
        fileName,
        content,
      });
    } catch {
      // Code state upload is best-effort
    }
  }

  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
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
          timeout: 600000, // 10 minutes for code evaluation
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
