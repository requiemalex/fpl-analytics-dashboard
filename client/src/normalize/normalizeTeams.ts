import type { RawTeam } from "../types/raw";
import type { NormalizedTeam } from "../types/normalized";

/** Uses the live FPL teams collection — never a hard-coded 20-club list. */
export function normalizeTeams(rawTeams: RawTeam[]): NormalizedTeam[] {
  return rawTeams.map((t) => ({
    id: t.id,
    code: t.code ?? null,
    name: t.name,
    shortName: t.short_name,
    position: t.position || null,
    played: t.played ?? 0,
    points: t.points ?? 0,
    wins: t.win ?? 0,
    draws: t.draw ?? 0,
    losses: t.loss ?? 0,
    unavailable: t.unavailable ?? false,
    strengthOverallHome: t.strength_overall_home ?? null,
    strengthOverallAway: t.strength_overall_away ?? null,
  }));
}
