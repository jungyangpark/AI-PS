import { Router, Request, Response } from 'express';
import { code2BlockAnalyzer } from '../modules/code2block';
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
 * Submit student's completed code for analysis
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

    // Analyze code with Code2Block
    const analysis = await code2BlockAnalyzer.analyze(code);

    // Prepare submission record
    const submissionRecord = {
      studentId,
      assignmentId,
      sessionId: sessionId || `${studentId}_${assignmentId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      fileName: fileName || 'unknown.py',
      code,
      analysis: {
        blocks: analysis.blocks,
        summary: analysis.summary
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

    console.log(`✅ Submission saved: ${submissionFile}`);
    console.log(`   Blocks: ${analysis.blocks.length}`);
    console.log(`   KCs: ${analysis.summary.kcs.join(', ')}`);
    console.log(`   Complexity: ${analysis.summary.complexity}`);

    res.json({
      success: true,
      message: 'Code submitted successfully',
      analysis: {
        totalBlocks: analysis.summary.totalBlocks,
        kcs: analysis.summary.kcs,
        complexity: analysis.summary.complexity
      }
    });

  } catch (error: any) {
    console.error('Submit error:', error);
    res.status(500).json({
      error: 'Failed to process submission',
      details: error.message
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
