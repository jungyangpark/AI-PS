import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { generateExpectedOutputs } from '../utils/gtCodeRunner';
import { AssignmentConfig } from '../modules/assignmentConfig';
import { TimeComplexity } from '../modules/codeEvaluator/complexityValidator';

const router = Router();

interface RegisterAssignmentRequest {
  assignmentId: string;
  description?: string;
  gtCodeFile: string; // e.g., "gt_1.py"
  testInputs: string[]; // Array of input strings
  inputSizes: number[]; // Corresponding input sizes for complexity testing
  expectedComplexity?: TimeComplexity; // e.g., "O(n^2)"
  expectedSpaceComplexity?: TimeComplexity; // e.g., "O(n)"
  validateSpaceComplexity?: boolean; // Whether to validate space complexity (default: false)
  kcs?: string[]; // Knowledge components
}

/**
 * Helper function to register a single assignment
 */
async function registerSingleAssignment(assignmentData: RegisterAssignmentRequest) {
  const {
    assignmentId,
    description,
    gtCodeFile,
    testInputs,
    inputSizes,
    expectedComplexity,
    expectedSpaceComplexity,
    validateSpaceComplexity,
    kcs
  } = assignmentData;

  // Validation
  if (!assignmentId || !gtCodeFile || !testInputs || !inputSizes) {
    throw new Error('Missing required fields: assignmentId, gtCodeFile, testInputs, inputSizes');
  }

  if (testInputs.length !== inputSizes.length) {
    throw new Error('testInputs and inputSizes must have the same length');
  }

  console.log(`📝 Registering assignment: ${assignmentId}`);

  // Locate GT code file
  const gtCodePath = path.join(process.cwd(), 'gt_codes', gtCodeFile);

  if (!fs.existsSync(gtCodePath)) {
    throw new Error(`GT code file not found: ${gtCodeFile}. Please place it in gt_codes/ directory.`);
  }

  console.log(`🔍 Found GT code: ${gtCodePath}`);
  console.log(`🧪 Generating outputs for ${testInputs.length} test cases...`);

  // Generate expected outputs using GT code
  const result = await generateExpectedOutputs(gtCodePath, testInputs);

  if (!result.success) {
    throw new Error(result.error);
  }

  console.log(`✅ Generated ${result.outputs!.length} outputs`);

  // Create test cases with generated outputs, GT execution times, and GT memory usage
  const testCases = testInputs.map((input, idx) => ({
    name: `test ${idx + 1}`,
    input: input,
    expectedOutput: result.outputs![idx],
    gtExecutionTime: result.executionTimes![idx],
    gtMemoryUsage: result.memoryUsages![idx]
  }));

  // Create assignment config
  const assignmentConfig: AssignmentConfig = {
    assignmentId,
    title: assignmentId,
    description: description || `Assignment ${assignmentId}`,
    testCases,
    gtCodePath,
    expectedComplexity: expectedComplexity || 'O(n)',
    expectedSpaceComplexity: expectedSpaceComplexity,
    validateSpaceComplexity: validateSpaceComplexity || false,
    kcs: kcs || []
  };

  // Save to assignments directory
  const assignmentsDir = path.join(process.cwd(), 'assignments');

  if (!fs.existsSync(assignmentsDir)) {
    fs.mkdirSync(assignmentsDir, { recursive: true });
  }

  const assignmentFile = path.join(assignmentsDir, `${assignmentId}.json`);
  fs.writeFileSync(
    assignmentFile,
    JSON.stringify(assignmentConfig, null, 2),
    'utf-8'
  );

  console.log(`💾 Saved assignment: ${assignmentFile}`);

  return assignmentConfig;
}

/**
 * POST /api/assignments/register
 * Register a new assignment by auto-generating expected outputs from GT code
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const assignmentConfig = await registerSingleAssignment(req.body);

    res.json({
      success: true,
      message: `Assignment ${assignmentConfig.assignmentId} registered successfully`,
      assignmentConfig: {
        ...assignmentConfig,
        testCases: assignmentConfig.testCases.map(tc => ({
          ...tc,
          expectedOutput: tc.expectedOutput.length > 100
            ? tc.expectedOutput.substring(0, 100) + '...'
            : tc.expectedOutput
        }))
      }
    });

  } catch (error: any) {
    console.error('Assignment registration error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to register assignment: ${error.message}`
    });
  }
});

/**
 * POST /api/assignments/batch-register
 * Register multiple assignments at once from JSON array
 */
router.post('/batch-register', async (req: Request, res: Response) => {
  try {
    const { assignments }: { assignments: RegisterAssignmentRequest[] } = req.body;

    if (!assignments || !Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: assignments array is required'
      });
    }

    console.log(`📦 Batch registering ${assignments.length} assignments...`);

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        const config = await registerSingleAssignment(assignment);
        results.push({
          assignmentId: config.assignmentId,
          success: true,
          message: `Assignment ${config.assignmentId} registered successfully`
        });
      } catch (error: any) {
        console.error(`Failed to register ${assignment.assignmentId}:`, error);
        errors.push({
          assignmentId: assignment.assignmentId,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`✅ Batch registration complete: ${results.length} succeeded, ${errors.length} failed`);

    res.json({
      success: true,
      totalCount: assignments.length,
      successCount: results.length,
      failureCount: errors.length,
      results: [...results, ...errors]
    });

  } catch (error: any) {
    console.error('Batch registration error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to batch register assignments: ${error.message}`
    });
  }
});

/**
 * GET /api/assignments
 * List all registered assignments
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const assignmentsDir = path.join(process.cwd(), 'assignments');

    if (!fs.existsSync(assignmentsDir)) {
      return res.json({
        success: true,
        assignments: []
      });
    }

    const files = fs.readdirSync(assignmentsDir);
    const assignments = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const content = fs.readFileSync(
          path.join(assignmentsDir, file),
          'utf-8'
        );
        const config = JSON.parse(content);
        return {
          assignmentId: config.assignmentId,
          title: config.title,
          description: config.description,
          testCaseCount: config.testCases?.length || 0,
          kcs: config.kcs
        };
      });

    res.json({
      success: true,
      assignments
    });

  } catch (error: any) {
    console.error('List assignments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/assignments/:assignmentId
 * Get details of a specific assignment
 */
router.get('/:assignmentId', (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const assignmentFile = path.join(
      process.cwd(),
      'assignments',
      `${assignmentId}.json`
    );

    if (!fs.existsSync(assignmentFile)) {
      return res.status(404).json({
        success: false,
        error: `Assignment ${assignmentId} not found`
      });
    }

    const content = fs.readFileSync(assignmentFile, 'utf-8');
    const config = JSON.parse(content);

    res.json({
      success: true,
      assignment: config
    });

  } catch (error: any) {
    console.error('Get assignment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/assignments/:assignmentId
 * Delete an assignment
 */
router.delete('/:assignmentId', (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const assignmentFile = path.join(
      process.cwd(),
      'assignments',
      `${assignmentId}.json`
    );

    if (!fs.existsSync(assignmentFile)) {
      return res.status(404).json({
        success: false,
        error: `Assignment ${assignmentId} not found`
      });
    }

    fs.unlinkSync(assignmentFile);

    res.json({
      success: true,
      message: `Assignment ${assignmentId} deleted successfully`
    });

  } catch (error: any) {
    console.error('Delete assignment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
