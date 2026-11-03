/**
 * An FPL team ID the entry routes will look up: whole digits, fewer than 12
 * of them (guards against absurd input reaching the upstream API at all).
 * The New Squad dialog checks the same rule (client isValidFplTeamId) before
 * asking, so an over-long ID gets "Enter a valid FPL team ID", not an error.
 */
export function isValidTeamId(raw: string): boolean {
  return /^\d+$/.test(raw) && raw.length < 12;
}
