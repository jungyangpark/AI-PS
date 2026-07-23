import { parsePythonAST } from './parser';
import { extractBlocks, mergeRelatedBlocks } from './extractor';
import { getAllKCs } from './kcMapper';
import { Code2BlockResult, CodeBlock } from './types';
import { analyzeCodeLineByLine, LineKCMapping } from './llmKcMapper';
import { KC_NAME_TO_ID } from '../studentEvaluation/kcMapping';

/**
 * Main Code2Block analyzer
 * Analyzes code and extracts blocks with KC annotations using LLM
 */
export class Code2BlockAnalyzer {

  async analyze(
    code: string,
    options?: {
      /** Only analyze this portion for KCs (for efficiency) */
      kcAnalysisCode?: string;
      /** Line number offset for KC analysis (if analyzing a subset) */
      kcLineOffset?: number;
    }
  ): Promise<Code2BlockResult> {
    // 1. Use LLM to analyze code line-by-line for KCs
    console.log('[Code2Block] Analyzing code with LLM...');
    const codeToAnalyze = options?.kcAnalysisCode || code;
    const lineOffset = options?.kcLineOffset || 0;

    const lineMappings = await analyzeCodeLineByLine(codeToAnalyze);

    // Adjust line numbers if offset is provided
    const adjustedLineMappings = lineOffset > 0
      ? lineMappings.map(m => ({ ...m, line: m.line + lineOffset }))
      : lineMappings;

    // 2. Parse AST and extract blocks (for block structure)
    const ast = await parsePythonAST(code);
    const rawBlocks = extractBlocks(ast);
    const blocks = mergeRelatedBlocks(rawBlocks);

    // 3. Map LLM KC results to blocks
    const blocksWithKCs = this.mapKCsToBlocks(blocks, adjustedLineMappings);

    // 4. Generate summary
    const kcs = this.getAllKCsFromBlocks(blocksWithKCs);
    const complexity = this.estimateComplexity(blocksWithKCs, kcs);

    return {
      blocks: blocksWithKCs,
      summary: {
        totalBlocks: blocksWithKCs.length,
        kcs,
        complexity
      }
    };
  }

  /**
   * Map LLM KC results to AST blocks
   * Each block gets KCs from all lines it contains
   */
  private mapKCsToBlocks(blocks: CodeBlock[], lineMappings: LineKCMapping[]): CodeBlock[] {
    // Create a map: line number -> KC names
    const lineToKCs = new Map<number, string[]>();
    lineMappings.forEach(mapping => {
      lineToKCs.set(mapping.line, mapping.kcs);
    });

    // For each block, collect KCs from all its lines
    return blocks.map(block => {
      const blockKCNames = new Set<string>();

      // Collect KCs from all lines in this block
      for (let line = block.startLine; line <= block.endLine; line++) {
        const lineKCs = lineToKCs.get(line);
        if (lineKCs) {
          lineKCs.forEach(kc => blockKCNames.add(kc));
        }
      }

      // Convert KC names to KC objects with IDs
      const kcs = Array.from(blockKCNames).map(kcName => ({
        id: KC_NAME_TO_ID[kcName] || 'KC_000',
        name: kcName,
        category: 'basic' as const,  // Category can be inferred later if needed
      }));

      return {
        ...block,
        kcs,
      };
    });
  }

  /**
   * Get all unique KC names from blocks
   */
  private getAllKCsFromBlocks(blocks: CodeBlock[]): string[] {
    const allKCs = new Set<string>();
    blocks.forEach(block => {
      block.kcs.forEach(kc => allKCs.add(kc.name));
    });
    return Array.from(allKCs);
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
