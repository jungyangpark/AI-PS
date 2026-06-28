import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const logsRouter = Router();

const LOG_DIR = process.env.LOG_DIR || './logs';

// Ensure log directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

interface LogEvent {
  EventType: string;
  SubjectID: string;
  AssignmentID: string;
  Timestamp: string;
  [key: string]: any;
}

interface LogBatchRequest {
  subjectId: string;
  assignmentId: string;
  sessionId: string;
  events: LogEvent[];
}

// Receive a batch of log events
logsRouter.post('/', (req: Request, res: Response) => {
  const { subjectId, assignmentId, sessionId, events } = req.body as LogBatchRequest;

  if (!subjectId || !sessionId || !events || events.length === 0) {
    res.status(400).json({ error: 'Missing required fields: subjectId, sessionId, events' });
    return;
  }

  try {
    // Create directory structure: logs/{subjectId}/{sessionId}/
    const sessionDir = path.join(LOG_DIR, subjectId, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const csvPath = path.join(sessionDir, 'MainTable.csv');

    // Write header if new file
    if (!fs.existsSync(csvPath)) {
      const headers = [
        'EventType', 'EventID', 'Order', 'SubjectID', 'AssignmentID',
        'Timestamp', 'EditType', 'InsertText', 'DeleteText',
        'SourceLocation', 'CodeStateID', 'CursorLine', 'CursorColumn',
        'X-PauseDuration', 'X-PauseReason', 'X-EditCount',
      ];
      fs.writeFileSync(csvPath, headers.join(',') + '\n', 'utf-8');
    }

    // Append events
    for (const event of events) {
      const row = [
        event.EventType, event.EventID, event.Order,
        event.SubjectID, event.AssignmentID, event.Timestamp,
        event.EditType, event.InsertText, event.DeleteText,
        event.SourceLocation, event.CodeStateID, event.CursorLine,
        event.CursorColumn, event['X-PauseDuration'], event['X-PauseReason'],
        event['X-EditCount'],
      ].map(v => escapeCSV(v)).join(',');

      fs.appendFileSync(csvPath, row + '\n', 'utf-8');
    }

    res.json({
      status: 'ok',
      eventsReceived: events.length,
      sessionId,
    });
  } catch (error: any) {
    console.error('Log save error:', error.message);
    res.status(500).json({ error: 'Failed to save logs' });
  }
});

// Receive code state snapshot
logsRouter.post('/codestate', (req: Request, res: Response) => {
  const { subjectId, sessionId, codeStateId, fileName, content } = req.body;

  if (!subjectId || !sessionId || !codeStateId || !fileName) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const stateDir = path.join(LOG_DIR, subjectId, sessionId, 'CodeStates', codeStateId);
    fs.mkdirSync(stateDir, { recursive: true });

    const targetPath = path.join(stateDir, fileName);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');

    res.json({ status: 'ok', codeStateId });
  } catch (error: any) {
    console.error('Code state save error:', error.message);
    res.status(500).json({ error: 'Failed to save code state' });
  }
});

// List all sessions for a subject
logsRouter.get('/sessions/:subjectId', (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const subjectDir = path.join(LOG_DIR, subjectId);

  if (!fs.existsSync(subjectDir)) {
    res.json({ sessions: [] });
    return;
  }

  const sessions = fs.readdirSync(subjectDir).filter(f => {
    return fs.statSync(path.join(subjectDir, f)).isDirectory();
  });

  res.json({ sessions });
});

function escapeCSV(value: any): string {
  if (value === undefined || value === null) { return ''; }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
