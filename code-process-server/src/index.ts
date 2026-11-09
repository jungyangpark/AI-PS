import dotenv from 'dotenv';

// Load environment variables BEFORE other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import { completeRouter } from './routes/complete';
import { logsRouter } from './routes/logs';
import { studentsRouter, initializeDefaultStudents } from './routes/students';
import { debugRouter } from './routes/debug';
import chatRouter from './routes/chat';
import submitRouter from './routes/submit';
import assignmentsRouter from './routes/assignments';
import { requireAdmin } from './utils/adminAuth';
import { LOG_DIR } from './utils/paths';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// LLM autocomplete endpoint
app.use('/api/complete', completeRouter);

// Log collection endpoint
app.use('/api/logs', logsRouter);

// Student management
app.use('/api/students', studentsRouter);

// Debug logging (researcher only; the extension does not call it)
app.use('/api/debug', requireAdmin, debugRouter);

// Chatbot endpoint
app.use('/api/chat', chatRouter);

// Submit endpoint
app.use('/api/submit', submitRouter);

// Assignment management (researcher only)
app.use('/api/assignments', requireAdmin, assignmentsRouter);

// Initialize default test students on startup
initializeDefaultStudents();

const server = app.listen(PORT, () => {
  console.log(`Code Process Server running on port ${PORT}`);
  console.log(`Logs directory: ${LOG_DIR}`);
  if (!process.env.ADMIN_KEY) {
    console.log('ADMIN_KEY is not set: researcher endpoints only accept direct localhost requests.');
  }
});

// Allow up to 10 minutes per request (assignment registration runs GT code many times)
server.timeout = 600000;
server.requestTimeout = 600000; // Node's own per-request limit (default 300 s)
server.keepAliveTimeout = 610000; // slightly longer than timeout
server.headersTimeout = 620000; // slightly longer than keepAliveTimeout

console.log(`Server timeout set to ${server.timeout}ms (10 minutes)`);