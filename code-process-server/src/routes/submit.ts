import { Router, Request, Response } from 'express';
import { code2BlockAnalyzer } from '../modules/code2block';
import { evaluateCode } from '../modules/codeEvaluator';
import { loadAssignmentConfig } from '../modules/assignmentConfig';
import { updateStudentModel } from '../modules/studentEvaluation';
import { convertBKTToKCLevels } from '../modules/studentEvaluation/kcMapping';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';

const router = Router();

const DATA_DIR = process.env.LOG_DIR || './logs';
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

interface SubmitRequest {
  studentId: string;
  assignmentId: string;
  sessionId: string;
  code: string;
  fileName: string;
}

interface Student {
  id: string;
  passwordHash: string | null;
  level: number;
  kcLevels: Record<string, number>;
  createdAt: string;
  lastLoginAt: string | null;
}

/**
 * Update students.json with BKT-based KC levels
 */
function updateStudentsKCLevels(
  studentId: string,
  bktMastery: Record<string, number> | undefined,
  strugglingRatio?: number
) {
  if (!bktMastery) return;

  try {
    // Load students.json
    if (!fssync.existsSync(STUDENTS_FILE)) {
      console.warn(`[UpdateKCLevels] students.json not found, skipping update`);
      return;
    }

    const students: Record<string, Student> = JSON.parse(
      fssync.readFileSync(STUDENTS_FILE, 'utf-8')
    );

    if (!students[studentId]) {
      console.warn(`[UpdateKCLevels] Student ${studentId} not found in students.json`);
      return;
    }

    // Convert BKT mastery to KC levels (1/2/3) with struggling penalty
    const updatedKCLevels = convertBKTToKCLevels(bktMastery, strugglingRatio);

    // Update student's kcLevels
    students[studentId].kcLevels = updatedKCLevels;

    // Save back to students.json
    fssync.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), 'utf-8');

    if (strugglingRatio !== undefined) {
      console.log(`[UpdateKCLevels] Updated KC levels for ${studentId} (struggling ratio: ${strugglingRatio.toFixed(2)})`);
    } else {
      console.log(`[UpdateKCLevels] Updated KC levels for ${studentId}`);
    }
  } catch (error) {
    console.error(`[UpdateKCLevels] Error updating KC levels:`, error);
  }
}

/**
 * Helper: Extract level from assignmentId (e.g., "test_lv3" -> 3)
 */
function extractLevelFromAssignmentId(assignmentId: string): number | undefined {
  const match = assignmentId.match(/lv(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Helper: Find latest MainTable CSV for student session
 */
async function findLatestMainTableCSV(
  studentId: string,
  assignmentId: string
): Promise<string | undefined> {
  try {
    // Extract level from assignmentId
    const level = extractLevelFromAssignmentId(assignmentId);
    if (!level) return undefined;

    // Try common log patterns
    const logBasePath = path.join(process.cwd(), 'logs');
    const possiblePaths = [
      path.join(logBasePath, assignmentId, studentId),
      path.join(logBasePath, `test_lv${level}`, studentId),
      path.join(logBasePath, studentId)
    ];

    for (const dirPath of possiblePaths) {
      try {
        const files = await fs.readdir(dirPath);
        const mainTableFiles = files
          .filter(f => f.startsWith('MainTable') && f.endsWith('.csv'))
          .sort()
          .reverse(); // Most recent first

        if (mainTableFiles.length > 0) {
          const csvPath = path.join(dirPath, mainTableFiles[0]);
          console.log(`   Found MainTable CSV: ${csvPath}`);
          return csvPath;
        }
      } catch (err) {
        // Directory doesn't exist, try next path
        continue;
      }
    }

    console.log(`   No MainTable CSV found for ${studentId}/${assignmentId}`);
    return undefined;
  } catch (error) {
    console.error(`Error finding MainTable CSV:`, error);
    return undefined;
  }
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

    // Ensure gtCodePath is set (for backward compatibility with old configs)
    if (!assignmentConfig.gtCodePath) {
      assignmentConfig.gtCodePath = path.join(process.cwd(), 'gt_codes', `gt_${assignmentId}.py`);
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

      // Find latest MainTable CSV for this student session
      const csvPath = await findLatestMainTableCSV(studentId, assignmentId);

      // Extract level from assignmentId (e.g., "test_lv3" -> 3)
      const level = extractLevelFromAssignmentId(assignmentId);

      // Use KCs from analysis, fallback to config KCs
      const detectedKCs = analysis.summary.kcs.length > 0
        ? analysis.summary.kcs
        : assignmentConfig.kcs;

      studentModel = updateStudentModel(
        studentId,
        detectedKCs,
        true,
        csvPath,
        level
      );

      console.log(`   Total submissions: ${studentModel.totalSubmissions}`);
      console.log(`   Successful: ${studentModel.successfulSubmissions}`);

      // Update students.json with BKT-based KC levels (with struggling penalty)
      updateStudentsKCLevels(
        studentId,
        studentModel.bktMastery,
        studentModel.lastStrugglingScore?.ratio
      );
    } else {
      console.log(`❌ Code evaluation failed: ${evaluation.reason}`);

      // Update student model with failed attempt
      const csvPath = await findLatestMainTableCSV(studentId, assignmentId);
      const level = extractLevelFromAssignmentId(assignmentId);

      studentModel = updateStudentModel(
        studentId,
        assignmentConfig.kcs,
        false,
        csvPath,
        level
      );

      // Update students.json with BKT-based KC levels (even on failure, with struggling penalty)
      updateStudentsKCLevels(
        studentId,
        studentModel.bktMastery,
        studentModel.lastStrugglingScore?.ratio
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
        unitTestResult: evaluation.unitTestResult
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
        ),
        bktMastery: studentModel.bktMastery,
        lastStrugglingScore: studentModel.lastStrugglingScore,
        lastCombinedScore: studentModel.lastCombinedScore
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

    // Generate new sessionId for next logging session (after submission)
    const newSessionId = `${studentId}_${assignmentId}_${Date.now()}`;

    // Return response
    res.json({
      success: evaluation.success,
      message: evaluation.message,
      reason: evaluation.reason,
      newSessionId: newSessionId, // Frontend should use this for next log session
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
        ),
        bktMastery: studentModel.bktMastery,
        strugglingScore: studentModel.lastStrugglingScore,
        combinedScore: studentModel.lastCombinedScore
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
