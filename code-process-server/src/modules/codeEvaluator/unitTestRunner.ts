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

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `gt_code_${Date.now()}.py`);

  try {
    const wrappedCode = wrapCodeWithTimer(gtCode);
    fs.writeFileSync(tempFile, wrappedCode, 'utf-8');

    for (let idx = 0; idx < testCases.length; idx++) {
      const test = testCases[idx];
      const testTimeout = 30000; // 30 seconds max for GT

      try {
        const result = await runSingleStdinTest(tempFile, test, testTimeout);
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

    // Clean up
    try {
      fs.unlinkSync(tempFile);
    } catch (err) {
      // Ignore
    }

    return { executionTimes, memoryUsages };

  } catch (error: any) {
    console.error(`[GT Measurement] Error: ${error.message}`);
    return {
      executionTimes: testCases.map(() => 0),
      memoryUsages: testCases.map(() => 0)
    };
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

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `code_${Date.now()}.py`);

  try {
    // Wrap student code with time measurement
    const wrappedCode = wrapCodeWithTimer(code);
    fs.writeFileSync(tempFile, wrappedCode, 'utf-8');

    const STUDENT_RUNS = 30;
    const STUDENT_OUTLIERS = 5;

    // Run each test case separately
    for (let idx = 0; idx < testCases.length; idx++) {
      const test = testCases[idx];
      console.log(`      → Test ${idx + 1}/${testCases.length}: ${test.name} (${STUDENT_RUNS} runs)`);

      // Dynamic time limit: GT execution time * 2
      const gtTime = test.gtExecutionTime || 0;
      const dynamicTimeout = gtTime > 0
        ? gtTime * 2
        : 5000; // fallback to 5 seconds if GT time not available

      const testTimeout = test.timeout || dynamicTimeout;
      console.log(`        Time limit: ${testTimeout.toFixed(0)}ms (GT: ${gtTime.toFixed(2)}ms)`);

      // Run 30 times to get stable measurements
      const times: number[] = [];
      const memories: number[] = [];
      let output = '';
      let lastError = '';
      let success = false;

      try {
        for (let run = 0; run < STUDENT_RUNS; run++) {
          const result = await runSingleStdinTest(tempFile, test, testTimeout);

          if (!result.success) {
            // If any run fails, stop and report failure
            lastError = result.error || 'Unknown error';
            success = false;
            break;
          }

          if (run === 0) {
            output = result.output || '';
          }

          times.push(result.executionTime || 0);
          memories.push(result.peakMemory || 0);
          success = true;
        }

        if (!success) {
          // Test failed
          results.passed = false;
          results.errors.push(`${test.name}: ${lastError}`);
          results.failedTests.push(test);
          results.executionTimes.push(0);
          results.gtExecutionTimes.push(test.gtExecutionTime || 0);
          results.memoryUsages.push(0);
          results.gtMemoryUsages.push(test.gtMemoryUsage || 0);
          console.log(`        ✗ Failed: ${lastError}`);
          continue;
        }

        // Remove outliers and calculate average
        const filteredTimes = removeOutliers(times, STUDENT_OUTLIERS);
        const filteredMemories = removeOutliers(memories, STUDENT_OUTLIERS);

        const avgTime = filteredTimes.reduce((sum, t) => sum + t, 0) / filteredTimes.length;
        const avgMemory = filteredMemories.reduce((sum, m) => sum + m, 0) / filteredMemories.length;

        results.executionTimes.push(avgTime);
        results.gtExecutionTimes.push(test.gtExecutionTime || 0);
        results.memoryUsages.push(avgMemory);
        results.gtMemoryUsages.push(test.gtMemoryUsage || 0);

        if (output !== undefined) {
          // Compare output (trim whitespace for comparison)
          const actualOutput = output.trim();
          const expectedOutput = String(test.expectedOutput).trim();

          if (actualOutput === expectedOutput) {
            results.passedTests++;
            console.log(`        ✓ Passed (avg ${avgTime.toFixed(2)}ms, avg ${(avgMemory / 1024).toFixed(2)}KB)`);
          } else {
            results.passed = false;
            results.failedTests.push({
              name: test.name,
              input: test.input,
              expectedOutput: test.expectedOutput,
              actualOutput: actualOutput
            } as any);
            console.log(`        ✗ Failed (output mismatch)`);
          }
        } else {
          results.passed = false;
          results.errors.push(`${test.name}: ${lastError}`);
          results.failedTests.push(test);
          results.executionTimes.push(0);
          results.gtExecutionTimes.push(test.gtExecutionTime || 0);
          results.memoryUsages.push(0);
          results.gtMemoryUsages.push(test.gtMemoryUsage || 0);
          console.log(`        ✗ Error: ${lastError}`);
        }
      } catch (error: any) {
        results.passed = false;
        results.errors.push(`${test.name}: ${error.message}`);
        results.failedTests.push(test);
        results.gtExecutionTimes.push(test.gtExecutionTime || 0);
        console.log(`        ✗ Error: ${error.message}`);
      }
    }

    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (err) {
      // Ignore cleanup errors
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
  }
}

/**
 * Wraps Python code with execution time and memory measurement
 * Time and memory are measured internally in Python and output to stderr
 */
function wrapCodeWithTimer(code: string): string {
  return `import time
import sys
import tracemalloc

# Increase recursion limit for large inputs
sys.setrecursionlimit(1000000)

# Start memory tracking
tracemalloc.start()
__start_time__ = time.perf_counter()

# ===== Student code starts here =====
${code}
# ===== Student code ends here =====

__end_time__ = time.perf_counter()
__current_mem__, __peak_mem__ = tracemalloc.get_traced_memory()
tracemalloc.stop()

sys.stderr.write(f"__EXECUTION_TIME__:{(__end_time__ - __start_time__) * 1000}\\n")
sys.stderr.write(f"__PEAK_MEMORY__:{__peak_mem__}\\n")
sys.stderr.flush()
`;
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
    const pythonProcess = spawn('python3', ['-u', scriptPath]);

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    // Set timeout for this test
    const timeoutHandle = setTimeout(() => {
      isTimedOut = true;
      pythonProcess.kill('SIGTERM');

      setTimeout(() => {
        if (!pythonProcess.killed) {
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
      let executionTime = 0;
      let peakMemory = 0;
      let cleanedStderr = stderr;

      const timeMatch = stderr.match(/__EXECUTION_TIME__:([\d.]+)/);
      if (timeMatch) {
        executionTime = parseFloat(timeMatch[1]);
        cleanedStderr = cleanedStderr.replace(/__EXECUTION_TIME__:[\d.]+\n?/, '');
      }

      const memoryMatch = stderr.match(/__PEAK_MEMORY__:([\d.]+)/);
      if (memoryMatch) {
        peakMemory = parseFloat(memoryMatch[1]);
        cleanedStderr = cleanedStderr.replace(/__PEAK_MEMORY__:[\d.]+\n?/, '');
      }

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
