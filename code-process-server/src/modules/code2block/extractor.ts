import { ASTNode, CodeBlock } from './types';
import { mapKnowledgeComponents } from './kcMapper';

/**
 * Extract meaningful code blocks from AST
 * Uses rule-based approach to identify logical blocks
 */
export function extractBlocks(ast: ASTNode): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let blockId = 0;

  function traverse(node: ASTNode) {
    // Skip Module and other container nodes
    if (node.type === 'Module') {
      node.children?.forEach(child => traverse(child));
      return;
    }

    // These node types represent meaningful blocks
    const blockTypes = [
      'FunctionDef',
      'If',
      'For',
      'While',
      'Return',
      'Assign',
      'AugAssign',
      'Expr'  // Expression statements (function calls, etc.)
    ];

    if (blockTypes.includes(node.type)) {
      // Determine more specific type
      let specificType = node.type;

      if (node.type === 'If') {
        specificType = 'IfStatement';
      } else if (node.type === 'For') {
        specificType = 'ForLoop';
      } else if (node.type === 'While') {
        specificType = 'WhileLoop';
      } else if (node.type === 'Assign' || node.type === 'AugAssign') {
        specificType = 'Assignment';
      } else if (node.type === 'Expr') {
        // Check if it's a function call
        if (node.code && node.code.includes('(')) {
          specificType = 'FunctionCall';
        } else {
          specificType = 'Expression';
        }
      }

      const block: CodeBlock = {
        id: `B${blockId++}`,
        code: node.code || '',
        type: specificType,
        startLine: node.startLine,
        endLine: node.endLine,
        kcs: mapKnowledgeComponents(specificType, node.code || '')
      };

      blocks.push(block);
    }

    // Continue traversing children for nested structures
    node.children?.forEach(child => traverse(child));
  }

  traverse(ast);

  return blocks;
}

/**
 * Merge small blocks that belong together
 * For example: variable assignment followed by its usage
 */
export function mergeRelatedBlocks(blocks: CodeBlock[]): CodeBlock[] {
  // Simple implementation: return as-is for now
  // Can be enhanced later to merge related blocks
  return blocks;
}
