import * as fs from 'fs';
import * as path from 'path';
import { CodeEvaluationConfig } from './codeEvaluator';

export interface AssignmentConfig {
  assignmentId: string;
  title: string;
  description: string;
  testCases: CodeEvaluationConfig['testCases'];
  gtCodePath: string; // Path to GT code file
  expectedComplexity: string;
  kcs: string[]; // Knowledge Components for this assignment
}

const ASSIGNMENTS_DIR = path.join(__dirname, '../../assignments');

/**
 * Loads assignment configuration from JSON file
 * @param assignmentId - The assignment ID to load
 * @returns Assignment configuration or null if not found
 */
export function loadAssignmentConfig(assignmentId: string): AssignmentConfig | null {
  try {
    // Try to find assignment file
    const files = fs.readdirSync(ASSIGNMENTS_DIR);
    const assignmentFile = files.find(file =>
      file.endsWith('.json') && file.includes(assignmentId)
    );

    if (!assignmentFile) {
      console.error(`Assignment ${assignmentId} not found`);
      return null;
    }

    const filePath = path.join(ASSIGNMENTS_DIR, assignmentFile);
    const content = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content) as AssignmentConfig;

    return config;
  } catch (error) {
    console.error(`Error loading assignment ${assignmentId}:`, error);
    return null;
  }
}

/**
 * Lists all available assignments
 */
export function listAssignments(): string[] {
  try {
    const files = fs.readdirSync(ASSIGNMENTS_DIR);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  } catch (error) {
    console.error('Error listing assignments:', error);
    return [];
  }
}

/**
 * Saves a new assignment configuration
 */
export function saveAssignmentConfig(config: AssignmentConfig): boolean {
  try {
    const fileName = `${config.assignmentId}.json`;
    const filePath = path.join(ASSIGNMENTS_DIR, fileName);

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error saving assignment ${config.assignmentId}:`, error);
    return false;
  }
}
