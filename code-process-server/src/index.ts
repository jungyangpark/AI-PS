import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { completeRouter } from './routes/complete';
import { logsRouter } from './routes/logs';
import { studentsRouter, initializeDefaultStudents } from './routes/students';
import { debugRouter } from './routes/debug';
import chatRouter from './routes/chat';
import submitRouter from './routes/submit';
import assignmentsRouter from './routes/assignments';

dotenv.config();

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

// Debug logging
app.use('/api/debug', debugRouter);

// Chatbot endpoint
app.use('/api/chat', chatRouter);

// Submit endpoint
app.use('/api/submit', submitRouter);

// Assignment management
app.use('/api/assignments', assignmentsRouter);

// Initialize default test students on startup
initializeDefaultStudents();

const server = app.listen(PORT, () => {
  console.log(`Code Process Server running on port ${PORT}`);
});

// Set server timeout to 10 minutes for code evaluation
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 610000; // slightly longer than timeout
server.headersTimeout = 620000; // slightly longer than keepAliveTimeout

console.log(`Server timeout set to ${server.timeout}ms (10 minutes)`);