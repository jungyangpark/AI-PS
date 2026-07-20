import * as fs from 'fs';
import * as path from 'path';

export interface KCLevel {
  kc: string; // Knowledge Component name
  level: number; // Student's mastery level (0-1)
  attempts: number; // Number of attempts
  successes: number; // Number of successful attempts
  lastUpdated: string; // ISO timestamp
}

export interface StudentModel {
  studentId: string;
  kcLevels: Record<string, KCLevel>; // KC name -> level info
  totalSubmissions: number;
  successfulSubmissions: number;
  lastActivity: string; // ISO timestamp
}

const STUDENT_DATA_DIR = path.join(__dirname, '../../../student_data');

/**
 * Ensures student data directory exists
 */
function ensureStudentDataDir(): void {
  if (!fs.existsSync(STUDENT_DATA_DIR)) {
    fs.mkdirSync(STUDENT_DATA_DIR, { recursive: true });
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
 * Updates student model based on submission result
 * This is a placeholder for the actual student modeling algorithm
 *
 * @param studentId - Student identifier
 * @param kcs - Knowledge Components demonstrated in this submission
 * @param success - Whether the submission was successful
 * @param codeBlocks - Code blocks extracted from submission (for future use)
 */
export function updateStudentModel(
  studentId: string,
  kcs: string[],
  success: boolean,
  codeBlocks?: any[]
): StudentModel {
  const model = loadStudentModel(studentId);

  // Update submission counts
  model.totalSubmissions += 1;
  if (success) {
    model.successfulSubmissions += 1;
  }
  model.lastActivity = new Date().toISOString();

  // Update KC levels
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

      // Simple update: increase level based on success rate
      // TODO: Replace with actual BKT or other student modeling algorithm
      const successRate = kcLevel.successes / kcLevel.attempts;

      // Increase level, weighted by current level
      // If low level, increase faster; if high level, increase slower
      const increment = (1 - kcLevel.level) * 0.3 * successRate;
      kcLevel.level = Math.min(1, kcLevel.level + increment);
    } else {
      // Decrease level slightly on failure
      kcLevel.level = Math.max(0, kcLevel.level - 0.1);
    }

    kcLevel.lastUpdated = now;
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
