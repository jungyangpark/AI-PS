export interface ASTNode {
  type: string;
  code: string;
  startLine: number;
  endLine: number;
  children?: ASTNode[];
}

export interface CodeBlock {
  id: string;
  code: string;
  type: string;
  startLine: number;
  endLine: number;
  kcs: KnowledgeComponent[];
}

export interface KnowledgeComponent {
  id: string;
  name: string;
  category: 'basic' | 'intermediate' | 'advanced';
}

export interface Code2BlockResult {
  blocks: CodeBlock[];
  summary: {
    totalBlocks: number;
    kcs: string[];
    complexity: 'low' | 'medium' | 'high';
  };
}
