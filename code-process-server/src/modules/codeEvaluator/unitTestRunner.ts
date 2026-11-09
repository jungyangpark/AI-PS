import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Remove outliers from array (removes top and bottom N values)
 */
function removeOutliers(values: number[], removeCount: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.slice(removeCount, sorted.length - removeCount);
}

/** Mean after trimming outliers, only when there are enough samples to trim. */
function trimmedMean(values: number[], removeCount: number): number {
  if (values.length === 0) { return 0; }
  const filtered = values.length > removeCount * 2 ? removeOutliers(values, removeCount) : values;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

/** Compare outputs ignoring trailing whitespace on each line and CRLF vs LF. */
function normalizeOutput(s: string): string {
  return s.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trim();
}

/** Write code into its own fresh temp folder (unique even for simultaneous submissions). */
function writeTempScript(prefix: string, code: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aips-${prefix}-`));
  const file = path.join(dir, 'main.py');
  fs.writeFileSync(file, code, 'utf-8');
  return { dir, file };
}

function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

export interface UnitTestCase {
  name: string;
  input: any; // Can be string (for stdin) or array (for function args)
  expectedOutput: any;
  timeout?: number; // milliseconds
  gtExecutionTime?: number; // GT code execution time in milliseconds (averaged)
  gtMemoryUsage?: number; // GT code peak memory usage in bytes (averaged)
}

export interface UnitTestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: UnitTestCase[];
  errors: string[];
  executionTimes: number[]; // Student execution time for each test in ms
  gtExecutionTimes: number[]; // GT execution time for each test in ms
  memoryUsages: number[]; // Student peak memory usage for each test in bytes
  gtMemoryUsages: number[]; // GT peak memory usage for each test in bytes
}

/**
 * Measure GT code execution times and memory usage for all test cases
 * @param gtCodePath - Path to GT code file
 * @param testCases - Array of test cases
 * @returns Object with execution times and memory usages
 */
export async function measureGTExecutionTimes(
  gtCodePath: string,
  testCases: UnitTestCase[]
): Promise<{ executionTimes: number[]; memoryUsages: number[] }> {
  if (!fs.existsSync(gtCodePath)) {
    console.warn(`[GT Measurement] GT code not found: ${gtCodePath}`);
    return {
      executionTimes: testCases.map(() => 0),
      memoryUsages: testCases.map(() => 0)
    };
  }

  console.log(`   [GT Measurement] Running GT code for ${testCases.length} test cases...`);

  const gtCode = fs.readFileSync(gtCodePath, 'utf-8');
  const executionTimes: number[] = [];
  const memoryUsages: number[] = [];

  let tempDir = '';
  try {
    const temp = writeTempScript('gt', wrapCodeWithTimer(gtCode));
    tempDir = temp.dir;

    for (let idx = 0; idx < testCases.length; idx++) {
      const test = testCases[idx];
      const testTimeout = 30000; // 30 seconds max for GT

      try {
        const result = await runSingleStdinTest(temp.file, test, testTimeout);
        const executionTime = result.executionTime || 0;
        const peakMemory = result.peakMemory || 0;
        executionTimes.push(executionTime);
        memoryUsages.push(peakMemory);
        console.log(`      → GT Test ${idx + 1}: ${executionTime.toFixed(2)}ms, ${(peakMemory / 1024).toFixed(2)}KB`);
      } catch (error: any) {
        console.warn(`      → GT Test ${idx + 1} failed: ${error.message}`);
        executionTimes.push(0);
        memoryUsages.push(0);
      }
    }

    return { executionTimes, memoryUsages };

  } catch (error: any) {
    console.error(`[GT Measurement] Error: ${error.message}`);
    return {
      executionTimes: testCases.map(() => 0),
      memoryUsages: testCases.map(() => 0)
    };
  } finally {
    if (tempDir) { removeTempDir(tempDir); }
  }
}

/**
 * Runs unit tests against submitted Python code using stdin/stdout
 * @param code - The Python code to test
 * @param testCases - Array of test cases (with gtExecutionTime set)
 * @returns Promise with test results
 */
export async function runPythonUnitTests(
  code: string,
  testCases: UnitTestCase[]
): Promise<UnitTestResult> {
  const results: UnitTestResult = {
    passed: true,
    totalTests: testCases.length,
    passedTests: 0,
    failedTests: [],
    errors: [],
    executionTimes: [],
    gtExecutionTimes: [],
    memoryUsages: [],
    gtMemoryUsages: []
  };

  let tempDir = '';
  try {
    // Wrap student code with time measurement
    const temp = writeTempScript('student', wrapCodeWithTimer(code));
    tempDir = temp.dir;
    const tempFile = temp.file;

    // Correctness is decided by the first run. Only a passing test is re-run, to get a
    // stable time/memory average, and those extra runs share a small time budget.
    const STUDENT_RUNS = 30;
    const STUDENT_OUTLIERS = 5;
    const EXTRA_RUNS_BUDGET_MS = 5000;

    // Run each test case separately
    for (let idx = 0; idx < testCases.length; idx++) {
      const test = testCases[idx];
      console.log(`      → Test ${idx + 1}/${testCases.length}: ${test.name}`);

      // Safety timeout to prevent infinite loops
      const testTimeout = test.timeout || 30000;

      try {
        const first = await runSingleStdinTest(tempFile, test, testTimeout);

        if (!first.success) {
          results.passed = false;
          results.errors.push(`${test.name}: ${first.error || 'Unknown error'}`);
          results.failedTests.push(test);
          results.executionTimes.push(first.executionTime || 0);
          results.gtExecutionTimes.push(test.gtExecutionTime || 0);
          results.memoryUsages.push(first.peakMemory || 0);
          results.gtMemoryUsages.push(test.gtMemoryUsage || 0);
          console.log(`        ✗ Failed: ${first.error}`);
          console.log(`        Skipping remaining tests due to failure.`);
          break; // Stop testing remaining test cases
        }

        const actualOutput = normalizeOutput(first.output || '');
        const expectedOutput = normalizeOutput(String(test.expectedOutput));

        if (actualOutput !== expectedOutput) {
          results.passed = false;
          results.failedTests.push({
            name: test.name,
            input: test.input,
            expectedOutput: test.expectedOutput,
            actualOutput: actualOutput
          } as any);
          results.executionTimes.push(first.executionTime || 0);
          results.gtExecutionTimes.push(test.gtExecutionTime || 0);
          results.memoryUsages.push(first.peakMemory || 0);
          results.gtMemoryUsages.push(test.gtMemoryUsage || 0);
          console.log(`        ✗ Failed (output mismatch)`);
          break; // Stop testing remaining test cases on output mismatch too
        }

        // Passed: collect more timing samples within the budget.
        const times: number[] = [first.executionTime || 0];
        const memories: number[] = [first.peakMemory || 0];
        const budgetStart = Date.now();
        while (times.length < STUDENT_RUNS && Date.now() - budgetStart < EXTRA_RUNS_BUDGET_MS) {
          const r = await runSingleStdinTest(tempFile, test, testTimeout);
          if (!r.success) { break; } // keep the verdict from the first run
          times.push(r.executionTime || 0);
          memories.push(r.peakMemory || 0);
        }

        const avgTime = trimmedMean(times, STUDENT_OUTLIERS);
        const avgMemory = trimmedMean(memories, STUDENT_OUTLIERS);

        results.executionTimes.push(avgTime);
        results.gtExecutionTimes.push(test.gtExecutionTime || 0);
        results.memoryUsages.push(avgMemory);
        results.gtMemoryUsages.push(test.gtMemoryUsage || 0);

        // Time-complexity limit (avg > GT * 2) disabled: only correctness is graded now.
        results.passedTests++;
        console.log(`        ✓ Passed (avg ${avgTime.toFixed(2)}ms over ${times.length} runs, avg ${(avgMemory / 1024).toFixed(2)}KB)`);
      } catch (error: any) {
        results.passed = false;
        results.errors.push(`${test.name}: ${error.message}`);
        results.failedTests.push(test);
        results.gtExecutionTimes.push(test.gtExecutionTime || 0);
        console.log(`        ✗ Error: ${error.message}`);
        break;
      }
    }

    return results;

  } catch (error: any) {
    return {
      passed: false,
      totalTests: testCases.length,
      passedTests: 0,
      failedTests: testCases,
      errors: [`Error preparing tests: ${error.message}`],
      executionTimes: [],
      gtExecutionTimes: [],
      memoryUsages: [],
      gtMemoryUsages: []
    };
  } finally {
    if (tempDir) { removeTempDir(tempDir); }
  }
}

/**
 * Wraps Python code with execution time and memory measurement
 * Time and memory are measured internally in Python and output to stderr.
 *
 * - `import time` / `import sys` stay visible to the student code (as before), but the
 *   measurement itself uses private aliases, so a student variable named `time` or `sys`
 *   can no longer break grading.
 * - `from __future__ import ...` lines must be the first statements, so they are hoisted.
 */
function wrapCodeWithTimer(code: string): string {
  const futureLines: string[] = [];
  const bodyLines = code.split('\n').map(line => {
    if (/^from\s+__future__\s+import\s+/.test(line)) {
      futureLines.push(line);
      return ''; // keep line count
    }
    return line;
  });

  return `${futureLines.join('\n')}
import time
import sys
import time as __aips_time
import sys as __aips_sys
import tracemalloc as __aips_tracemalloc

# Increase recursion limit for large inputs
__aips_sys.setrecursionlimit(1000000)

# Prompts written by input("...") are not part of the graded output: read the line, drop the prompt
import builtins as __aips_builtins
__aips_real_input = __aips_builtins.input
def __aips_input(prompt=''):
    return __aips_real_input()
__aips_builtins.input = __aips_input

# Start memory tracking
__aips_tracemalloc.start()
__aips_start_time = __aips_time.perf_counter()

# ===== Student code starts here =====
${bodyLines.join('\n')}
# ===== Student code ends here =====

__aips_end_time = __aips_time.perf_counter()
__aips_current_mem, __aips_peak_mem = __aips_tracemalloc.get_traced_memory()
__aips_tracemalloc.stop()

__aips_sys.stderr.write(f"__EXECUTION_TIME__:{(__aips_end_time - __aips_start_time) * 1000}\\n")
__aips_sys.stderr.write(f"__PEAK_MEMORY__:{__aips_peak_mem}\\n")
__aips_sys.stderr.flush()
`;
}

/** Value of the LAST "<marker>:<number>" line (student output printed earlier cannot fake it). */
function lastMarker(stderr: string, marker: string): number {
  const matches = [...stderr.matchAll(new RegExp(`${marker}:([\\d.]+)`, 'g'))];
  return matches.length ? parseFloat(matches[matches.length - 1][1]) : 0;
}

/**
 * Run a single test case with stdin input
 */
function runSingleStdinTest(
  scriptPath: string,
  testCase: UnitTestCase,
  timeout: number
): Promise<{ success: boolean; output?: string; executionTime?: number; peakMemory?: number; error?: string }> {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', ['-u', scriptPath], { cwd: path.dirname(scriptPath) });

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    // Set timeout for this test
    const timeoutHandle = setTimeout(() => {
      isTimedOut = true;
      pythonProcess.kill('SIGTERM');

      // `killed` turns true as soon as SIGTERM is sent, so check whether it actually exited.
      setTimeout(() => {
        if (pythonProcess.exitCode === null && pythonProcess.signalCode === null) {
          pythonProcess.kill('SIGKILL');
        }
      }, 1000);
    }, timeout);

    pythonProcess.stdout.on('data', (data) => {
      try {
        stdout += data.toString();
      } catch (e) {
        // RangeError: Invalid string length (only for extreme cases)
        // Keep whatever we have so far and stop collecting
        console.error('[UNIT TEST] stdout RangeError - output too large, stopping collection');
        pythonProcess.stdout.removeAllListeners('data');
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      try {
        stderr += data.toString();
      } catch (e) {
        console.error('[UNIT TEST] stderr RangeError - output too large, stopping collection');
        pythonProcess.stderr.removeAllListeners('data');
      }
    });

    pythonProcess.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);

      if (isTimedOut) {
        resolve({
          success: false,
          error: `Timeout (exceeded ${timeout}ms). Your code may be too slow or have an infinite loop.`
        });
        return;
      }

      // Extract execution time and peak memory from stderr
      const executionTime = lastMarker(stderr, '__EXECUTION_TIME__');
      const peakMemory = lastMarker(stderr, '__PEAK_MEMORY__');
      const cleanedStderr = stderr
        .replace(/__EXECUTION_TIME__:[\d.]+\n?/g, '')
        .replace(/__PEAK_MEMORY__:[\d.]+\n?/g, '');

      if (exitCode !== 0) {
        resolve({
          success: false,
          error: cleanedStderr || `Process exited with code ${exitCode}`
        });
        return;
      }

      resolve({
        success: true,
        output: stdout,
        executionTime,
        peakMemory
      });
    });

    pythonProcess.on('error', (error) => {
      clearTimeout(timeoutHandle);
      resolve({
        success: false,
        error: `Failed to run Python: ${error.message}`
      });
    });

    // If the program exits without reading all of stdin, writing raises EPIPE.
    // Without a listener that error would crash the whole server.
    pythonProcess.stdin.on('error', () => { /* ignored; the exit code tells the story */ });

    // Write input to stdin
    if (testCase.input !== undefined && testCase.input !== null) {
      const inputStr = typeof testCase.input === 'string'
        ? testCase.input
        : String(testCase.input);
      pythonProcess.stdin.write(inputStr);
    }
    pythonProcess.stdin.end();
  });
}
