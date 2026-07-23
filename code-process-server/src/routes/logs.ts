import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
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

  if (!subjectId || !assignmentId || !events || events.length === 0) {
    res.status(400).json({ error: 'Missing required fields: subjectId, assignmentId, events' });
    return;
  }

  // Skip logging if assignmentId is '-' (practice/no assignment mode)
  if (assignmentId === '-') {
    console.log(`[Log] Skipping log save for practice mode (assignmentId: '-')`);
    res.json({
      status: 'ok',
      eventsReceived: events.length,
      sessionId,
      skipped: true,
    });
    return;
  }

  try {
    // Create directory structure: logs/{subjectId}/{assignmentId}/
    const assignmentDir = path.join(LOG_DIR, subjectId, assignmentId);
    fs.mkdirSync(assignmentDir, { recursive: true });

    // Use sessionId in filename: MainTable_{sessionId}.csv
    const csvPath = path.join(assignmentDir, `MainTable_${sessionId}.csv`);

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
  const { subjectId, assignmentId, codeStateId, fileName, content } = req.body;

  if (!subjectId || !assignmentId || !codeStateId || !fileName) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Skip code state save if assignmentId is '-' (practice/no assignment mode)
  if (assignmentId === '-') {
    console.log(`[CodeState] Skipping code state save for practice mode (assignmentId: '-')`);
    res.json({ status: 'ok', codeStateId, skipped: true });
    return;
  }

  try {
    const stateDir = path.join(LOG_DIR, subjectId, assignmentId, 'CodeStates', codeStateId);
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

// List all assignments for a subject
logsRouter.get('/assignments/:subjectId', (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const subjectDir = path.join(LOG_DIR, subjectId);

  if (!fs.existsSync(subjectDir)) {
    res.json({ assignments: [] });
    return;
  }

  const assignments = fs.readdirSync(subjectDir).filter(f => {
    return fs.statSync(path.join(subjectDir, f)).isDirectory();
  });

  res.json({ assignments });
});

// Download entire assignment as ZIP
logsRouter.get('/download/:subjectId/:assignmentId', (req: Request, res: Response) => {
  const { subjectId, assignmentId } = req.params;
  const assignmentDir = path.join(LOG_DIR, subjectId, assignmentId);

  console.log(`[Download] Request for ${subjectId}/${assignmentId}`);
  console.log(`[Download] Looking in: ${assignmentDir}`);

  if (!fs.existsSync(assignmentDir)) {
    console.error(`[Download] Directory not found: ${assignmentDir}`);
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }

  try {
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set response headers BEFORE piping
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${subjectId}_${assignmentId}.zip"`);

    // Handle errors - must be set before pipe
    archive.on('error', (err: Error) => {
      console.error('[Download] Archive error:', err);
      throw err; // Let catch block handle it
    });

    // Log archive events
    archive.on('warning', (err: Error) => {
      console.warn('[Download] Archive warning:', err);
    });

    archive.on('finish', () => {
      console.log(`[Download] Archive finished for ${subjectId}/${assignmentId}`);
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add assignment directory to archive
    console.log(`[Download] Adding directory to archive: ${assignmentDir}`);
    archive.directory(assignmentDir, false);

    // Finalize archive
    archive.finalize();

  } catch (error: any) {
    console.error('[Download] Error:', error.message, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download assignment logs', details: error.message });
    }
  }
});

// Download all logs for a subject (all assignments)
logsRouter.get('/download/:subjectId', (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const subjectDir = path.join(LOG_DIR, subjectId);

  console.log(`[Download] Request for all assignments of ${subjectId}`);
  console.log(`[Download] Looking in: ${subjectDir}`);

  if (!fs.existsSync(subjectDir)) {
    console.error(`[Download] Directory not found: ${subjectDir}`);
    res.status(404).json({ error: 'Subject not found' });
    return;
  }

  try {
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${subjectId}_all_assignments.zip"`);

    archive.on('error', (err: Error) => {
      console.error('[Download] Archive error:', err);
      throw err;
    });

    archive.on('warning', (err: Error) => {
      console.warn('[Download] Archive warning:', err);
    });

    archive.on('finish', () => {
      console.log(`[Download] Archive finished for ${subjectId} (all assignments)`);
    });

    archive.pipe(res);
    archive.directory(subjectDir, subjectId);
    archive.finalize();

  } catch (error: any) {
    console.error('[Download] Error:', error.message, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download subject logs', details: error.message });
    }
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
