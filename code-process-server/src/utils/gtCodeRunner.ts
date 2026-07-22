import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Wraps Python code with execution time measurement
 */
function wrapCodeWithTimer(code: string): string {
  return `import time
import sys

__start_time__ = time.perf_counter()

# ===== GT code starts here =====
${code}
# ===== GT code ends here =====

__end_time__ = time.perf_counter()
sys.stderr.write(f"__EXECUTION_TIME__:{(__end_time__ - __start_time__) * 1000}\\n")
sys.stderr.flush()
`;
}

/**
 * Executes GT (Ground Truth) code with given input and returns output
 * @param gtCodePath - Path to the GT Python code file
 * @param input - Input string to pass via stdin
 * @param timeout - Timeout in milliseconds (default 10 seconds)
 * @returns Promise with output, execution time, or error
 */
export async function executeGTCode(
  gtCodePath: string,
  input: string,
  timeout: number = 10000
): Promise<{ success: boolean; output?: string; executionTime?: number; error?: string }> {
  return new Promise((resolve) => {
    // Check if file exists
    if (!fs.existsSync(gtCodePath)) {
      resolve({
        success: false,
        error: `GT code file not found: ${gtCodePath}`
      });
      return;
    }

    // Read GT code and wrap with timer
    const gtCode = fs.readFileSync(gtCodePath, 'utf-8');
    const wrappedCode = wrapCodeWithTimer(gtCode);

    // Write to temp file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `gt_${Date.now()}_${path.basename(gtCodePath)}`);
    fs.writeFileSync(tempFile, wrappedCode, 'utf-8');

    const pythonProcess = spawn('python3', ['-u', tempFile]);

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    // Set timeout
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

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (err) {
        // Ignore cleanup errors
      }

      if (isTimedOut) {
        resolve({
          success: false,
          error: `GT code execution timeout (exceeded ${timeout}ms)`
        });
        return;
      }

      // Extract execution time from stderr
      let executionTime = 0;
      let cleanedStderr = stderr;
      const timeMatch = stderr.match(/__EXECUTION_TIME__:([\d.]+)/);
      if (timeMatch) {
        executionTime = parseFloat(timeMatch[1]);
        // Remove time marker from stderr
        cleanedStderr = stderr.replace(/__EXECUTION_TIME__:[\d.]+\n?/, '');
      }

      if (exitCode !== 0) {
        resolve({
          success: false,
          error: `GT code failed: ${cleanedStderr || `Exit code ${exitCode}`}`
        });
        return;
      }

      resolve({
        success: true,
        output: stdout.trim(),
        executionTime
      });
    });

    pythonProcess.on('error', (error) => {
      clearTimeout(timeoutHandle);
      resolve({
        success: false,
        error: `Failed to run GT code: ${error.message}`
      });
    });

    // Write input to stdin
    if (input) {
      pythonProcess.stdin.write(input);
    }
    pythonProcess.stdin.end();
  });
}

/**
 * Generates expected outputs for all test cases using GT code
 * @param gtCodePath - Path to GT code file
 * @param testInputs - Array of test input strings
 * @returns Promise with array of outputs and execution times or error
 */
export async function generateExpectedOutputs(
  gtCodePath: string,
  testInputs: string[]
): Promise<{ success: boolean; outputs?: string[]; executionTimes?: number[]; error?: string }> {
  const outputs: string[] = [];
  const executionTimes: number[] = [];

  for (let i = 0; i < testInputs.length; i++) {
    console.log(`   Generating output ${i + 1}/${testInputs.length}...`);

    const result = await executeGTCode(gtCodePath, testInputs[i]);

    if (!result.success) {
      return {
        success: false,
        error: `Failed to generate output for test ${i + 1}: ${result.error}`
      };
    }

    outputs.push(result.output!);
    executionTimes.push(result.executionTime!);
    console.log(`     ✓ Generated (${result.executionTime}ms)`);
  }

  return {
    success: true,
    outputs,
    executionTimes
  };
}
