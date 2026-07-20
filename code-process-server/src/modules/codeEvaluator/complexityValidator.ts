import { UnitTestResult } from './unitTestRunner';

export type TimeComplexity = 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' | 'O(n^2)' | 'O(n^3)' | 'O(2^n)';

export interface ComplexityValidationResult {
  isValid: boolean;
  detectedComplexity: TimeComplexity | 'Unknown';
  expectedComplexity: TimeComplexity;
  reason?: string;
}

/**
 * Validates time complexity by comparing student execution times with GT times
 * @param testResult - Results from unit tests with execution times
 * @param expectedComplexity - The expected time complexity
 * @param inputSizes - Array of input sizes corresponding to test cases
 * @returns Validation result
 */
export function validateTimeComplexity(
  testResult: UnitTestResult,
  expectedComplexity: TimeComplexity,
  inputSizes: number[]
): ComplexityValidationResult {

  if (!testResult.passed) {
    return {
      isValid: false,
      detectedComplexity: 'Unknown',
      expectedComplexity,
      reason: 'Cannot validate complexity - tests did not pass'
    };
  }

  const studentTimes = testResult.executionTimes;
  const gtTimes = testResult.gtExecutionTimes;

  if (studentTimes.length < 3) {
    return {
      isValid: false,
      detectedComplexity: 'Unknown',
      expectedComplexity,
      reason: 'Insufficient test cases to determine complexity (need at least 3)'
    };
  }

  if (!gtTimes || gtTimes.length === 0) {
    // Fallback to old method if GT times not available
    const detectedComplexity = detectComplexity(inputSizes, studentTimes);
    const isValid = isComplexityAcceptable(detectedComplexity, expectedComplexity);
    return {
      isValid,
      detectedComplexity,
      expectedComplexity,
      reason: isValid
        ? undefined
        : `Expected at most ${expectedComplexity} but detected ${detectedComplexity}`
    };
  }

  // Compare student times with GT times
  const timeRatios = studentTimes.map((studentTime, idx) => {
    const gtTime = gtTimes[idx];
    if (gtTime === 0) return 1;
    return studentTime / gtTime;
  });

  // Check if student is significantly slower than GT
  const maxRatio = Math.max(...timeRatios);
  const avgRatio = timeRatios.reduce((sum, r) => sum + r, 0) / timeRatios.length;

  // Allow up to 2x slower on average, 3x on max
  const isValid = maxRatio <= 3.0 && avgRatio <= 2.0;

  const detectedComplexity = isValid
    ? expectedComplexity
    : 'Too slow (likely different algorithm)';

  return {
    isValid,
    detectedComplexity: detectedComplexity as any,
    expectedComplexity,
    reason: isValid
      ? undefined
      : `Code is significantly slower than GT (avg: ${avgRatio.toFixed(2)}x, max: ${maxRatio.toFixed(2)}x)`
  };
}

/**
 * Check if detected complexity is acceptable (better or equal to expected)
 * Complexity order: O(1) < O(log n) < O(n) < O(n log n) < O(n^2) < O(n^3) < O(2^n)
 */
function isComplexityAcceptable(
  detected: TimeComplexity | 'Unknown',
  expected: TimeComplexity
): boolean {
  if (detected === 'Unknown') {
    return false;
  }

  const complexityOrder: Record<TimeComplexity, number> = {
    'O(1)': 0,
    'O(log n)': 1,
    'O(n)': 2,
    'O(n log n)': 3,
    'O(n^2)': 4,
    'O(n^3)': 5,
    'O(2^n)': 6
  };

  // Detected complexity must be <= expected (lower or equal is better)
  return complexityOrder[detected] <= complexityOrder[expected];
}

/**
 * Detects time complexity from input sizes and execution times
 */
function detectComplexity(sizes: number[], times: number[]): TimeComplexity | 'Unknown' {
  if (sizes.length < 3 || times.length < 3) {
    return 'Unknown';
  }

  // Calculate growth ratios
  const ratios: { sizeRatio: number; timeRatio: number }[] = [];

  for (let i = 1; i < sizes.length; i++) {
    const sizeRatio = sizes[i] / sizes[i - 1];
    const timeRatio = times[i] / times[i - 1];

    if (times[i - 1] > 0 && sizeRatio > 1) {
      ratios.push({ sizeRatio, timeRatio });
    }
  }

  if (ratios.length === 0) {
    return 'Unknown';
  }

  // Average time ratio
  const avgTimeRatio = ratios.reduce((sum, r) => sum + r.timeRatio, 0) / ratios.length;
  const avgSizeRatio = ratios.reduce((sum, r) => sum + r.sizeRatio, 0) / ratios.length;

  // Classify based on growth pattern
  // O(1) - constant time (time ratio ≈ 1)
  if (avgTimeRatio < 1.2) {
    return 'O(1)';
  }

  // O(log n) - logarithmic (time ratio much less than size ratio)
  if (avgTimeRatio < Math.log2(avgSizeRatio) * 1.5) {
    return 'O(log n)';
  }

  // O(n) - linear (time ratio ≈ size ratio)
  if (Math.abs(avgTimeRatio - avgSizeRatio) < avgSizeRatio * 0.3) {
    return 'O(n)';
  }

  // O(n log n) - linearithmic (time ratio between n and n^2)
  const nlogn_ratio = avgSizeRatio * Math.log2(avgSizeRatio);
  if (Math.abs(avgTimeRatio - nlogn_ratio) < nlogn_ratio * 0.5) {
    return 'O(n log n)';
  }

  // O(n^2) - quadratic (time ratio ≈ size ratio squared)
  const quadraticRatio = avgSizeRatio * avgSizeRatio;
  if (Math.abs(avgTimeRatio - quadraticRatio) < quadraticRatio * 0.5) {
    return 'O(n^2)';
  }

  // O(n^3) - cubic
  const cubicRatio = Math.pow(avgSizeRatio, 3);
  if (Math.abs(avgTimeRatio - cubicRatio) < cubicRatio * 0.5) {
    return 'O(n^3)';
  }

  // O(2^n) - exponential (time ratio grows exponentially)
  if (avgTimeRatio > avgSizeRatio * 10) {
    return 'O(2^n)';
  }

  return 'Unknown';
}

/**
 * Helper to generate test cases with varying input sizes for complexity testing
 */
export interface ComplexityTestConfig {
  baseSize: number;
  multiplier: number;
  testCount: number;
}

export function generateComplexityTestSizes(config: ComplexityTestConfig): number[] {
  const sizes: number[] = [];
  let currentSize = config.baseSize;

  for (let i = 0; i < config.testCount; i++) {
    sizes.push(Math.floor(currentSize));
    currentSize *= config.multiplier;
  }

  return sizes;
}
