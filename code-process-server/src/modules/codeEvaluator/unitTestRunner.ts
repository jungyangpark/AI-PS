import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface UnitTestCase {
  name: string;
  input: any; // Can be string (for stdin) or array (for function args)
  expectedOutput: any;
  timeout?: number; // milliseconds
  gtExecutionTime?: number; // GT code execution time in milliseconds
}

export interface UnitTestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: UnitTestCase[];
  errors: string[];
  executionTimes: number[]; // Student execution time for each test in ms
  gtExecutionTimes: number[]; // GT execution time for each test in ms
}

/**
 * Runs unit tests against submitted Python code using stdin/stdout
 * @param code - The Python code to test
 * @param testCases - Array of test cases
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
    gtExecutionTimes: []
  };

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `code_${Date.now()}.py`);

  try {
    // Write student code to temp file
    fs.writeFileSync(tempFile, code, 'utf-8');

    // Run each test case separately
    for (let idx = 0; idx < testCases.length; idx++) {
      const test = testCases[idx];
      console.log(`      → Test ${idx + 1}/${testCases.length}: ${test.name}`);

      const testTimeout = test.timeout || 5000; // default 5 seconds per test
      const startTime = Date.now();

      try {
        const result = await runSingleStdinTest(tempFile, test, testTimeout);
        const executionTime = Date.now() - startTime;
        results.executionTimes.push(executionTime);
        results.gtExecutionTimes.push(test.gtExecutionTime || 0);

        if (result.success && result.output !== undefined) {
          // Compare output (trim whitespace for comparison)
          const actualOutput = result.output.trim();
          const expectedOutput = String(test.expectedOutput).trim();

          if (actualOutput === expectedOutput) {
            results.passedTests++;
            console.log(`        ✓ Passed (${executionTime}ms)`);
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
          results.errors.push(`${test.name}: ${result.error}`);
          results.failedTests.push(test);
          results.gtExecutionTimes.push(test.gtExecutionTime || 0);
          console.log(`        ✗ Error: ${result.error}`);
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
      gtExecutionTimes: []
    };
  }
}

/**
 * Run a single test case with stdin input
 */
function runSingleStdinTest(
  scriptPath: string,
  testCase: UnitTestCase,
  timeout: number
): Promise<{ success: boolean; output?: string; error?: string }> {
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
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
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

      if (exitCode !== 0) {
        resolve({
          success: false,
          error: stderr || `Process exited with code ${exitCode}`
        });
        return;
      }

      resolve({
        success: true,
        output: stdout
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
