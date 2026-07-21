import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
const archiver = require('archiver');

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

// Download entire session as ZIP
logsRouter.get('/download/:subjectId/:sessionId', (req: Request, res: Response) => {
  const { subjectId, sessionId } = req.params;
  const sessionDir = path.join(LOG_DIR, subjectId, sessionId);

  if (!fs.existsSync(sessionDir)) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  try {
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${subjectId}_${sessionId}.zip"`);

    // Handle errors
    archive.on('error', (err: Error) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create archive' });
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add session directory to archive
    archive.directory(sessionDir, false);

    // Finalize archive
    archive.finalize();

  } catch (error: any) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Failed to download session logs' });
  }
});

// Download all logs for a subject (all sessions)
logsRouter.get('/download/:subjectId', (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const subjectDir = path.join(LOG_DIR, subjectId);

  if (!fs.existsSync(subjectDir)) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }

  try {
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${subjectId}_all_sessions.zip"`);

    archive.on('error', (err: Error) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create archive' });
    });

    archive.pipe(res);
    archive.directory(subjectDir, subjectId);
    archive.finalize();

  } catch (error: any) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Failed to download subject logs' });
  }
});

// List all subjects
logsRouter.get('/subjects', (req: Request, res: Response) => {
  if (!fs.existsSync(LOG_DIR)) {
    res.json({ subjects: [] });
    return;
  }

  try {
    const subjects = fs.readdirSync(LOG_DIR).filter(f => {
      const fullPath = path.join(LOG_DIR, f);
      return fs.statSync(fullPath).isDirectory();
    });

    res.json({ subjects });
  } catch (error: any) {
    console.error('List subjects error:', error.message);
    res.status(500).json({ error: 'Failed to list subjects' });
  }
});

function escapeCSV(value: any): string {
  if (value === undefined || value === null) { return ''; }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
