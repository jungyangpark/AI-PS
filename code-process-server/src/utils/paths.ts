import * as path from 'path';

/**
 * Single source of truth for where logs, students.json, submissions and
 * student_levels.csv live. Point LOG_DIR at a persistent disk in production
 * (e.g. /var/data/logs on Render).
 */
export const LOG_DIR = path.resolve(process.env.LOG_DIR || path.join(process.cwd(), 'logs'));

/**
 * Registered assignment configs ({id}.json). Point ASSIGNMENTS_DIR at a persistent disk
 * (e.g. /var/data/assignments on Render) so registrations survive redeploys.
 */
export const ASSIGNMENTS_DIR = path.resolve(process.env.ASSIGNMENTS_DIR || path.join(process.cwd(), 'assignments'));

// Student IDs, assignment IDs, session IDs, code state IDs: letters, digits, Korean, _ - .
// A leading dot is rejected so "." / ".." can never be used to leave a directory.
const SAFE_ID = /^[A-Za-z0-9가-힣_\-.]{1,128}$/;

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value) && !value.startsWith('.');
}

/**
 * path.join that refuses to leave `base` (blocks "../" in any part, absolute
 * parts, and symlink-free traversal tricks after resolution).
 */
export function safeJoin(base: string, ...parts: string[]): string {
  const root = path.resolve(base);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path escapes the base directory');
  }
  return target;
}
