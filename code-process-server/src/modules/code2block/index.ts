import { parsePythonAST } from './parser';
import { extractBlocks, mergeRelatedBlocks } from './extractor';
import { getAllKCs } from './kcMapper';
import { Code2BlockResult } from './types';

/**
 * Main Code2Block analyzer
 * Analyzes code and extracts blocks with KC annotations
 */
export class Code2BlockAnalyzer {

  async analyze(code: string): Promise<Code2BlockResult> {
    // 1. Parse AST
    const ast = await parsePythonAST(code);

    // 2. Extract blocks
    const rawBlocks = extractBlocks(ast);

    // 3. Merge related blocks (optional)
    const blocks = mergeRelatedBlocks(rawBlocks);

    // 4. Generate summary
    const kcs = getAllKCs(blocks);
    const complexity = this.estimateComplexity(blocks, kcs);

    return {
      blocks,
      summary: {
        totalBlocks: blocks.length,
        kcs,
        complexity
      }
    };
  }

  private estimateComplexity(blocks: any[], kcs: string[]): 'low' | 'medium' | 'high' {
    // Simple heuristic based on KC categories
    const hasAdvanced = kcs.some(kc =>
      kc.includes('recursion') || kc.includes('advanced')
    );
    const hasIntermediate = kcs.some(kc =>
      kc.includes('function') || kc.includes('list')
    );

    if (hasAdvanced) return 'high';
    if (hasIntermediate && blocks.length > 5) return 'medium';
    return 'low';
  }
}

// Export singleton instance
export const code2BlockAnalyzer = new Code2BlockAnalyzer();

// Re-export types
export * from './types';
