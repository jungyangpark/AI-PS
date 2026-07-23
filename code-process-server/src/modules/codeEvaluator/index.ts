import { checkPythonGrammar, GrammarCheckResult } from './grammarChecker';
import { runPythonUnitTests, UnitTestCase, UnitTestResult, measureGTExecutionTimes } from './unitTestRunner';

export interface CodeEvaluationConfig {
  testCases: UnitTestCase[];
  gtCodePath: string; // Path to GT code for time measurement
  expectedComplexity: string; // Expected time complexity (for reference)
  kcs: string[]; // Knowledge Components to check
}

export interface CodeEvaluationResult {
  success: boolean;
  grammarCheck: GrammarCheckResult;
  unitTestResult?: UnitTestResult;
  message: string;
  reason?: string;
}

/**
 * Evaluates submitted code comprehensively
 * 1. Grammar/syntax check
 * 2. GT code time measurement
 * 3. Unit test execution with dynamic time limits
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

  // Step 2: Measure GT code execution times
  console.log('   [2/3] Measuring GT code execution times...');
  const gtExecutionTimes = await measureGTExecutionTimes(config.gtCodePath, config.testCases);

  // Set GT times in test cases for dynamic timeout calculation
  const testCasesWithGTTimes = config.testCases.map((test, idx) => ({
    ...test,
    gtExecutionTime: gtExecutionTimes[idx]
  }));

  const maxGTTime = Math.max(...gtExecutionTimes, 0);
  console.log(`   ✅ GT measurement complete (max: ${maxGTTime.toFixed(2)}ms)`);

  // Step 3: Run unit tests with dynamic time limits
  console.log(`   [3/3] Running ${testCasesWithGTTimes.length} unit tests...`);
  const unitTestResult = await runPythonUnitTests(code, testCasesWithGTTimes);

  // Check unit test results
  if (!unitTestResult.passed) {
    console.log(`   ❌ Unit tests failed: ${unitTestResult.passedTests}/${testCasesWithGTTimes.length} passed`);

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
  console.log(`   ✅ All unit tests passed (${unitTestResult.passedTests}/${testCasesWithGTTimes.length})`);

  // All checks passed!
  return {
    success: true,
    grammarCheck,
    unitTestResult,
    message: 'Correct!'
  };
}

// Export sub-modules
export { checkPythonGrammar, GrammarCheckResult } from './grammarChecker';
export { runPythonUnitTests, measureGTExecutionTimes, UnitTestCase, UnitTestResult } from './unitTestRunner';
