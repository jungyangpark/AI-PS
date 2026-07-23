import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface KCLevel {
  kc: string; // Knowledge Component name
  level: number; // Student's mastery level (0-1)
  attempts: number; // Number of attempts
  successes: number; // Number of successful attempts
  lastUpdated: string; // ISO timestamp
}

export interface BKTMastery {
  [kc: string]: number; // KC name -> P(mastery)
}

export interface StrugglingScoreResult {
  score: number;
  max_score: number;
  ratio: number;
  breakdown: Record<string, number>;
}

export interface CombinedScore {
  bkt_weight: number;
  struggling_ratio: number;
  combined: number;
  interpretation: string;
}

export interface StudentModel {
  studentId: string;
  kcLevels: Record<string, KCLevel>; // KC name -> level info
  totalSubmissions: number;
  successfulSubmissions: number;
  lastActivity: string; // ISO timestamp
  bktMastery?: BKTMastery; // BKT P(mastery) values
  lastStrugglingScore?: StrugglingScoreResult;
  lastCombinedScore?: CombinedScore;
}

const STUDENT_DATA_DIR = path.join(__dirname, '../../../student_data');
const PYTHON_SCRIPT = path.join(__dirname, 'evaluate_student.py');

// Test accounts that should not have their levels updated
const TEST_ACCOUNTS = ['test_lv1', 'test_lv2', 'test_lv3'];

/**
 * Ensures student data directory exists
 */
function ensureStudentDataDir(): void {
  if (!fs.existsSync(STUDENT_DATA_DIR)) {
    fs.mkdirSync(STUDENT_DATA_DIR, { recursive: true });
  }
}

/**
 * Runs Python evaluation script and returns results
 */
interface PythonEvaluationInput {
  student_id: string;
  csv_path?: string;
  kcs: string[];
  success: boolean;
  current_mastery?: BKTMastery;
  level?: number;
}

interface PythonEvaluationResult {
  student_id: string;
  success: boolean;
  bkt_result: {
    updated_mastery: BKTMastery;
    summary: {
      avg_base: number;          // 기본 KC 평균
      avg_alg: number;           // 알고리즘 KC 평균
      avg_all: number;           // 전체 KC 평균
      bkt_weight: number;
      mastered_kcs: string[];
      mastered_base_kcs: string[];  // 숙달된 기본 KC
      mastered_alg_kcs: string[];   // 숙달된 알고리즘 KC
      mastered_count: number;
      total_kcs: number;
      base_kc_count: number;     // 기본 KC 개수
      alg_kc_count: number;      // 알고리즘 KC 개수
    };
  };
  struggling_result?: {
    features?: any;
    struggling_score?: StrugglingScoreResult;
    error?: string;
  };
  combined_score?: CombinedScore;
}

function runPythonEvaluation(input: PythonEvaluationInput): PythonEvaluationResult | null {
  try {
    const inputJson = JSON.stringify(input);
    const result = execSync(`python3 "${PYTHON_SCRIPT}"`, {
      input: inputJson,
      encoding: 'utf-8',
      cwd: path.dirname(PYTHON_SCRIPT),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    return JSON.parse(result) as PythonEvaluationResult;
  } catch (error: any) {
    console.error('Error running Python evaluation:', error);
    console.error('stderr:', error.stderr?.toString());
    console.error('stdout:', error.stdout?.toString());
    return null;
  }
}

/**
 * Gets the file path for a student's model
 */
function getStudentModelPath(studentId: string): string {
  ensureStudentDataDir();
  return path.join(STUDENT_DATA_DIR, `${studentId}_model.json`);
}

/**
 * Loads a student's current model
 */
export function loadStudentModel(studentId: string): StudentModel {
  const filePath = getStudentModelPath(studentId);

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as StudentModel;
    } catch (error) {
      console.error(`Error loading student model for ${studentId}:`, error);
    }
  }

  // Return default model if not found
  return {
    studentId,
    kcLevels: {},
    totalSubmissions: 0,
    successfulSubmissions: 0,
    lastActivity: new Date().toISOString()
  };
}

/**
 * Saves a student's model
 */
export function saveStudentModel(model: StudentModel): boolean {
  try {
    const filePath = getStudentModelPath(model.studentId);
    fs.writeFileSync(filePath, JSON.stringify(model, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error saving student model for ${model.studentId}:`, error);
    return false;
  }
}

/**
 * Updates student model based on submission result using BKT
 *
 * @param studentId - Student identifier
 * @param kcs - Knowledge Components demonstrated in this submission
 * @param success - Whether the submission was successful
 * @param csvPath - Optional path to MainTable CSV for struggling score calculation
 * @param level - Optional problem level (1 or 3)
 */
export function updateStudentModel(
  studentId: string,
  kcs: string[],
  success: boolean,
  csvPath?: string,
  level?: number
): StudentModel {
  const model = loadStudentModel(studentId);

  // Update submission counts
  model.totalSubmissions += 1;
  if (success) {
    model.successfulSubmissions += 1;
  }
  model.lastActivity = new Date().toISOString();

  // Check if this is a test account - skip BKT calculation for test accounts
  if (TEST_ACCOUNTS.includes(studentId)) {
    console.log(`[Test Account] Skipping BKT calculation for ${studentId}`);

    // Save and return model without BKT updates
    saveStudentModel(model);
    return model;
  }

  // Run Python BKT evaluation
  const pythonInput: PythonEvaluationInput = {
    student_id: studentId,
    csv_path: csvPath,
    kcs,
    success,
    current_mastery: model.bktMastery,
    level
  };

  const pythonResult = runPythonEvaluation(pythonInput);

  if (pythonResult) {
    // Update BKT mastery
    model.bktMastery = pythonResult.bkt_result.updated_mastery;

    // Update struggling score
    if (pythonResult.struggling_result?.struggling_score) {
      model.lastStrugglingScore = pythonResult.struggling_result.struggling_score;
    }

    // Update combined score
    if (pythonResult.combined_score) {
      model.lastCombinedScore = pythonResult.combined_score;
    }

    // Update KC levels from BKT mastery
    const now = new Date().toISOString();
    for (const kc of kcs) {
      if (!model.kcLevels[kc]) {
        model.kcLevels[kc] = {
          kc,
          level: 0,
          attempts: 0,
          successes: 0,
          lastUpdated: now
        };
      }

      const kcLevel = model.kcLevels[kc];
      kcLevel.attempts += 1;

      if (success) {
        kcLevel.successes += 1;
      }

      // Update level from BKT mastery
      if (model.bktMastery && model.bktMastery[kc] !== undefined) {
        kcLevel.level = model.bktMastery[kc];
      }

      kcLevel.lastUpdated = now;
    }
  } else {
    // Fallback to simple algorithm if Python script fails
    console.warn(`BKT evaluation failed for ${studentId}, using fallback algorithm`);

    const now = new Date().toISOString();
    for (const kc of kcs) {
      if (!model.kcLevels[kc]) {
        model.kcLevels[kc] = {
          kc,
          level: 0,
          attempts: 0,
          successes: 0,
          lastUpdated: now
        };
      }

      const kcLevel = model.kcLevels[kc];
      kcLevel.attempts += 1;

      if (success) {
        kcLevel.successes += 1;
        const successRate = kcLevel.successes / kcLevel.attempts;
        const increment = (1 - kcLevel.level) * 0.3 * successRate;
        kcLevel.level = Math.min(1, kcLevel.level + increment);
      } else {
        kcLevel.level = Math.max(0, kcLevel.level - 0.1);
      }

      kcLevel.lastUpdated = now;
    }
  }

  // Save updated model
  saveStudentModel(model);

  return model;
}

/**
 * Gets student's overall mastery level (average of all KC levels)
 */
export function getOverallMasteryLevel(studentId: string): number {
  const model = loadStudentModel(studentId);
  const kcLevels = Object.values(model.kcLevels);

  if (kcLevels.length === 0) {
    return 0;
  }

  const totalLevel = kcLevels.reduce((sum, kc) => sum + kc.level, 0);
  return totalLevel / kcLevels.length;
}

/**
 * Gets student's level for specific KCs
 */
export function getKCLevels(studentId: string, kcs: string[]): Record<string, number> {
  const model = loadStudentModel(studentId);
  const levels: Record<string, number> = {};

  for (const kc of kcs) {
    levels[kc] = model.kcLevels[kc]?.level || 0;
  }

  return levels;
}
