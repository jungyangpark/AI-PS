import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DEFAULT_KC_LEVELS } from '../modules/studentEvaluation/kcMapping';

export const studentsRouter = Router();

const DATA_DIR = process.env.LOG_DIR || './logs';
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

// Default test students to auto-register on server start
const DEFAULT_STUDENTS = ['test_lv1', 'test_lv2', 'test_lv3'];

interface Student {
  id: string;
  passwordHash: string | null;  // null = first login, needs to set password
  level: number;                // 1, 2, or 3 (deprecated, kept for backward compatibility)
  kcLevels: Record<string, number>; // KC_ID -> level (1/2/3)
  createdAt: string;
  lastLoginAt: string | null;
}

// KC_000: unmapped
// KC_001 ~ KC_020: 기본 KC (BASE_KCS)
// KC_021 ~ KC_026: Algorithm-specific KC (Recursion 3개 + DP 3개)

function loadStudents(): Record<string, Student> {
  if (fs.existsSync(STUDENTS_FILE)) {
    const students = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf-8'));

    // Migrate old students without kcLevels or with old 11 KCs
    for (const id in students) {
      if (!students[id].kcLevels) {
        students[id].kcLevels = { ...DEFAULT_KC_LEVELS };
      }

      // Upgrade from 11 KCs to 27 KCs for all students
      if (Object.keys(students[id].kcLevels).length < 27) {
        const oldLevels = students[id].kcLevels;
        students[id].kcLevels = { ...DEFAULT_KC_LEVELS };

        // Copy old levels if they exist
        for (const kc in oldLevels) {
          if (kc in students[id].kcLevels) {
            students[id].kcLevels[kc] = oldLevels[kc];
          }
        }
      }

      // Test accounts: set specific KC levels (27 KCs)
      if (id === 'test_lv1') {
        // Level 1 for all KCs
        for (const kc in students[id].kcLevels) {
          students[id].kcLevels[kc] = 1;
        }
      } else if (id === 'test_lv2') {
        // Level 2 for all KCs
        for (const kc in students[id].kcLevels) {
          students[id].kcLevels[kc] = 2;
        }
      } else if (id === 'test_lv3') {
        // Level 3 for all KCs
        for (const kc in students[id].kcLevels) {
          students[id].kcLevels[kc] = 3;
        }
      }
    }

    return students;
  }
  return {};
}

function saveStudents(students: Record<string, Student>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), 'utf-8');
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/students/register — researcher registers new student IDs
studentsRouter.post('/register', (req: Request, res: Response) => {
  const { studentIds, level } = req.body as { studentIds: string[]; level?: number };

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: 'studentIds array is required' });
    return;
  }

  const students = loadStudents();
  const registered: string[] = [];
  const alreadyExists: string[] = [];

  for (const id of studentIds) {
    if (students[id]) {
      alreadyExists.push(id);
    } else {
      const kcLevels = { ...DEFAULT_KC_LEVELS };

      // Test accounts: unify all KC levels
      let unifiedLevel: number | undefined;
      if (id.includes('lv1') || id === 'test_lv1') {
        unifiedLevel = 1;
      } else if (id.includes('lv2') || id === 'test_lv2') {
        unifiedLevel = 2;
      } else if (id.includes('lv3') || id === 'test_lv3') {
        unifiedLevel = 3;
      }

      if (unifiedLevel) {
        for (const kc in kcLevels) {
          kcLevels[kc] = unifiedLevel;
        }
      }

      students[id] = {
        id,
        passwordHash: null,
        level: level || 1,
        kcLevels,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      registered.push(id);
    }
  }

  saveStudents(students);
  res.json({ registered, alreadyExists });
});

// POST /api/students/login — student login (first time: set password)
studentsRouter.post('/login', (req: Request, res: Response) => {
  const { studentId, password } = req.body as { studentId: string; password: string };

  if (!studentId || !password) {
    res.status(400).json({ error: 'studentId and password are required' });
    return;
  }

  const students = loadStudents();
  const student = students[studentId];

  if (!student) {
    res.status(404).json({ error: 'Student ID not found. Contact your researcher.' });
    return;
  }

  // First login: set password
  if (student.passwordHash === null) {
    student.passwordHash = hashPassword(password);
    student.lastLoginAt = new Date().toISOString();
    saveStudents(students);
    res.json({
      status: 'password_set',
      studentId: student.id,
      level: student.level,
      kcLevels: student.kcLevels,
      message: 'Password set successfully. Welcome!',
    });
    return;
  }

  // Subsequent login: verify password
  if (student.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: 'Incorrect password.' });
    return;
  }

  student.lastLoginAt = new Date().toISOString();
  saveStudents(students);
  res.json({
    status: 'ok',
    studentId: student.id,
    level: student.level,
    kcLevels: student.kcLevels,
  });
});

// GET /api/students — list all students (for researcher)
studentsRouter.get('/', (_req: Request, res: Response) => {
  const students = loadStudents();
  const list = Object.values(students).map(s => ({
    id: s.id,
    level: s.level,
    hasPassword: s.passwordHash !== null,
    createdAt: s.createdAt,
    lastLoginAt: s.lastLoginAt,
  }));
  res.json({ students: list });
});

// PUT /api/students/:id/level — update student level (for researcher)
studentsRouter.put('/:id/level', (req: Request, res: Response) => {
  const { id } = req.params;
  const { level } = req.body as { level: number };

  if (!level || level < 1 || level > 3) {
    res.status(400).json({ error: 'level must be 1, 2, or 3' });
    return;
  }

  const students = loadStudents();
  if (!students[id]) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  students[id].level = level;
  saveStudents(students);
  res.json({ studentId: id, level });
});

// PUT /api/students/:id/kc-levels — update specific KC levels (for researcher)
studentsRouter.put('/:id/kc-levels', (req: Request, res: Response) => {
  const { id } = req.params;
  const { kcLevels } = req.body as { kcLevels: Record<string, number> };

  if (!kcLevels || typeof kcLevels !== 'object') {
    res.status(400).json({ error: 'kcLevels object is required' });
    return;
  }

  // Validate all levels are 1, 2, or 3
  for (const [kc, level] of Object.entries(kcLevels)) {
    if (level < 1 || level > 3) {
      res.status(400).json({ error: `Level for ${kc} must be 1, 2, or 3` });
      return;
    }
  }

  const students = loadStudents();
  if (!students[id]) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  // Update only the provided KC levels
  for (const [kc, level] of Object.entries(kcLevels)) {
    students[id].kcLevels[kc] = level;
  }

  saveStudents(students);
  res.json({ studentId: id, kcLevels: students[id].kcLevels });
});

// GET /api/students/:id/kc-levels — get current KC levels
studentsRouter.get('/:id/kc-levels', (req: Request, res: Response) => {
  const { id } = req.params;

  const students = loadStudents();
  if (!students[id]) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  res.json({ studentId: id, kcLevels: students[id].kcLevels });
});

/**
 * Initialize default test students on server startup
 * Called from index.ts when server starts
 */
export function initializeDefaultStudents(): void {
  const students = loadStudents();
  let registered = 0;

  for (const id of DEFAULT_STUDENTS) {
    if (!students[id]) {
      const kcLevels = { ...DEFAULT_KC_LEVELS };

      // Test accounts: unify all KC levels based on ID
      let unifiedLevel: number | undefined;
      if (id.includes('lv1') || id === 'test_lv1') {
        unifiedLevel = 1;
      } else if (id.includes('lv2') || id === 'test_lv2') {
        unifiedLevel = 2;
      } else if (id.includes('lv3') || id === 'test_lv3') {
        unifiedLevel = 3;
      }

      if (unifiedLevel) {
        for (const kc in kcLevels) {
          kcLevels[kc] = unifiedLevel;
        }
      }

      students[id] = {
        id,
        passwordHash: null,
        level: unifiedLevel || 1,
        kcLevels,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      registered++;
    }
  }

  if (registered > 0) {
    saveStudents(students);
    console.log(`✅ Auto-registered ${registered} default students: ${DEFAULT_STUDENTS.join(', ')}`);
  }
}
