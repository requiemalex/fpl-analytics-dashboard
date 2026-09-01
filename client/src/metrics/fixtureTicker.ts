import type { NormalizedFixture, NormalizedTeam } from "../types/normalized";
import { DASH } from "../utils/format";

export interface UpcomingFixture {
  fixtureId: number;
  opponentShortName: string;
  isHome: boolean;
  /** 1 (easiest) to 5 (hardest), FPL's own rating, from this team's perspective. */
  difficulty: number;
}

/**
 * The next `count` unplayed fixtures for a club, earliest first. Falls
 * back to gameweek/fixture ordering when kickoff times aren't scheduled
 * yet (common for fixtures a long way out).
 */
export function getUpcomingFixtures(teamId: number, fixtures: NormalizedFixture[], teamsById: Map<number, NormalizedTeam>, count = 5): UpcomingFixture[] {
  return fixtures
    .filter((f) => !f.finished && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => {
      if (a.kickoffTime && b.kickoffTime) return a.kickoffTime.localeCompare(b.kickoffTime);
      if (a.eventId !== null && b.eventId !== null && a.eventId !== b.eventId) return a.eventId - b.eventId;
      return a.id - b.id;
    })
    .slice(0, count)
    .map((f) => {
      const isHome = f.homeTeamId === teamId;
      const opponentId = isHome ? f.awayTeamId : f.homeTeamId;
      return {
        fixtureId: f.id,
        opponentShortName: teamsById.get(opponentId)?.shortName ?? "???",
        isHome,
        difficulty: isHome ? f.homeDifficulty : f.awayDifficulty,
      };
    });
}

/** Mean difficulty across a fixture set — null (not 0) when there are none to average, since a fixture-less team isn't "easy," it's unscheduled. */
export function averageFixtureDifficulty(fixtures: UpcomingFixture[]): number | null {
  if (fixtures.length === 0) return null;
  return fixtures.reduce((sum, f) => sum + f.difficulty, 0) / fixtures.length;
}

/** Plain-text form for CSV export — e.g. "AVL(A) CHE(H) SUN(A) BHA(A) LEE(H) avg FDR 3.2". Shared by every table that offers a fixtures column, so an export always matches what that table showed on screen. */
export function formatFixturesForCsv(fixtures: UpcomingFixture[]): string {
  if (fixtures.length === 0) return DASH;
  const codes = fixtures.map((f) => `${f.opponentShortName}(${f.isHome ? "H" : "A"})`).join(" ");
  const avg = averageFixtureDifficulty(fixtures);
  return avg !== null ? `${codes} avg FDR ${avg.toFixed(1)}` : codes;
}

/** FPL's own 1 (easiest, green) to 5 (hardest, red) difficulty colours. */
export function fdrColor(difficulty: number): string {
  switch (difficulty) {
    case 1:
      return "#2a7a4f";
    case 2:
      return "#3fbf7f";
    case 3:
      return "#9fb0a6";
    case 4:
      return "#e0654a";
    default:
      return "#a83a24";
  }
}
