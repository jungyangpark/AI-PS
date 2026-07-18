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
 * Merge blocks with same Knowledge Components
 * Consecutive blocks with identical KCs are merged into one block
 */
export function mergeRelatedBlocks(blocks: CodeBlock[]): CodeBlock[] {
  if (blocks.length === 0) return [];

  const merged: CodeBlock[] = [];
  let currentBlock = { ...blocks[0] };

  for (let i = 1; i < blocks.length; i++) {
    const nextBlock = blocks[i];

    // Check if KCs are the same (compare KC IDs)
    const currentKCs = currentBlock.kcs.map(kc => kc.id).sort().join(',');
    const nextKCs = nextBlock.kcs.map(kc => kc.id).sort().join(',');

    if (currentKCs === nextKCs && currentKCs !== '') {
      // Same KCs: merge blocks
      currentBlock.code += '\n' + nextBlock.code;
      currentBlock.endLine = nextBlock.endLine;
      // Type stays as the first block's type
    } else {
      // Different KCs: save current block and start new one
      merged.push(currentBlock);
      currentBlock = { ...nextBlock };
    }
  }

  // Don't forget the last block
  merged.push(currentBlock);

  return merged;
}
