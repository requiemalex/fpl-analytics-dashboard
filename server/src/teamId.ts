/**
 * An FPL team ID the entry routes will look up: whole digits, fewer than 12
 * of them (guards against absurd input reaching the upstream API at all),
 * and above 0. The New Squad dialog checks the same rule (client
 * isValidFplTeamId) before asking, so an over-long ID gets "Enter a valid
 * FPL team ID", not an error. Audit 2026-11-03 phase 3 R6: 0 used to pass
 * here and reach FPL.
 */
export function isValidTeamId(raw: string): boolean {
  return /^\d+$/.test(raw) && raw.length < 12 && Number(raw) > 0;
}

/** A season's last gameweek: the Premier League plays 38. */
export const LAST_GAMEWEEK = 38;

/** A gameweek ID the picks route will look up: whole digits, 1 to LAST_GAMEWEEK. */
export function isValidGameweekId(raw: string): boolean {
  return /^\d+$/.test(raw) && raw.length <= 2 && Number(raw) >= 1 && Number(raw) <= LAST_GAMEWEEK;
}

/** The form an ID is asked of FPL and cached under: its number, without leading zeros, so "007" and "7" are one entry. */
export function canonicalId(raw: string): string {
  return String(Number(raw));
}
