/**
 * src/lib/player-constants.ts
 *
 * Centralized constants for player positions, categories, and helpers.
 */

export interface PositionOption {
  code: string;
  label: string;
}

export const POSITION_OPTIONS: readonly PositionOption[] = [
  { code: 'GK',  label: 'GK - Goalkeeper' },
  { code: 'DEF', label: 'DEF - Defender' },
  { code: 'MID', label: 'MID - Midfielder' },
  { code: 'W',   label: 'W - Winger' },
  { code: 'ST',  label: 'ST - Striker' },
  { code: 'NS',  label: 'NS - Not specified' },
] as const;

export const DEFAULT_POSITION = 'NS';

export const CATEGORY_OPTIONS: readonly string[] = [
  'Senior',
  'Experienced',
  'Intermediate',
  'Beginner',
  'Young',
  'Newcomer',
] as const;

export function getPositionLabel(code: string | null | undefined): string {
  if (!code) return 'Not specified';
  const found = POSITION_OPTIONS.find((p) => p.code.toUpperCase() === code.toUpperCase());
  return found ? found.label : code;
}

export function normalizePositionCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().toUpperCase();
  const match = POSITION_OPTIONS.find(
    (p) => p.code.toUpperCase() === clean || p.label.toUpperCase() === clean
  );
  return match ? match.code : null;
}

export function normalizeCategory(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  const match = CATEGORY_OPTIONS.find((c) => c.toLowerCase() === clean);
  return match ?? null;
}

export function isValidPosition(code: string | null | undefined): boolean {
  return normalizePositionCode(code) !== null;
}

export function isValidCategory(cat: string | null | undefined): boolean {
  return normalizeCategory(cat) !== null;
}

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

