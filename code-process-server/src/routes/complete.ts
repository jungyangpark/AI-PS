import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

export const completeRouter = Router();

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

interface CompleteRequest {
  // The code before the cursor
  prefix: string;
  // The code after the cursor
  suffix: string;
  // The file's language (e.g., "python", "javascript")
  language: string;
  // The file name
  fileName: string;
  // Subject ID for logging
  subjectId: string;
}

completeRouter.post('/', async (req: Request, res: Response) => {
  const { prefix, suffix, language, fileName, subjectId } = req.body as CompleteRequest;

  if (!prefix && !suffix) {
    res.json({ completion: '' });
    return;
  }

  const anthropic = getClient();
  if (!anthropic) {
    res.status(503).json({ error: 'API key not configured' });
    return;
  }

  try {
    const prompt = buildPrompt(prefix, suffix, language, fileName);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
      stop_sequences: ['\n\n', '```'],
    });

    const completion = extractCompletion(response);

    res.json({
      completion,
      subjectId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('LLM completion error:', error.message);
    res.status(500).json({ error: 'Completion failed' });
  }
});

function buildPrompt(prefix: string, suffix: string, language: string, fileName: string): string {
  return `You are a code autocomplete engine. Complete the code at the cursor position. Only output the completion text, nothing else. Do not repeat the existing code. Keep it short (1-2 lines max).

File: ${fileName} (${language})

Code before cursor:
\`\`\`${language}
${prefix}
\`\`\`

Code after cursor:
\`\`\`${language}
${suffix}
\`\`\`

Completion:`;
}

function extractCompletion(response: Anthropic.Message): string {
  const block = response.content[0];
  if (block.type === 'text') {
    // Clean up: remove leading/trailing whitespace and code fences
    let text = block.text;
    text = text.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    return text.trimEnd();
  }
  return '';
}
