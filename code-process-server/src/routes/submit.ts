import { Router, Request, Response } from 'express';
import { code2BlockAnalyzer } from '../modules/code2block';
import { evaluateCode } from '../modules/codeEvaluator';
import { loadAssignmentConfig } from '../modules/assignmentConfig';
import { updateStudentModel } from '../modules/studentEvaluation';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

interface SubmitRequest {
  studentId: string;
  assignmentId: string;
  sessionId: string;
  code: string;
  fileName: string;
}

/**
 * POST /api/submit
 * Submit student's completed code for evaluation and analysis
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { studentId, assignmentId, sessionId, code, fileName }: SubmitRequest = req.body;

    if (!studentId || !assignmentId || !code) {
      return res.status(400).json({
        error: 'Missing required fields: studentId, assignmentId, code'
      });
    }

    console.log(`📝 Submission from ${studentId} for ${assignmentId}`);

    // Load assignment configuration
    const assignmentConfig = loadAssignmentConfig(assignmentId);

    if (!assignmentConfig) {
      return res.status(404).json({
        success: false,
        message: 'Wrong',
        reason: `Assignment ${assignmentId} not found. Please contact instructor.`
      });
    }

    // Step 1: Evaluate code (grammar, unit tests, complexity)
    console.log(`🔍 Evaluating code...`);
    const evaluation = await evaluateCode(code, assignmentConfig);

    // Initialize response data
    let analysis: any = null;
    let studentModel: any = null;

    // Step 2: If evaluation passed, run Code2Block analysis
    if (evaluation.success) {
      console.log(`✅ Code evaluation passed!`);
      console.log(`📊 Running Code2Block analysis...`);

      analysis = await code2BlockAnalyzer.analyze(code);

      console.log(`   Blocks: ${analysis.blocks.length}`);
      console.log(`   KCs: ${analysis.summary.kcs.join(', ')}`);

      // Step 3: Update student model
      console.log(`👤 Updating student model...`);
      studentModel = updateStudentModel(
        studentId,
        assignmentConfig.kcs,
        true,
        analysis.blocks
      );

      console.log(`   Total submissions: ${studentModel.totalSubmissions}`);
      console.log(`   Successful: ${studentModel.successfulSubmissions}`);
    } else {
      console.log(`❌ Code evaluation failed: ${evaluation.reason}`);

      // Update student model with failed attempt
      studentModel = updateStudentModel(
        studentId,
        assignmentConfig.kcs,
        false
      );
    }

    // Prepare submission record
    const submissionRecord = {
      studentId,
      assignmentId,
      sessionId: sessionId || `${studentId}_${assignmentId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      fileName: fileName || 'unknown.py',
      code,
      evaluation: {
        success: evaluation.success,
        message: evaluation.message,
        reason: evaluation.reason,
        grammarCheck: evaluation.grammarCheck,
        unitTestResult: evaluation.unitTestResult,
        algorithmValidation: evaluation.algorithmValidation
      },
      analysis: analysis ? {
        blocks: analysis.blocks,
        summary: analysis.summary
      } : null,
      studentModel: {
        totalSubmissions: studentModel.totalSubmissions,
        successfulSubmissions: studentModel.successfulSubmissions,
        relevantKCLevels: Object.fromEntries(
          Object.entries(studentModel.kcLevels).filter(([kc]) =>
            assignmentConfig.kcs.includes(kc)
          )
        )
      }
    };

    // Save to file system
    const submissionsDir = path.join(
      process.cwd(),
      'logs',
      studentId,
      'submissions'
    );

    await fs.mkdir(submissionsDir, { recursive: true });

    const submissionFile = path.join(
      submissionsDir,
      `${assignmentId}_${Date.now()}.json`
    );

    await fs.writeFile(
      submissionFile,
      JSON.stringify(submissionRecord, null, 2),
      'utf-8'
    );

    console.log(`💾 Submission saved: ${submissionFile}`);

    // Return response
    res.json({
      success: evaluation.success,
      message: evaluation.message,
      reason: evaluation.reason,
      analysis: analysis ? {
        totalBlocks: analysis.summary.totalBlocks,
        kcs: analysis.summary.kcs,
        complexity: analysis.summary.complexity
      } : null,
      studentLevel: studentModel ? {
        totalSubmissions: studentModel.totalSubmissions,
        successfulSubmissions: studentModel.successfulSubmissions,
        kcLevels: Object.fromEntries(
          Object.entries(studentModel.kcLevels).filter(([kc]) =>
            assignmentConfig.kcs.includes(kc)
          )
        )
      } : null
    });

  } catch (error: any) {
    console.error('Submit error:', error);
    res.status(500).json({
      success: false,
      message: 'Wrong',
      reason: `Server error: ${error.message}`
    });
  }
});

/**
 * GET /api/submit/:studentId/:assignmentId
 * Get submission history for a student's assignment
 */
router.get('/:studentId/:assignmentId', async (req: Request, res: Response) => {
  try {
    const { studentId, assignmentId } = req.params;

    const submissionsDir = path.join(
      process.cwd(),
      'logs',
      studentId,
      'submissions'
    );

    try {
      const files = await fs.readdir(submissionsDir);
      const relevantFiles = files.filter(f =>
        f.startsWith(assignmentId) && f.endsWith('.json')
      );

      const submissions = await Promise.all(
        relevantFiles.map(async (file) => {
          const content = await fs.readFile(
            path.join(submissionsDir, file),
            'utf-8'
          );
          return JSON.parse(content);
        })
      );

      res.json({
        success: true,
        submissions: submissions.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      });

    } catch (error) {
      res.json({ success: true, submissions: [] });
    }

  } catch (error: any) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      error: 'Failed to retrieve submissions',
      details: error.message
    });
  }
});

export default router;
