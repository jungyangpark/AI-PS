import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR, isSafeId, safeJoin } from '../utils/paths';
import { requireAdmin } from '../utils/adminAuth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ZipArchive } = require('archiver');

export const logsRouter = Router();

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

const CSV_HEADERS = [
  'EventType', 'EventID', 'Order', 'SubjectID', 'AssignmentID',
  'Timestamp', 'EditType', 'InsertText', 'DeleteText',
  'SourceLocation', 'CodeStateID', 'CursorLine', 'CursorColumn',
  'X-PauseDuration', 'X-PauseReason', 'X-EditCount',
];

// Receive a batch of log events
logsRouter.post('/', (req: Request, res: Response) => {
  const { subjectId, assignmentId, sessionId, events } = req.body as LogBatchRequest;

  if (!subjectId || !assignmentId || !sessionId || !Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: 'Missing required fields: subjectId, assignmentId, sessionId, events[]' });
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

  if (!isSafeId(subjectId) || !isSafeId(assignmentId) || !isSafeId(sessionId)) {
    res.status(400).json({ error: 'Invalid subjectId, assignmentId or sessionId' });
    return;
  }

  try {
    // Create directory structure: logs/{subjectId}/{assignmentId}/
    const assignmentDir = safeJoin(LOG_DIR, subjectId, assignmentId);
    fs.mkdirSync(assignmentDir, { recursive: true });

    // Use sessionId in filename: MainTable_{sessionId}.csv
    const csvPath = path.join(assignmentDir, `MainTable_${sessionId}.csv`);

    // Write header if new file
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, CSV_HEADERS.join(',') + '\n', 'utf-8');
    }

    // Append events (one write per batch so rows of concurrent batches never interleave)
    const rows: string[] = [];
    for (const event of events) {
      if (!event || typeof event !== 'object') { continue; }
      rows.push([
        event.EventType, event.EventID, event.Order,
        event.SubjectID, event.AssignmentID, event.Timestamp,
        event.EditType, event.InsertText, event.DeleteText,
        event.SourceLocation, event.CodeStateID, event.CursorLine,
        event.CursorColumn, event['X-PauseDuration'], event['X-PauseReason'],
        event['X-EditCount'],
      ].map(v => escapeCSV(v)).join(','));
    }
    if (rows.length > 0) {
      fs.appendFileSync(csvPath, rows.join('\n') + '\n', 'utf-8');
    }

    res.json({
      status: 'ok',
      eventsReceived: rows.length,
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

  if (!subjectId || !assignmentId || !codeStateId || !fileName || typeof fileName !== 'string') {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Skip code state save if assignmentId is '-' (practice/no assignment mode)
  if (assignmentId === '-') {
    console.log(`[CodeState] Skipping code state save for practice mode (assignmentId: '-')`);
    res.json({ status: 'ok', codeStateId, skipped: true });
    return;
  }

  if (!isSafeId(subjectId) || !isSafeId(assignmentId) || !isSafeId(codeStateId)) {
    res.status(400).json({ error: 'Invalid subjectId, assignmentId or codeStateId' });
    return;
  }

  try {
    const stateDir = safeJoin(LOG_DIR, subjectId, assignmentId, 'CodeStates', codeStateId);
    // fileName is the workspace-relative path of the student's file; it may contain
    // sub-folders but must stay inside this code state folder.
    // Files outside the workspace arrive as absolute paths; store them under the
    // state folder as before (strip drive letter and leading slashes).
    const relName = fileName.replace(/^[A-Za-z]:/, '').replace(/^[\\/]+/, '');
    const targetPath = safeJoin(stateDir, relName);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, typeof content === 'string' ? content : '', 'utf-8');

    res.json({ status: 'ok', codeStateId });
  } catch (error: any) {
    console.error('Code state save error:', error.message);
    const status = /escapes/.test(error.message) ? 400 : 500;
    res.status(status).json({ error: status === 400 ? 'Invalid fileName' : 'Failed to save code state' });
  }
});

// ---------------------------------------------------------------------------
// Researcher endpoints (admin only)
// ---------------------------------------------------------------------------

/** Resolve LOG_DIR/<ids...> as an existing directory, or send an error and return null. */
function resolveDir(res: Response, ...ids: string[]): string | null {
  if (!ids.every(isSafeId)) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  const dir = safeJoin(LOG_DIR, ...ids);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return dir;
}

function sendZip(res: Response, dir: string, filename: string, prefix: string | false): void {
  const archive = new ZipArchive({ zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Never throw from here: an exception inside an event handler would crash the server.
  archive.on('error', (err: Error) => {
    console.error('[Download] Archive error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to build archive' });
    } else {
      res.destroy(err);
    }
  });
  archive.on('warning', (err: Error) => {
    console.warn('[Download] Archive warning:', err.message);
  });

  archive.pipe(res);
  archive.directory(dir, prefix);
  archive.finalize();
}

// List all assignments for a subject
logsRouter.get('/assignments/:subjectId', requireAdmin, (req: Request, res: Response) => {
  const { subjectId } = req.params;
  if (!isSafeId(subjectId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const subjectDir = safeJoin(LOG_DIR, subjectId);

  if (!fs.existsSync(subjectDir) || !fs.statSync(subjectDir).isDirectory()) {
    res.json({ assignments: [] });
    return;
  }

  const assignments = fs.readdirSync(subjectDir).filter(f => {
    return fs.statSync(path.join(subjectDir, f)).isDirectory();
  });

  res.json({ assignments });
});

// Download entire assignment as ZIP
logsRouter.get('/download/:subjectId/:assignmentId', requireAdmin, (req: Request, res: Response) => {
  const { subjectId, assignmentId } = req.params;
  const dir = resolveDir(res, subjectId, assignmentId);
  if (!dir) { return; }
  console.log(`[Download] ${subjectId}/${assignmentId}`);
  sendZip(res, dir, `${subjectId}_${assignmentId}.zip`, false);
});

// Download all logs for a subject (all assignments)
logsRouter.get('/download/:subjectId', requireAdmin, (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const dir = resolveDir(res, subjectId);
  if (!dir) { return; }
  console.log(`[Download] ${subjectId} (all assignments)`);
  sendZip(res, dir, `${subjectId}_all_assignments.zip`, subjectId);
});

// GET /api/logs/files/:subjectId/:assignmentId
// List all files in an assignment directory (without downloading)
logsRouter.get('/files/:subjectId/:assignmentId', requireAdmin, (req: Request, res: Response) => {
  const { subjectId, assignmentId } = req.params;
  const assignmentDir = resolveDir(res, subjectId, assignmentId);
  if (!assignmentDir) { return; }

  try {
    const files: any[] = [];

    // Recursive function to list all files
    function listFiles(dir: string, relativePath: string = '') {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const itemRelativePath = path.join(relativePath, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          listFiles(fullPath, itemRelativePath);
        } else {
          files.push({
            path: itemRelativePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            type: path.extname(item) || 'unknown'
          });
        }
      }
    }

    listFiles(assignmentDir);

    res.json({
      success: true,
      subjectId,
      assignmentId,
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      files: files.sort((a, b) => a.path.localeCompare(b.path))
    });

  } catch (error: any) {
    console.error('[Files] Error:', error.message);
    res.status(500).json({ error: 'Failed to list files', details: error.message });
  }
});

// List all subjects
logsRouter.get('/subjects', requireAdmin, (req: Request, res: Response) => {
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
