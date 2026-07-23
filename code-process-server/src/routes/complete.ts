import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { code2BlockAnalyzer, CodeBlock } from '../modules/code2block';

const DATA_DIR = process.env.LOG_DIR || './logs';
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

interface Student {
  id: string;
  passwordHash: string | null;
  level: number;
  kcLevels: Record<string, number>;
  createdAt: string;
  lastLoginAt: string | null;
}

function loadStudents(): Record<string, Student> {
  if (fs.existsSync(STUDENTS_FILE)) {
    return JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf-8'));
  }
  return {};
}

/**
 * Determine block level based on student's KC proficiency
 * Uses minimum level (weakest KC) to ensure practice on weak areas
 * For blocks without KCs (e.g., fallback), use student's global level
 */
function determineBlockLevel(studentId: string, block: CodeBlock): number {
  const students = loadStudents();
  const student = students[studentId];

  if (!student || !student.kcLevels) {
    return 1; // Default to Level 1
  }

  if (block.kcs.length === 0) {
    // No KCs (e.g., fallback parsing) - use student's global level
    // For test accounts (lv1/lv2/lv3), all KC levels are unified
    // So we can use any KC level as the global level
    const globalLevel = student.level || Object.values(student.kcLevels)[0] || 1;
    console.log(`📌 Block has no KCs - using student global level: ${globalLevel}`);
    return globalLevel;
  }

  // Get average level from all KCs in this block (rounded)
  const levels = block.kcs.map(kc => student.kcLevels[kc.id] || 1);
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  return Math.round(average);
}

/**
 * Split semantic blocks into line-by-line blocks
 * Each line inherits the KC information and type from its parent block
 * Removes duplicate lines based on code content (prevents "if s == 1:" appearing twice)
 */
function splitBlocksIntoLines(blocks: CodeBlock[]): CodeBlock[] {
  const lineBlocks: CodeBlock[] = [];
  const seenCodeContent = new Set<string>(); // Track code content to prevent duplicates

  blocks.forEach(block => {
    const lines = block.code.split('\n');
    lines.forEach((line, idx) => {
      const actualLineNumber = block.startLine + idx;
      const trimmedCode = line.trim();

      // Skip empty lines
      if (trimmedCode === '') {
        return;
      }

      // Skip if we've already seen this exact code content
      if (seenCodeContent.has(trimmedCode)) {
        return; // Skip duplicate
      }

      seenCodeContent.add(trimmedCode);
      lineBlocks.push({
        id: `L${lineBlocks.length}`,
        code: line, // Keep original indentation - auto-indent will be disabled
        type: block.type, // Inherit type from parent block
        startLine: actualLineNumber,
        endLine: actualLineNumber,
        kcs: block.kcs // Inherit KC information from parent block
      });
    });
  });

  return lineBlocks;
}

export const completeRouter = Router();

let client: Anthropic | null = null;

// Block cache: sessionId -> block data
interface BlockCacheEntry {
  blocks: CodeBlock[];
  currentIndex: number;
  fullCode: string;
  studentId: string;
  assignmentId: string;
  sessionId: string;
}

const blockCache = new Map<string, BlockCacheEntry>();

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
  // Assignment ID
  assignmentId?: string;
  // Session ID
  sessionId?: string;
  // Question mode (triggered by Shift+Escape)
  questionMode?: boolean;
  // Request next block from cache
  requestNextBlock?: boolean;
  // Clear cache (student typed different code)
  clearCache?: boolean;
}

completeRouter.post('/', async (req: Request, res: Response) => {
  const {
    prefix, suffix, language, fileName, subjectId, questionMode,
    assignmentId, sessionId, requestNextBlock, clearCache
  } = req.body as CompleteRequest;


  if (!prefix && !suffix) {
    res.json({ completion: '' });
    return;
  }

  const anthropic = getClient();
  if (!anthropic) {
    res.status(503).json({ error: 'API key not configured' });
    return;
  }

  const isQuestionMode = questionMode || false;

  try {
    // Handle cache clearing (student typed different code)
    if (clearCache && sessionId) {
      blockCache.delete(sessionId);
    }

    // QUESTION MODE: Use existing non-cached flow
    if (isQuestionMode) {
      return await handleQuestionMode(req, res, anthropic, prefix, suffix, language, fileName, subjectId);
    }

    // AUTOCOMPLETE MODE: Block-by-block caching

    // If requesting next block and cache exists
    if (requestNextBlock && sessionId && blockCache.has(sessionId)) {
      const cache = blockCache.get(sessionId)!;

      // ✅ Level 2 validation: Check if student's typed code matches cached recommendation
      const currentCachedLine = cache.blocks[cache.currentIndex];
      const expectedCode = currentCachedLine.code.trim();

      // Extract last non-empty line from prefix (student's actual typed code)
      const prefixLines = prefix.trim().split('\n').filter(line => line.trim().length > 0);
      const lastLineFromPrefix = prefixLines[prefixLines.length - 1]?.trim() || '';

      // Compare student's code with cached recommendation
      const validationResult = lastLineFromPrefix === expectedCode ? 'FOLLOW' : 'REJECT';

      if (validationResult === 'REJECT') {
        console.log(`🔄 [REJECT] Validation failed`);
        console.log(`   Expected: "${expectedCode}"`);
        console.log(`   Student typed: "${lastLineFromPrefix}"`);
        console.log(`   → Clearing cache and regenerating recommendations`);

        // Clear cache and regenerate from scratch
        blockCache.delete(sessionId);
        // Fall through to normal generation below (will create new cache)
      } else {
        // ✅ FOLLOW! Student typed the recommended code correctly

        // Move to next block
        cache.currentIndex++;

        if (cache.currentIndex >= cache.blocks.length) {
          // No more lines
          res.json({ completion: '', allBlocksCompleted: true, validationResult: 'FOLLOW' });
          return;
        }

        const nextLine = cache.blocks[cache.currentIndex];
        const blockLevel = determineBlockLevel(subjectId, nextLine);

        // Log KC info for each line
        const kcInfo = nextLine.kcs.length > 0
          ? nextLine.kcs.map(kc => `${kc.name}(${kc.id})`).join(', ')
          : 'No KCs';
        console.log(`✅ [FOLLOW] Line ${cache.currentIndex + 1}/${cache.blocks.length}: "${nextLine.code.trim()}"`);
        console.log(`   KCs: ${kcInfo}`);
        console.log(`   Level: ${blockLevel} (Student: ${subjectId})`);

        // If Level 2, signal client to disable autocomplete
        const shouldDisable = blockLevel === 2;
        if (shouldDisable) {
          console.log(`   ⚠️ Level 2 detected - client will disable autocomplete`);
        }

        res.json({
          completion: nextLine.code,
          subjectId,
          timestamp: new Date().toISOString(),
          blockIndex: cache.currentIndex,
          totalBlocks: cache.blocks.length,
          blockLevel,
          disableAutocomplete: shouldDisable,
          validationResult: 'FOLLOW',  // ✨ 추가
        });
        return;
      }
      // If mismatch, cache was deleted and we fall through to regeneration below
    }

    // Check if cache exists for this session
    if (sessionId && blockCache.has(sessionId) && !requestNextBlock) {
      // Return current line (not moving index)
      const cache = blockCache.get(sessionId)!;
      const currentLine = cache.blocks[cache.currentIndex];
      const blockLevel = determineBlockLevel(subjectId, currentLine);

      // Log KC info for current line (cache hit)
      const kcInfo = currentLine.kcs.length > 0
        ? currentLine.kcs.map(kc => `${kc.name}(${kc.id})`).join(', ')
        : 'No KCs';
      console.log(`🔄 [CACHE] Line ${cache.currentIndex + 1}/${cache.blocks.length}: "${currentLine.code.trim()}"`);
      console.log(`   KCs: ${kcInfo}`);
      console.log(`   Level: ${blockLevel} (Student: ${subjectId})`);

      // If Level 2, signal client to disable autocomplete
      const shouldDisable = blockLevel === 2;
      if (shouldDisable) {
        console.log(`   ⚠️ Level 2 detected - client will disable autocomplete`);
      }

      res.json({
        completion: currentLine.code,
        subjectId,
        timestamp: new Date().toISOString(),
        blockIndex: cache.currentIndex,
        totalBlocks: cache.blocks.length,
        blockLevel,
        disableAutocomplete: shouldDisable,
      });
      return;
    }

    // No cache: Generate full solution from Claude
    const prompt = buildPrompt(prefix, suffix, language, fileName);

    const maxTokens = 512;
    const response = await retryWithBackoff(async () => {
      return await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
    }, 3);

    console.log('LLM response:', JSON.stringify(response.content));
    let fullCompletion = extractCompletion(response);
    console.log('Completion before fix:', fullCompletion);

    // Fix first line based on cursor context
    const prefixLines = prefix.split('\n');
    const lastLine = prefixLines[prefixLines.length - 1];
    console.log('Prefix last line:', JSON.stringify(lastLine));
    fullCompletion = fixFirstLine(prefix, fullCompletion);
    console.log('Completion after fix:', fullCompletion);

    // Analyze with Code2Block
    // Parse full code (prefix + completion) for valid AST, but filter blocks from completion only
    const fullCode = prefix + fullCompletion;
    const prefixLineCount = prefix.split('\n').length;

    console.log('=== FULL CODE FOR PARSING ===');
    console.log(fullCode);
    console.log('=== END FULL CODE ===');

    // Analyze with Code2Block
    // LLM analyzes fullCode for accurate KC detection (needs context)
    const fullAnalysis = await code2BlockAnalyzer.analyze(fullCode);

    // Filter blocks that belong to the completion (startLine >= prefixLineCount)
    const completionBlocks = fullAnalysis.blocks.filter(block => block.startLine >= prefixLineCount);

    let lineBlocks: CodeBlock[] = [];

    // If parsing failed (no blocks extracted), return error to disable autocomplete
    if (completionBlocks.length === 0) {
      console.log('⚠️ Code2Block parsing returned no blocks (likely invalid syntax)');
      console.log('🚫 Disabling autocomplete due to parsing failure');

      return res.json({
        success: false,
        error: 'PARSING_FAILED',
        message: 'Code contains syntax errors. Autocomplete disabled.',
        completion: ''
      });
    }

    // Normal case: blocks were successfully extracted
    lineBlocks = splitBlocksIntoLines(completionBlocks);

    // Store in cache if sessionId provided
    if (sessionId && assignmentId && lineBlocks.length > 0) {
      blockCache.set(sessionId, {
        blocks: lineBlocks,
        currentIndex: 0,
        fullCode: fullCompletion,
        studentId: subjectId,
        assignmentId,
        sessionId,
      });

      // Return first line
      const firstLine = lineBlocks[0];
      const blockLevel = determineBlockLevel(subjectId, firstLine);

      // Log KC info for first line (new generation)
      const kcInfo = firstLine.kcs.length > 0
        ? firstLine.kcs.map(kc => `${kc.name}(${kc.id})`).join(', ')
        : 'No KCs';
      console.log(`🆕 [NEW] Line 1/${lineBlocks.length}: "${firstLine.code.trim()}"`);
      console.log(`   KCs: ${kcInfo}`);
      console.log(`   Level: ${blockLevel} (Student: ${subjectId})`);

      // If Level 2, signal client to disable autocomplete
      const shouldDisable = blockLevel === 2;
      if (shouldDisable) {
        console.log(`   ⚠️ Level 2 detected - client will disable autocomplete`);
      }

      res.json({
        completion: firstLine.code,
        subjectId,
        timestamp: new Date().toISOString(),
        blockIndex: 0,
        totalBlocks: lineBlocks.length,
        blockLevel,
        disableAutocomplete: shouldDisable,
      });
    } else {
      // No sessionId: return full completion (fallback)
      res.json({
        completion: fullCompletion,
        subjectId,
        timestamp: new Date().toISOString(),
      });
    }

  } catch (error: any) {
    console.error('LLM completion error:', error.message, error.status, error.error);
    res.status(500).json({ error: 'Completion failed' });
  }
});

// Helper: Handle question mode (non-cached)
async function handleQuestionMode(
  req: Request,
  res: Response,
  anthropic: Anthropic,
  prefix: string,
  suffix: string,
  language: string,
  fileName: string,
  subjectId: string
) {
  const prompt = buildQuestionPrompt(prefix, suffix, language, fileName);

  const response = await retryWithBackoff(async () => {
    return await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
  }, 3);

  let completion = extractCompletion(response);
  completion = fixFirstLine(prefix, completion);

  res.json({
    completion,
    subjectId,
    timestamp: new Date().toISOString(),
  });
}

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
7. NEVER output duplicate lines - each line must be unique and appear only once in your output

IMPORTANT: If the cursor is in the middle of a line (e.g., "if " is already typed),
complete ONLY the rest of that line, then continue with new lines.
DO NOT repeat the partial line that's already written.

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
        return '';  // Return empty if LLM is explaining instead of coding
      }
    }

    // If response starts with explanatory text (sentences), reject it
    if (/^[A-Z][a-z\s]{10,}/.test(text)) {
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

  // If prefix last line has only spaces (indent only, not completely empty), remove leading spaces from first line
  // Example: lastLine = "        " (8 spaces), completion = "        return [...]"
  // → Remove leading spaces to avoid double indent
  if (lastLine !== '' && lastLine.trim() === '') {
    // Cursor is at indent-only line - remove leading spaces from first line only
    const firstLineWithoutSpaces = lines[0].trimStart();
    const restLines = lines.slice(1).join('\n');
    return restLines ? `${firstLineWithoutSpaces}\n${restLines}` : firstLineWithoutSpaces;
  }

  // If prefix last line has code, keep completion as-is
  return completion;
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
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
