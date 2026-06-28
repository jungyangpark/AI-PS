import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

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
  // Question mode (triggered by Shift+Escape)
  questionMode?: boolean;
}

completeRouter.post('/', async (req: Request, res: Response) => {
  const { prefix, suffix, language, fileName, subjectId, questionMode } = req.body as CompleteRequest;

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
    const prefixStr = JSON.stringify(prefix);
    const suffixStr = JSON.stringify(suffix);
    console.log('Request - prefix (last 1000):', prefixStr.slice(-1000), 'suffix:', suffixStr.substring(0, 100));

    // Use questionMode from request (triggered by Shift+Escape)
    const isQuestionMode = questionMode || false;
    const prompt = isQuestionMode
      ? buildQuestionPrompt(prefix, suffix, language, fileName)
      : buildPrompt(prefix, suffix, language, fileName);

    console.log('Mode:', isQuestionMode ? 'QUESTION' : 'AUTOCOMPLETE');
    console.log('Prompt:', prompt);

    // Retry logic for overloaded errors
    const maxTokens = isQuestionMode ? 256 : 512; // Allow longer completions for better code generation
    const response = await retryWithBackoff(async () => {
      return await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
    }, 3); // max 3 attempts

    console.log('LLM response:', JSON.stringify(response.content).substring(0, 200));
    let completion = extractCompletion(response);
    console.log('Completion before fix:', completion);

    // Fix first line based on cursor context
    completion = fixFirstLine(prefix, completion);
    console.log('Completion after fix:', completion);

    res.json({
      completion,
      subjectId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('LLM completion error:', error.message, error.status, error.error);
    res.status(500).json({ error: 'Completion failed' });
  }
});

/**
 * Build prompt for question-answering mode (triggered by Shift+Escape)
 */
function buildQuestionPrompt(prefix: string, suffix: string, language: string, fileName: string): string {
  // Extract question from last comment
  const lines = prefix.split('\n');
  let question = '';
  let codeContext = '';

  // Find last comment line (Python: #, JavaScript: //)
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();
    if (line.startsWith('#') || line.startsWith('//')) {
      question = line.replace(/^[#\/]+\s*/, ''); // Remove comment markers
      // Get code context without the question comment
      codeContext = lines.slice(Math.max(0, i - 10), i).join('\n');
      break;
    }
  }

  // If no comment found, return empty (question mode requires a comment)
  if (!question) {
    return '';
  }

  return `You are a concise coding assistant. The student asked a specific question about their code.

학생의 질문: ${question} provide only one code block that answers their question.

Answer ONLY this exact question - nothing more, nothing less.

CRITICAL RULES:
1. Output ONLY the code that directly answers their question (1-3 lines maximum)
2. DO NOT provide additional code beyond what they asked
3. DO NOT rewrite existing code or add complete implementations
4. DO NOT add function definitions like "def function_name():"
5. DO NOT say "Wait", "Actually", "Or", "Here's" or any explanations
6. If they ask "when to return X", just show the condition or condition+return - NOT the entire function logic
7. NO leading indentation - start from column 0

Code context (DO NOT REPEAT THIS):
\`\`\`${language}
${codeContext}
\`\`\`

Output ONLY what they asked for:`;
}

function buildPrompt(prefix: string, suffix: string, language: string, fileName: string): string {
  return `You are a code autocomplete assistant. Predict ONLY the next few lines at the cursor.

CRITICAL RULES - FOLLOW STRICTLY:
1. Output ONLY raw code - NO explanations, NO markdown, NO repetition
2. Output 3-7 lines that come AFTER the cursor position
3. NEVER repeat code that already exists before the cursor
4. NEVER output function definitions or code blocks that are already written
5. Only output NEW code that logically continues from where the cursor is
6. Include proper indentation that matches the context (analyze the code structure to determine correct indentation level)

Code before cursor (DO NOT REPEAT THIS):
\`\`\`${language}
${prefix}
\`\`\`

Code after cursor:
\`\`\`${language}
${suffix}
\`\`\`

Your completion (NEW code only, with proper indentation):`;
}

function extractCompletion(response: Anthropic.Message): string {
  if (!response.content || response.content.length === 0) {
    return '';
  }
  const block = response.content[0];
  if (block.type === 'text') {
    let text = block.text.trim();

    // Remove all markdown code blocks
    text = text.replace(/```\w*\n?/g, '').replace(/\n?```/g, '');

    // Split by common explanation markers and take only the first code block
    const explanationMarkers = [
      '\n\nActually,',
      '\n\nHere\'s',
      '\n\nNote:',
      '\n\nThis ',
      '\n\nThe ',
      '\n\n#',  // Comments after code
    ];

    for (const marker of explanationMarkers) {
      const index = text.indexOf(marker);
      if (index !== -1) {
        text = text.substring(0, index);
        console.log(`Trimmed explanation after: "${marker}"`);
      }
    }

    // Filter out meta-commentary (LLM explaining instead of coding)
    const metaPhrases = [
      'no completion needed',
      'no completion is needed',
      'there is no completion',
      'the code is already complete',
      'the code is complete',
      'already complete',
      'i cannot complete',
      'i don\'t see',
      'it appears',
      'it looks like',
      'this code',
      'the function',
      'the recursive',
      'here\'s',
      'here is',
      'it solves',
      'it correctly implements',
      'you should',
      'when `n',
      'when n ==',
      'for larger',
      'actually,',
      'wait,',
      'wait, let me',
    ];

    const lowerText = text.toLowerCase();

    // Check first 150 chars for meta-commentary
    const firstPart = lowerText.substring(0, 150);
    for (const phrase of metaPhrases) {
      if (firstPart.includes(phrase)) {
        console.log(`Filtered out meta-commentary containing: "${phrase}"`);
        return '';  // Return empty if LLM is explaining instead of coding
      }
    }

    // If response starts with explanatory text (sentences), reject it
    if (/^[A-Z][a-z\s]{10,}/.test(text)) {
      // Starts with capitalized sentence-like text
      console.log('Filtered out sentence-like response');
      return '';
    }

    return text.trimEnd();
  }
  return '';
}

/**
 * Fix first line of completion based on cursor context
 */
function fixFirstLine(prefix: string, completion: string): string {
  if (!completion) { return completion; }

  const lines = completion.split('\n');
  if (lines.length === 0) { return completion; }

  // Get last line from prefix (codeContext)
  const prefixLines = prefix.split('\n');
  const lastLine = prefixLines[prefixLines.length - 1];

  let firstLineOutput = lines[0];
  const restLines = lines.slice(1).join('\n');

  // Case 1: last_line is empty
  if (lastLine === '') {
    // first_line_output = first_line_output (keep as-is)
    return completion;
  }

  // Case 2: last_line includes words except spaces
  const hasNonSpaceChars = lastLine.trim().length > 0;
  if (hasNonSpaceChars) {
    // first_line_output = "\n" + first_line_output
    return restLines ? `\n${firstLineOutput}\n${restLines}` : `\n${firstLineOutput}`;
  }

  // Case 3: last_line has only spaces
  // first_line_output = remove LEADING spaces only
  firstLineOutput = firstLineOutput.trimStart();
  return restLines ? `${firstLineOutput}\n${restLines}` : firstLineOutput;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Only retry on overloaded errors (529) or rate limit errors (429)
      const shouldRetry = error.status === 529 || error.status === 429;

      if (!shouldRetry || attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s...
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.log(`API overloaded (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
