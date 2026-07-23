import Anthropic from '@anthropic-ai/sdk';
import { KC_NAME_TO_ID, KC_ID_TO_NAME } from '../studentEvaluation/kcMapping';
import { spawn } from 'child_process';

let client: Anthropic | null = null;

interface PreprocessResult {
  cleanedCode: string;
  lineMapping: Map<number, number>; // cleaned line -> original line
}

/**
 * Preprocess Python code: remove docstrings and comments
 * Returns cleaned code and line mapping (cleaned line number -> original line number)
 */
async function preprocessCode(code: string): Promise<PreprocessResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import sys
import ast
import json

code = """${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""

try:
    lines = code.split('\\n')
    tree = ast.parse(code)

    # Track which lines to keep
    lines_to_keep = set()

    def visit_node(node, parent=None, is_first_stmt=False):
        # Skip docstrings (first statement that is a constant string)
        if is_first_stmt and isinstance(node, ast.Expr):
            if isinstance(node.value, (ast.Str, ast.Constant)):
                if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                    return  # Skip docstring
                elif isinstance(node.value, ast.Str):
                    return  # Skip docstring

        # Add line numbers for this node
        if hasattr(node, 'lineno'):
            lines_to_keep.add(node.lineno)
        if hasattr(node, 'end_lineno') and node.end_lineno:
            for i in range(node.lineno, node.end_lineno + 1):
                lines_to_keep.add(i)

        # Recursively visit children
        for child in ast.iter_child_nodes(node):
            visit_node(child, node, False)

    # Visit module body
    for i, stmt in enumerate(tree.body):
        visit_node(stmt, tree, i == 0)

    # Build cleaned code and mapping
    cleaned_lines = []
    line_mapping = {}  # cleaned_line_num -> original_line_num

    for original_line_num in sorted(lines_to_keep):
        if 1 <= original_line_num <= len(lines):
            line_content = lines[original_line_num - 1]
            # Remove inline comments
            if '#' in line_content:
                code_part = line_content.split('#')[0].rstrip()
                if code_part:  # Only keep if there's code before comment
                    cleaned_lines.append(code_part)
                    line_mapping[len(cleaned_lines)] = original_line_num
            else:
                cleaned_lines.append(line_content)
                line_mapping[len(cleaned_lines)] = original_line_num

    result = {
        'cleanedCode': '\\n'.join(cleaned_lines),
        'lineMapping': line_mapping
    }
    print(json.dumps(result))

except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

    const pythonProcess = spawn('python3', ['-c', pythonScript]);
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (exitCode) => {
      if (exitCode !== 0) {
        console.error('[LLM KC Mapper] Preprocessing failed:', stderr);
        // Fallback: use original code
        const lineMapping = new Map<number, number>();
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
          lineMapping.set(i + 1, i + 1);
        }
        resolve({ cleanedCode: code, lineMapping });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          console.error('[LLM KC Mapper] Preprocessing error:', result.error);
          // Fallback
          const lineMapping = new Map<number, number>();
          const lines = code.split('\n');
          for (let i = 0; i < lines.length; i++) {
            lineMapping.set(i + 1, i + 1);
          }
          resolve({ cleanedCode: code, lineMapping });
          return;
        }

        const lineMapping = new Map<number, number>();
        for (const [cleanedLine, originalLine] of Object.entries(result.lineMapping)) {
          lineMapping.set(parseInt(cleanedLine), originalLine as number);
        }

        resolve({
          cleanedCode: result.cleanedCode,
          lineMapping
        });

      } catch (error: any) {
        console.error('[LLM KC Mapper] Failed to parse preprocessing result:', error.message);
        // Fallback
        const lineMapping = new Map<number, number>();
        const lines = code.split('\n');
        for (let i = 0; i < lines.length; i++) {
          lineMapping.set(i + 1, i + 1);
        }
        resolve({ cleanedCode: code, lineMapping });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('[LLM KC Mapper] Failed to run Python preprocessing:', error.message);
      // Fallback
      const lineMapping = new Map<number, number>();
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        lineMapping.set(i + 1, i + 1);
      }
      resolve({ cleanedCode: code, lineMapping });
    });
  });
}

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[LLM KC Mapper] ANTHROPIC_API_KEY not set');
    return null;
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Build prompt for line-by-line KC detection
 * Returns a detailed prompt with all 27 KC definitions
 */
function buildKCDetectionPrompt(code: string): string {
  return `You are a Python code analyzer specialized in identifying Knowledge Components (KCs).

Analyze the following Python code LINE BY LINE and identify which Knowledge Components are used in EACH line.

**Available Knowledge Components (27 total):**

**입출력·기본 (4개):**
- input_str: Reading string input (e.g., input())
- input_cast: Type conversion on input (e.g., int(input()), list(map(int, input().split())))
- output: Printing output (e.g., print())
- assignment: Variable assignment (e.g., x = 5, result = [])

**제어 흐름 (5개):**
- conditional: If/elif/else statements
- loop_counting: Counting loops (e.g., for i in range(n))
- loop_until: Condition-based loops (e.g., while condition)
- loop_elements: Iterating over elements (e.g., for item in list)
- loop_nested: Nested loops (loop inside loop)

**함수 (3개):**
- function_call: Calling functions (e.g., len(), max(), custom_func())
- function_def: Defining functions (e.g., def function_name():)
- function_return: Return statements (e.g., return value)

**자료구조 (5개):**
- list: List operations (creating, indexing, slicing, appending)
- list_2d: 2D list operations (e.g., matrix[i][j])
- dictionary: Dictionary operations (creating, accessing, updating)
- set: Set operations (creating, add, remove)
- tuple: Tuple operations (creating, unpacking)

**기타 (3개):**
- stat_calculate: Statistical calculations (e.g., sum, average, min, max)
- file_read: Reading from files (e.g., open(), read(), readlines())
- file_write: Writing to files (e.g., write(), writelines())

**Algorithm-specific - Recursion (3개):**
- rec_base_case: Base case in recursion (e.g., if n == 0: return 1)
- rec_call: Recursive function call (calling itself)
- rec_convergence: Recursive parameter reduction (e.g., func(n-1), func(n//2))

**Algorithm-specific - Dynamic Programming (3개):**
- dp_memoization: Memoization/caching (e.g., dict or list to store results)
- dp_base_init: Base case initialization (e.g., dp[0] = 1)
- dp_recurrence: Recurrence relation (e.g., dp[i] = dp[i-1] + dp[i-2])

**Code to analyze:**
\`\`\`python
${code}
\`\`\`

**Instructions:**
1. Analyze EACH LINE separately
2. For each non-empty line, identify all KCs used in that line
3. Skip empty lines or comment-only lines
4. Return a JSON array where each object has: line number, code string, and KC names array
5. DO NOT include explanations, markdown, or any other text

**Output format (JSON array only):**
[
  {"line": 1, "code": "n = int(input())", "kcs": ["input_str", "input_cast", "assignment"]},
  {"line": 2, "code": "if n > 0:", "kcs": ["conditional"]},
  {"line": 3, "code": "    print(n)", "kcs": ["output"]}
]`;
}

/**
 * Line-level KC mapping
 */
export interface LineKCMapping {
  line: number;
  code: string;
  kcs: string[];  // KC names (e.g., ["input_str", "assignment"])
}

/**
 * Extract line-by-line KC mappings from LLM response
 * Expected format: [{"line": 1, "code": "...", "kcs": ["input_str", ...]}, ...]
 */
function extractLineKCMappings(response: Anthropic.Message): LineKCMapping[] {
  try {
    if (!response.content || response.content.length === 0) {
      console.warn('[LLM KC Mapper] Response has no content');
      return [];
    }

    const block = response.content[0];
    if (block.type !== 'text') {
      console.warn('[LLM KC Mapper] Response is not text type');
      return [];
    }

    let text = block.text.trim();

    console.log('[LLM KC Mapper] === RAW LLM RESPONSE ===');
    console.log(text);
    console.log('[LLM KC Mapper] === END RAW RESPONSE ===');

    // Remove markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    // Parse JSON array
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      console.warn('[LLM KC Mapper] Response is not an array:', text);
      return [];
    }

    console.log(`[LLM KC Mapper] Parsed ${parsed.length} items from LLM response`);

    // Validate each line mapping
    const validMappings: LineKCMapping[] = parsed
      .filter((item: any) => {
        const isValid = (
          typeof item === 'object' &&
          typeof item.line === 'number' &&
          typeof item.code === 'string' &&
          Array.isArray(item.kcs)
        );
        if (!isValid) {
          console.warn('[LLM KC Mapper] Invalid item:', item);
        }
        return isValid;
      })
      .map((item: any) => {
        const validKCs = item.kcs.filter((name: string) => KC_NAME_TO_ID[name] !== undefined);
        const invalidKCs = item.kcs.filter((name: string) => KC_NAME_TO_ID[name] === undefined);

        if (invalidKCs.length > 0) {
          console.warn(`[LLM KC Mapper] Line ${item.line}: Invalid KC names filtered out: [${invalidKCs.join(', ')}]`);
        }

        return {
          line: item.line,
          code: item.code,
          kcs: validKCs,
        };
      });

    return validMappings;

  } catch (error: any) {
    console.error('[LLM KC Mapper] Failed to parse response:', error.message);
    return [];
  }
}

/**
 * Analyze code line-by-line and extract KC mappings using LLM
 * @param code - Python code to analyze
 * @returns Array of line-level KC mappings
 */
export async function analyzeCodeLineByLine(code: string): Promise<LineKCMapping[]> {
  const anthropic = getClient();

  if (!anthropic) {
    console.warn('[LLM KC Mapper] API key not configured, falling back to empty KC list');
    return [];
  }

  try {
    console.log('[LLM KC Mapper] === ORIGINAL CODE ===');
    console.log(code);
    console.log('[LLM KC Mapper] === END ORIGINAL CODE ===');

    // Preprocess: remove docstrings and comments
    const { cleanedCode, lineMapping } = await preprocessCode(code);

    console.log('[LLM KC Mapper] === CLEANED CODE (for LLM) ===');
    console.log(cleanedCode);
    console.log('[LLM KC Mapper] === END CLEANED CODE ===');

    const prompt = buildKCDetectionPrompt(cleanedCode);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,  // Increased for line-by-line analysis
      messages: [{ role: 'user', content: prompt }],
    });

    const lineMappingsFromLLM = extractLineKCMappings(response);

    // Map cleaned line numbers back to original line numbers
    const lineMappings: LineKCMapping[] = lineMappingsFromLLM.map(mapping => {
      const originalLine = lineMapping.get(mapping.line) || mapping.line;
      return {
        ...mapping,
        line: originalLine
      };
    });

    console.log(`[LLM KC Mapper] Analyzed ${lineMappings.length} lines`);
    console.log('[LLM KC Mapper] === RESULTS (with original line numbers) ===');
    lineMappings.forEach(mapping => {
      console.log(`  Line ${mapping.line}: "${mapping.code}" → KCs: [${mapping.kcs.join(', ')}]`);
    });
    console.log('[LLM KC Mapper] === END RESULTS ===');

    return lineMappings;

  } catch (error: any) {
    console.error('[LLM KC Mapper] API call failed:', error.message);
    return [];
  }
}

/**
 * Line-level KC mapping with KC IDs
 */
export interface LineKCMappingWithIds {
  line: number;
  code: string;
  kcIds: string[];  // KC IDs (e.g., ["KC_001", "KC_004"])
  kcNames: string[]; // KC names (e.g., ["input_str", "assignment"])
}

/**
 * Analyze code line-by-line and return KC mappings with both IDs and names
 * @param code - Python code to analyze
 * @returns Array of line-level KC mappings with IDs
 */
export async function getLineKCMappingsWithIds(code: string): Promise<LineKCMappingWithIds[]> {
  const lineMappings = await analyzeCodeLineByLine(code);

  return lineMappings.map(mapping => ({
    line: mapping.line,
    code: mapping.code,
    kcNames: mapping.kcs,
    kcIds: mapping.kcs.map(name => KC_NAME_TO_ID[name]).filter(id => id !== undefined),
  }));
}

/**
 * Get all unique KC IDs from code (across all lines)
 * @param code - Python code to analyze
 * @returns Array of unique KC IDs (e.g., ['KC_001', 'KC_005'])
 */
export async function getKCIdsFromCode(code: string): Promise<string[]> {
  const lineMappings = await analyzeCodeLineByLine(code);

  // Collect all KC names from all lines
  const allKCNames = new Set<string>();
  lineMappings.forEach(mapping => {
    mapping.kcs.forEach(kc => allKCNames.add(kc));
  });

  // Convert to KC IDs
  const kcIds = Array.from(allKCNames)
    .map(name => KC_NAME_TO_ID[name])
    .filter(id => id !== undefined);

  return kcIds;
}

/**
 * Get all unique KC names from code (across all lines)
 * @param code - Python code to analyze
 * @returns Array of unique KC names (e.g., ['input_str', 'conditional'])
 */
export async function getKCNamesFromCode(code: string): Promise<string[]> {
  const lineMappings = await analyzeCodeLineByLine(code);

  const allKCNames = new Set<string>();
  lineMappings.forEach(mapping => {
    mapping.kcs.forEach(kc => allKCNames.add(kc));
  });

  return Array.from(allKCNames);
}
