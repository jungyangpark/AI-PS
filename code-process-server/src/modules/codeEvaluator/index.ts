import { checkPythonGrammar, GrammarCheckResult } from './grammarChecker';
import { runPythonUnitTests, UnitTestCase, UnitTestResult } from './unitTestRunner';
import { validateTimeComplexity, TimeComplexity, ComplexityValidationResult } from './complexityValidator';

export interface CodeEvaluationConfig {
  testCases: UnitTestCase[];
  inputSizes: number[]; // Corresponding input sizes for complexity testing
  expectedComplexity: TimeComplexity;
}

export interface CodeEvaluationResult {
  success: boolean;
  grammarCheck: GrammarCheckResult;
  unitTestResult?: UnitTestResult;
  complexityValidation?: ComplexityValidationResult;
  message: string;
  reason?: string;
}

/**
 * Evaluates submitted code comprehensively
 * 1. Grammar/syntax check
 * 2. Unit test execution
 * 3. Time complexity validation
 *
 * @param code - The Python code to evaluate
 * @param config - Evaluation configuration including tests and expected complexity
 * @returns Detailed evaluation result
 */
export async function evaluateCode(
  code: string,
  config: CodeEvaluationConfig
): Promise<CodeEvaluationResult> {

  // Step 1: Check grammar/syntax
  console.log('   [1/3] Checking grammar/syntax...');
  const grammarCheck = await checkPythonGrammar(code);

  if (!grammarCheck.isValid) {
    console.log('   ❌ Grammar check failed');
    return {
      success: false,
      grammarCheck,
      message: 'Wrong',
      reason: 'Syntax Error'
    };
  }
  console.log('   ✅ Grammar check passed');

  // Step 2: Run unit tests
  console.log(`   [2/3] Running ${config.testCases.length} unit tests...`);
  const unitTestResult = await runPythonUnitTests(
    code,
    config.testCases
  );

  if (!unitTestResult.passed) {
    console.log(`   ❌ Unit tests failed: ${unitTestResult.passedTests}/${config.testCases.length} passed`);

    let reason = 'Wrong Answer';

    if (unitTestResult.errors.length > 0) {
      const errorMsg = unitTestResult.errors[0];
      // Check if it's a timeout error
      if (errorMsg.includes('Timeout') || errorMsg.includes('timeout')) {
        reason = 'Time Limit Exceeded';
      } else {
        reason = 'Runtime Error';
      }
    }

    return {
      success: false,
      grammarCheck,
      unitTestResult,
      message: 'Wrong',
      reason
    };
  }
  console.log(`   ✅ All unit tests passed (${unitTestResult.passedTests}/${config.testCases.length})`);

  // Step 3: Validate time complexity
  console.log('   [3/3] Validating time complexity...');
  const complexityValidation = validateTimeComplexity(
    unitTestResult,
    config.expectedComplexity,
    config.inputSizes
  );

  if (!complexityValidation.isValid) {
    console.log(`   ❌ Complexity validation failed: detected ${complexityValidation.detectedComplexity}, expected ${config.expectedComplexity}`);
    return {
      success: false,
      grammarCheck,
      unitTestResult,
      complexityValidation,
      message: 'Wrong',
      reason: 'Time Limit Exceeded'
    };
  }
  console.log(`   ✅ Complexity validation passed: ${complexityValidation.detectedComplexity}`);

  // All checks passed!
  return {
    success: true,
    grammarCheck,
    unitTestResult,
    complexityValidation,
    message: 'Correct!'
  };
}

// Export sub-modules
export { checkPythonGrammar, GrammarCheckResult } from './grammarChecker';
export { runPythonUnitTests, UnitTestCase, UnitTestResult } from './unitTestRunner';
export { validateTimeComplexity, TimeComplexity, ComplexityValidationResult, generateComplexityTestSizes } from './complexityValidator';
