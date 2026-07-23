/**
 * KC Mapping Configuration
 *
 * KC_000: Unmapped (매핑 안된 모든 코드)
 * KC_001 ~ KC_020: 기본 KC (BASE_KCS)
 * KC_021 ~ KC_026: Algorithm-specific KC (Recursion 3개 + DP 3개)
 */

// KC ID to KC Name mapping
export const KC_ID_TO_NAME: Record<string, string> = {
  'KC_000': 'unmapped',

  // 기본 KC (입출력·기본 4개)
  'KC_001': 'input_str',
  'KC_002': 'input_cast',
  'KC_003': 'output',
  'KC_004': 'assignment',

  // 제어 흐름 (5개)
  'KC_005': 'conditional',
  'KC_006': 'loop_counting',
  'KC_007': 'loop_until',
  'KC_008': 'loop_elements',
  'KC_009': 'loop_nested',

  // 함수 (3개)
  'KC_010': 'function_call',
  'KC_011': 'function_def',
  'KC_012': 'function_return',

  // 자료구조 (5개)
  'KC_013': 'list',
  'KC_014': 'list_2d',
  'KC_015': 'dictionary',
  'KC_016': 'set',
  'KC_017': 'tuple',

  // 기타 (3개)
  'KC_018': 'stat_calculate',
  'KC_019': 'file_read',
  'KC_020': 'file_write',

  // Algorithm-specific KC - Recursion (3개)
  'KC_021': 'rec_base_case',
  'KC_022': 'rec_call',
  'KC_023': 'rec_convergence',

  // Algorithm-specific KC - DP (3개)
  'KC_024': 'dp_memoization',
  'KC_025': 'dp_base_init',
  'KC_026': 'dp_recurrence',
};

// KC Name to KC ID mapping (reverse)
export const KC_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(KC_ID_TO_NAME).map(([id, name]) => [name, id])
);

// All KC IDs
export const ALL_KC_IDS = Object.keys(KC_ID_TO_NAME);

// Default KC levels for new students (all start at Level 2)
export const DEFAULT_KC_LEVELS: Record<string, number> = Object.fromEntries(
  ALL_KC_IDS.map(id => [id, 2])
);

/**
 * Convert BKT mastery (0~1) to level (1/2/3)
 *
 * @param mastery - BKT P(mastery) value (0~1)
 * @returns Level 1, 2, or 3
 */
export function masteryToLevel(mastery: number): number {
  if (mastery < 0.3) return 1;
  if (mastery < 0.7) return 2;
  return 3;
}

/**
 * Convert KC name to KC ID
 *
 * @param kcName - KC name (e.g., 'conditional', 'rec_base_case')
 * @returns KC ID (e.g., 'KC_005', 'KC_021') or 'KC_000' if unmapped
 */
export function getKCId(kcName: string): string {
  return KC_NAME_TO_ID[kcName] || 'KC_000';
}

/**
 * Convert KC ID to KC name
 *
 * @param kcId - KC ID (e.g., 'KC_005')
 * @returns KC name (e.g., 'conditional') or 'unmapped' if not found
 */
export function getKCName(kcId: string): string {
  return KC_ID_TO_NAME[kcId] || 'unmapped';
}

/**
 * Convert BKT mastery map to KC levels (1/2/3)
 *
 * @param bktMastery - BKT mastery map (KC name -> mastery)
 * @param strugglingRatio - Struggling score ratio (0-1, optional)
 * @returns KC levels map (KC ID -> level 1/2/3)
 */
export function convertBKTToKCLevels(
  bktMastery: Record<string, number>,
  strugglingRatio?: number
): Record<string, number> {
  const kcLevels: Record<string, number> = { ...DEFAULT_KC_LEVELS };

  for (const [kcName, mastery] of Object.entries(bktMastery)) {
    const kcId = getKCId(kcName);

    // Apply struggling penalty: struggling이 높으면 mastery 감소
    let adjustedMastery = mastery;
    if (strugglingRatio !== undefined && strugglingRatio > 0) {
      const strugglePenalty = 1 - strugglingRatio;
      adjustedMastery = mastery * strugglePenalty;
      adjustedMastery = Math.max(0, Math.min(1, adjustedMastery)); // 0-1 범위 제한
    }

    const level = masteryToLevel(adjustedMastery);
    kcLevels[kcId] = level;
  }

  return kcLevels;
}
