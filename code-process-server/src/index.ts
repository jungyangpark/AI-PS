import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { completeRouter } from './routes/complete';
import { logsRouter } from './routes/logs';
import { studentsRouter, initializeDefaultStudents } from './routes/students';
import { debugRouter } from './routes/debug';
import chatRouter from './routes/chat';
import submitRouter from './routes/submit';

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

// Initialize default test students on startup
initializeDefaultStudents();

app.listen(PORT, () => {
  console.log(`Code Process Server running on port ${PORT}`);
});
