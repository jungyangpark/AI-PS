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
 * Validates if student code demonstrates the target Knowledge Components (KCs)
 * by analyzing with LLM. Does not require exact same implementation as GT code.
 */
export async function validateAlgorithm(
  studentCode: string,
  gtCodePath: string,
  expectedComplexity: string,
  kcs: string[]
): Promise<AlgorithmValidationResult> {

  try {
    // Call Claude API to analyze algorithm
    const kcsList = kcs.map((kc, idx) => `${idx + 1}. ${kc}`).join('\n');

    const prompt = `You are a computer science professor evaluating student code.

**Student Code (Submission):**
\`\`\`python
${studentCode}
\`\`\`

**Expected Time Complexity:** ${expectedComplexity}

**Target Knowledge Components (Learning Objectives):**
${kcsList}

**Task:**
Evaluate whether the student's code demonstrates the target Knowledge Components (KCs) listed above.
- Does the code demonstrate each of the target KCs?
- Does it meet the expected time complexity requirement?

**Important:**
- The code already produces correct output (verified by unit tests)
- Evaluate based solely on whether the target KCs are demonstrated
- Different implementations and approaches are acceptable
- Be lenient with implementation variations
- Only mark as invalid if the code clearly does NOT demonstrate the required KCs

Respond in JSON format:
{
  "isValid": true or false,
  "detectedApproach": "brief description of student's approach and which KCs are demonstrated",
  "reason": "explanation of your decision"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
