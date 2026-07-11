import { KnowledgeComponent } from './types';

// Basic KC definitions
const KC_DATABASE: Record<string, KnowledgeComponent[]> = {
  'IfStatement': [
    { id: 'KC_001', name: 'conditional_logic', category: 'basic' }
  ],
  'ForLoop': [
    { id: 'KC_002', name: 'iteration', category: 'basic' },
    { id: 'KC_003', name: 'range_function', category: 'basic' }
  ],
  'WhileLoop': [
    { id: 'KC_004', name: 'iteration', category: 'basic' }
  ],
  'FunctionDef': [
    { id: 'KC_005', name: 'function_definition', category: 'intermediate' }
  ],
  'FunctionCall': [
    { id: 'KC_006', name: 'function_call', category: 'basic' }
  ],
  'FunctionCall_recursive': [
    { id: 'KC_007', name: 'recursion', category: 'advanced' },
    { id: 'KC_008', name: 'recursive_thinking', category: 'advanced' }
  ],
  'Assignment': [
    { id: 'KC_009', name: 'variable_assignment', category: 'basic' }
  ],
  'ListOperation': [
    { id: 'KC_010', name: 'list_manipulation', category: 'intermediate' }
  ],
  'Return': [
    { id: 'KC_011', name: 'return_statement', category: 'basic' }
  ]
};

export function mapKnowledgeComponents(blockType: string, code: string): KnowledgeComponent[] {
  // Check for recursive function call
  if (blockType === 'FunctionCall') {
    // Simple heuristic: if function name appears in code and it's not a built-in
    const functionCallMatch = code.match(/(\w+)\s*\(/);
    if (functionCallMatch) {
      const funcName = functionCallMatch[1];
      // Check if it's likely recursive (function name matches current context)
      if (code.includes('def ') || code.includes(funcName + '(')) {
        return KC_DATABASE['FunctionCall_recursive'] || KC_DATABASE['FunctionCall'];
      }
    }
  }

  return KC_DATABASE[blockType] || [];
}

export function getAllKCs(blocks: any[]): string[] {
  const allKCs = new Set<string>();
  blocks.forEach(block => {
    block.kcs.forEach((kc: KnowledgeComponent) => allKCs.add(kc.name));
  });
  return Array.from(allKCs);
}
