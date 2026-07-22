import { checkPythonGrammar, GrammarCheckResult } from './grammarChecker';
import { runPythonUnitTests, UnitTestCase, UnitTestResult } from './unitTestRunner';
import { validateAlgorithm, AlgorithmValidationResult } from './algorithmValidator';

export interface CodeEvaluationConfig {
  testCases: UnitTestCase[];
  gtCodePath: string; // Path to GT code for algorithm comparison
  expectedComplexity: string; // Expected time complexity (for reference)
}

export interface CodeEvaluationResult {
  success: boolean;
  grammarCheck: GrammarCheckResult;
  unitTestResult?: UnitTestResult;
  algorithmValidation?: AlgorithmValidationResult;
  message: string;
  reason?: string;
}

/**
 * Evaluates submitted code comprehensively
 * 1. Grammar/syntax check
 * 2. Unit test execution
 * 3. Algorithm validation using LLM
 *
 * @param code - The Python code to evaluate
 * @param config - Evaluation configuration including tests, GT code path, and expected complexity
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

  // Step 3: Validate algorithm using LLM
  console.log('   [3/3] Validating algorithm with LLM...');
  const algorithmValidation = await validateAlgorithm(
    code,
    config.gtCodePath,
    config.expectedComplexity,
    unitTestResult
  );

  if (!algorithmValidation.isValid) {
    console.log(`   ❌ Algorithm validation failed: ${algorithmValidation.reason}`);
    return {
      success: false,
      grammarCheck,
      unitTestResult,
      algorithmValidation,
      message: 'Wrong',
      reason: 'Wrong Algorithm'
    };
  }
  console.log(`   ✅ Algorithm validation passed: ${algorithmValidation.detectedApproach}`);

  // All checks passed!
  return {
    success: true,
    grammarCheck,
    unitTestResult,
    algorithmValidation,
    message: 'Correct!'
  };
}

// Export sub-modules
export { checkPythonGrammar, GrammarCheckResult } from './grammarChecker';
export { runPythonUnitTests, UnitTestCase, UnitTestResult } from './unitTestRunner';
export { validateAlgorithm, AlgorithmValidationResult } from './algorithmValidator';
