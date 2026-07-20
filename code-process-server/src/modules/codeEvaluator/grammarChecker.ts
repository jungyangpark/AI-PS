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
    // Create temporary file to check syntax
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `syntax_check_${Date.now()}.py`);

    try {
      fs.writeFileSync(tempFile, code, 'utf-8');

      // Use python -m py_compile to check syntax
      // -u flag for unbuffered output
      const pythonProcess = spawn('python3', ['-u', '-m', 'py_compile', tempFile]);

      let stderr = '';

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (exitCode) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
          // Also remove .pyc file if created
          const pycFile = tempFile + 'c';
          if (fs.existsSync(pycFile)) {
            fs.unlinkSync(pycFile);
          }
        } catch (err) {
          // Ignore cleanup errors
        }

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
            .map(line => line.replace(tempFile, 'your code'));

          resolve({
            isValid: false,
            errors
          });
        }
      });

      pythonProcess.on('error', (error) => {
        // Clean up on error
        try {
          fs.unlinkSync(tempFile);
        } catch (err) {
          // Ignore
        }

        resolve({
          isValid: false,
          errors: [`Failed to check syntax: ${error.message}`]
        });
      });

    } catch (error: any) {
      resolve({
        isValid: false,
        errors: [`Error preparing syntax check: ${error.message}`]
      });
    }
  });
}
