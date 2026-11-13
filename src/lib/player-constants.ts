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
  { code: 'CB',  label: 'CB - Center Back' },
  { code: 'MID', label: 'MID - Midfielder' },
  { code: 'W',   label: 'W - Winger' },
  { code: 'ST',  label: 'ST - Striker' },
  { code: 'FW',  label: 'FW - Forward' },
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
  const clean = value.trim().toUpperCase().replace(/\s*[-–—]\s*/g, ' - ');

  // Direct match by code or exact label
  const directMatch = POSITION_OPTIONS.find(
    (p) =>
      p.code.toUpperCase() === clean ||
      p.label.toUpperCase().replace(/\s*[-–—]\s*/g, ' - ') === clean
  );
  if (directMatch) return directMatch.code;

  // Match by position name or common synonyms
  if (clean === 'FORWARD' || clean === 'FORWARDS') return 'FW';
  if (clean === 'CENTER BACK' || clean === 'CENTRE BACK' || clean === 'CENTREBACK' || clean === 'CENTERBACK') return 'CB';
  if (clean === 'GOALKEEPER' || clean === 'GOAL KEEPER' || clean === 'KEEPER' || clean === 'GOALIE') return 'GK';
  if (clean === 'DEFENDER' || clean === 'DEFENDERS' || clean === 'DEFENCE' || clean === 'DEFENSE') return 'DEF';
  if (clean === 'MIDFIELDER' || clean === 'MIDFIELD' || clean === 'MIDFIELDERS') return 'MID';
  if (clean === 'WINGER' || clean === 'WINGERS' || clean === 'WING') return 'W';
  if (clean === 'STRIKER' || clean === 'STRIKERS') return 'ST';
  if (clean === 'NOT SPECIFIED' || clean === 'NONE' || clean === 'UNSPECIFIED') return 'NS';

  return null;
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
