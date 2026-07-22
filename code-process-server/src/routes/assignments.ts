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
  kcs?: string[]; // Knowledge components
}

/**
 * POST /api/assignments/register
 * Register a new assignment by auto-generating expected outputs from GT code
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      assignmentId,
      description,
      gtCodeFile,
      testInputs,
      inputSizes,
      expectedComplexity,
      kcs
    }: RegisterAssignmentRequest = req.body;

    // Validation
    if (!assignmentId || !gtCodeFile || !testInputs || !inputSizes) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: assignmentId, gtCodeFile, testInputs, inputSizes'
      });
    }

    if (testInputs.length !== inputSizes.length) {
      return res.status(400).json({
        success: false,
        error: 'testInputs and inputSizes must have the same length'
      });
    }

    console.log(`📝 Registering assignment: ${assignmentId}`);

    // Locate GT code file
    const gtCodePath = path.join(process.cwd(), 'gt_codes', gtCodeFile);

    if (!fs.existsSync(gtCodePath)) {
      return res.status(404).json({
        success: false,
        error: `GT code file not found: ${gtCodeFile}. Please place it in gt_codes/ directory.`
      });
    }

    console.log(`🔍 Found GT code: ${gtCodePath}`);
    console.log(`🧪 Generating outputs for ${testInputs.length} test cases...`);

    // Generate expected outputs using GT code
    const result = await generateExpectedOutputs(gtCodePath, testInputs);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    console.log(`✅ Generated ${result.outputs!.length} outputs`);

    // Create test cases with generated outputs and GT execution times
    // Don't include input size in name to prevent hardcoding
    const testCases = testInputs.map((input, idx) => ({
      name: `test ${idx + 1}`,
      input: input,
      expectedOutput: result.outputs![idx],
      gtExecutionTime: result.executionTimes![idx]
    }));

    // Create assignment config
    const assignmentConfig: AssignmentConfig = {
      assignmentId,
      title: assignmentId, // Use assignmentId as title
      description: description || `Assignment ${assignmentId}`,
      testCases,
      gtCodePath, // Store GT code path for algorithm validation
      expectedComplexity: expectedComplexity || 'O(n)',
      kcs: kcs || []
    };

    // Save to assignments directory
    const assignmentsDir = path.join(process.cwd(), 'assignments');

    // Create directory if it doesn't exist
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

    res.json({
      success: true,
      message: `Assignment ${assignmentId} registered successfully`,
      assignmentConfig: {
        ...assignmentConfig,
        testCases: testCases.map(tc => ({
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
