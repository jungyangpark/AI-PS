import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  message: string;
  currentCode?: string;
  fileName?: string;
  chatHistory?: ChatMessage[];
}

/**
 * POST /api/chat
 * Handle chatbot conversations with code context
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, currentCode, fileName, chatHistory = [] }: ChatRequest = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('[Chat] Received code length:', currentCode ? currentCode.length : 0);
    console.log('[Chat] File name:', fileName || 'none');

    // Build system prompt with code context
    let systemPrompt = `You are a helpful coding assistant for students learning programming.
You provide clear, educational explanations and help students understand their code.
Keep your responses concise and focused on the student's question.
IMPORTANT: The student is viewing their code in the editor. Always refer to their current code when answering.`;

    if (currentCode && currentCode.trim().length > 0) {
      systemPrompt += `\n\nThe student is currently working on the following code in file "${fileName || 'unknown'}":\n\n\`\`\`python\n${currentCode}\n\`\`\`\n\nPlease refer to this code when answering their questions.`;
    } else {
      systemPrompt += `\n\n(Note: No code is currently open in the editor)`;
    }

    // Build conversation messages
    // Filter out any messages that are too long or invalid
    const validHistory = chatHistory
      .slice(-10) // Keep only last 10 messages to avoid token limits
      .filter(msg => msg.content && msg.content.length > 0 && msg.content.length < 10000);

    const messages: Anthropic.MessageParam[] = [
      ...validHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages,
    });

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text');
    const assistantResponse = textContent && 'text' in textContent ? textContent.text : 'No response generated';

    res.json({
      response: assistantResponse,
      model: response.model,
      usage: response.usage,
    });

  } catch (error: any) {
    console.error('Chat API error:', error);

    // Handle specific Anthropic API errors
    if (error.status === 401) {
      return res.status(500).json({ error: 'Invalid API key' });
    }

    if (error.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message,
    });
  }
});

export default router;
