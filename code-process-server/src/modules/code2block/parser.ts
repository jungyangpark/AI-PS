import { exec } from 'child_process';
import { promisify } from 'util';
import { ASTNode } from './types';

const execAsync = promisify(exec);

/**
 * Parse Python code using Python's ast module
 * Returns a simplified AST structure
 */
export async function parsePythonAST(code: string): Promise<ASTNode> {
  // Python script to parse AST and output JSON
  const pythonScript = `
import ast
import json
import sys

code = '''${code.replace(/'/g, "\\'")}'''

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

  try {
    const { stdout, stderr } = await execAsync(`python3 -c "${pythonScript.replace(/"/g, '\\"')}"`);

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
