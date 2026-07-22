import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { UnitTestResult } from './unitTestRunner';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AlgorithmValidationResult {
  isValid: boolean;
  detectedApproach: string;
  expectedApproach: string;
  reason: string;
}

/**
 * Validates if student code uses the expected algorithm/approach
 * by comparing with GT code using LLM analysis
 */
export async function validateAlgorithm(
  studentCode: string,
  gtCodePath: string,
  expectedComplexity: string,
  testResult: UnitTestResult
): Promise<AlgorithmValidationResult> {

  if (!testResult.passed) {
    return {
      isValid: false,
      detectedApproach: 'Unknown',
      expectedApproach: expectedComplexity,
      reason: 'Cannot validate algorithm - tests did not pass'
    };
  }

  try {
    // Read GT code
    const gtCode = fs.readFileSync(gtCodePath, 'utf-8');

    // Call Claude API to analyze algorithm
    const prompt = `You are a computer science professor evaluating student code.

**GT Code (Reference Solution):**
\`\`\`python
${gtCode}
\`\`\`

**Student Code (Submission):**
\`\`\`python
${studentCode}
\`\`\`

**Expected Time Complexity:** ${expectedComplexity}

**Task:**
Analyze whether the student's code uses the same algorithmic approach as the GT code.
- Does it use the same core algorithm/data structure?
- Does it have the same time complexity?
- Does it follow the same problem-solving strategy?

**Important:**
- Both codes produce correct output (already tested)
- Focus on algorithmic approach, not code style
- Be lenient with minor variations in implementation

Respond in JSON format:
{
  "isValid": true or false,
  "detectedApproach": "brief description of student's approach",
  "reason": "explanation of your decision"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text');
    const responseText = textContent && 'text' in textContent ? textContent.text : '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse LLM response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      isValid: result.isValid === true,
      detectedApproach: result.detectedApproach || 'Unknown',
      expectedApproach: expectedComplexity,
      reason: result.reason || 'No reason provided'
    };

  } catch (error: any) {
    console.error('Algorithm validation error:', error);
    return {
      isValid: false,
      detectedApproach: 'Error',
      expectedApproach: expectedComplexity,
      reason: `Validation error: ${error.message}`
    };
  }
}
