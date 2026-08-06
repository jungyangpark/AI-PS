import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Wraps Python code with execution time and memory measurement
 */
function wrapCodeWithTimer(code: string): string {
  return `import time
import sys
import tracemalloc

# Start memory tracking
tracemalloc.start()
__start_time__ = time.perf_counter()

# ===== GT code starts here =====
${code}
# ===== GT code ends here =====

__end_time__ = time.perf_counter()
__current_mem__, __peak_mem__ = tracemalloc.get_traced_memory()
tracemalloc.stop()

sys.stderr.write(f"__EXECUTION_TIME__:{(__end_time__ - __start_time__) * 1000}\\n")
sys.stderr.write(f"__PEAK_MEMORY__:{__peak_mem__}\\n")
sys.stderr.flush()
`;
}

/**
 * Executes GT (Ground Truth) code with given input and returns output
 * @param gtCodePath - Path to the GT Python code file
 * @param input - Input string to pass via stdin
 * @param timeout - Timeout in milliseconds (default 10 seconds)
 * @returns Promise with output, execution time, memory usage, or error
 */
export async function executeGTCode(
  gtCodePath: string,
  input: string,
  timeout: number = 10000
): Promise<{ success: boolean; output?: string; executionTime?: number; peakMemory?: number; error?: string }> {
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
          error: `GT code failed: ${cleanedStderr || `Exit code ${exitCode}`}`
        });
        return;
      }

      resolve({
        success: true,
        output: stdout.trim(),
        executionTime,
        peakMemory
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
 * Remove outliers from array (removes top and bottom N values)
 */
function removeOutliers(values: number[], removeCount: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.slice(removeCount, sorted.length - removeCount);
}

/**
 * Generates expected outputs for all test cases using GT code
 * Runs each test 110 times, removes top/bottom 5 outliers, averages remaining 100
 * @param gtCodePath - Path to GT code file
 * @param testInputs - Array of test input strings
 * @returns Promise with array of outputs, avg execution times, and avg memory usage or error
 */
export async function generateExpectedOutputs(
  gtCodePath: string,
  testInputs: string[]
): Promise<{ success: boolean; outputs?: string[]; executionTimes?: number[]; memoryUsages?: number[]; error?: string }> {
  const outputs: string[] = [];
  const executionTimes: number[] = [];
  const memoryUsages: number[] = [];

  const RUNS = 110;
  const OUTLIERS = 5;

  for (let i = 0; i < testInputs.length; i++) {
    console.log(`   Generating output ${i + 1}/${testInputs.length} (${RUNS} runs)...`);

    const times: number[] = [];
    const memories: number[] = [];
    let output = '';

    // Run 110 times
    for (let run = 0; run < RUNS; run++) {
      const result = await executeGTCode(gtCodePath, testInputs[i]);

      if (!result.success) {
        return {
          success: false,
          error: `Failed to generate output for test ${i + 1}, run ${run + 1}: ${result.error}`
        };
      }

      if (run === 0) {
        output = result.output!; // Use first run's output
      }

      times.push(result.executionTime!);
      memories.push(result.peakMemory!);
    }

    // Remove outliers and calculate average
    const filteredTimes = removeOutliers(times, OUTLIERS);
    const filteredMemories = removeOutliers(memories, OUTLIERS);

    const avgTime = filteredTimes.reduce((sum, t) => sum + t, 0) / filteredTimes.length;
    const avgMemory = filteredMemories.reduce((sum, m) => sum + m, 0) / filteredMemories.length;

    outputs.push(output);
    executionTimes.push(avgTime);
    memoryUsages.push(avgMemory);

    console.log(`     ✓ Generated (avg time: ${avgTime.toFixed(2)}ms, avg memory: ${(avgMemory / 1024).toFixed(2)}KB)`);
  }

  return {
    success: true,
    outputs,
    executionTimes,
    memoryUsages
  };
}
