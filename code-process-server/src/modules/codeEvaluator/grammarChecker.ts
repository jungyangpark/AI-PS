import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GrammarCheckResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Checks if Python code has any syntax/grammar errors
 * @param code - The Python code to check
 * @returns Promise with validation result
 */
export async function checkPythonGrammar(code: string): Promise<GrammarCheckResult> {
  return new Promise((resolve) => {
    // Each check gets its own temp folder: unique even for simultaneous submissions, and the
    // __pycache__ folder py_compile creates is removed together with it.
    let tempDir = '';
    const cleanup = () => {
      if (!tempDir) { return; }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    };

    try {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aips-syntax-'));
      const tempFile = path.join(tempDir, 'main.py');
      fs.writeFileSync(tempFile, code, 'utf-8');

      // Use python -m py_compile to check syntax
      // -u flag for unbuffered output
      const pythonProcess = spawn('python3', ['-u', '-m', 'py_compile', tempFile]);

      let stderr = '';

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (exitCode) => {
        cleanup();

        if (exitCode === 0) {
          resolve({
            isValid: true,
            errors: []
          });
        } else {
          // Parse error messages
          const errors = stderr
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.split(tempFile).join('your code'));

          resolve({
            isValid: false,
            errors
          });
        }
      });

      pythonProcess.on('error', (error) => {
        cleanup();
        resolve({
          isValid: false,
          errors: [`Failed to check syntax: ${error.message}`]
        });
      });

    } catch (error: any) {
      cleanup();
      resolve({
        isValid: false,
        errors: [`Error preparing syntax check: ${error.message}`]
      });
    }
  });
}
