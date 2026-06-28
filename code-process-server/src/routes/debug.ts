import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const debugRouter = Router();

debugRouter.post('/', (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;
    
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, 'extension-debug.log');
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      ...data
    };

    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('Debug log error:', error);
    res.status(500).json({ error: 'Failed to log' });
  }
});
