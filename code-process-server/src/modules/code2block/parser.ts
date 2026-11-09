import { spawn } from 'child_process';
import { ASTNode } from './types';

const PARSE_TIMEOUT_MS = 10000;

// Python script that parses the code it reads from stdin (JSON string) and prints the AST as JSON.
// The student's code is never placed in a shell command or in Python source, so characters such as
// $, backticks, quotes and backslashes reach ast.parse unchanged.
const PYTHON_SCRIPT = `
import ast
import json
import sys

code = json.loads(sys.stdin.read())

try:
    tree = ast.parse(code)

    def node_to_dict(node, code_lines):
        result = {
            'type': node.__class__.__name__,
            'startLine': getattr(node, 'lineno', 0),
            'endLine': getattr(node, 'end_lineno', getattr(node, 'lineno', 0)),
            'children': []
        }

        # Extract code for this node
        if hasattr(node, 'lineno') and hasattr(node, 'end_lineno'):
            start = node.lineno - 1
            end = node.end_lineno
            result['code'] = '\\n'.join(code_lines[start:end])

        # Process children
        for child in ast.iter_child_nodes(node):
            result['children'].append(node_to_dict(child, code_lines))

        return result

    code_lines = code.split('\\n')
    ast_dict = node_to_dict(tree, code_lines)
    print(json.dumps(ast_dict))

except SyntaxError as e:
    print(json.dumps({'error': str(e), 'type': 'SyntaxError'}))
`;

function runParser(code: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', PYTHON_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`AST parsing timed out after ${PARSE_TIMEOUT_MS} ms`));
    }, PARSE_TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdin.on('error', () => { /* child exited early; reported via close/error */ });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }); });

    child.stdin.end(JSON.stringify(code));
  });
}

/**
 * Parse Python code using Python's ast module
 * Returns a simplified AST structure
 */
export async function parsePythonAST(code: string): Promise<ASTNode> {
  try {
    const { stdout, stderr } = await runParser(code);

    if (stderr) {
      console.error('Python AST parsing warning:', stderr);
    }

    const result = JSON.parse(stdout);

    if (result.error) {
      throw new Error(`Python parsing error: ${result.error}`);
    }

    return result as ASTNode;

  } catch (error) {
    console.error('Failed to parse Python code:', error);
    console.error('=== PROBLEMATIC CODE ===');
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      console.error(`${idx + 1}: ${line}`);
    });
    console.error('=== END PROBLEMATIC CODE ===');
    // Return a basic fallback structure
    return {
      type: 'Module',
      code: code,
      startLine: 1,
      endLine: code.split('\n').length,
      children: []
    };
  }
}
