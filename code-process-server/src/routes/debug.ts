import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR } from '../utils/paths';

export const debugRouter = Router();

debugRouter.post('/', (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;

    fs.mkdirSync(LOG_DIR, { recursive: true });

    const logFile = path.join(LOG_DIR, 'extension-debug.log');
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      ...(data && typeof data === 'object' ? data : {}),
    };

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('Debug log error:', error);
    res.status(500).json({ error: 'Failed to log' });
  }
});
