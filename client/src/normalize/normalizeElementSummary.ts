import type { RawElementSummary, RawElementSummaryPastSeason, RawHistoricBulk } from "../types/raw";
import type { PlayerGameweekHistory, PlayerSeasonHistory } from "../types/normalized";
import { parseNumericString, parseNumberOrNull } from "./parseNumeric";

/**
 * Current-season gameweek-level history only. This is explicitly NOT
 * historical-season data — element-summary's "history" array covers the
 * live 2026/27 season the player has played in.
 */
export function normalizeElementSummary(raw: RawElementSummary): PlayerGameweekHistory[] {
  return raw.history
    .map((h) => {
      const teamScore = h.was_home ? (h.team_h_score ?? null) : (h.team_a_score ?? null);
      const opponentScore = h.was_home ? (h.team_a_score ?? null) : (h.team_h_score ?? null);
      return {
        fixtureId: h.fixture,
        round: h.round,
        minutes: h.minutes,
        starts: h.starts ?? null,
        totalPoints: h.total_points,
        wasHome: h.was_home,
        opponentTeamId: h.opponent_team,
        teamScore,
        opponentScore,
        goals: h.goals_scored,
        assists: h.assists,
        cleanSheets: h.clean_sheets,
        goalsConceded: h.goals_conceded,
        ownGoals: h.own_goals,
        penaltiesSaved: h.penalties_saved,
        penaltiesMissed: h.penalties_missed,
        yellowCards: h.yellow_cards,
        redCards: h.red_cards,
        saves: h.saves,
        bonus: h.bonus,
        bps: h.bps,
        defensiveContribution: h.defensive_contribution,
        tackles: h.tackles,
        clearancesBlocksInterceptions: h.clearances_blocks_interceptions,
        recoveries: h.recoveries,
        xG: parseNumericString(h.expected_goals ?? null),
        xA: parseNumericString(h.expected_assists ?? null),
        xGI: parseNumericString(h.expected_goal_involvements ?? null),
        xGC: parseNumericString(h.expected_goals_conceded ?? null),
      };
    })
    .sort((a, b) => a.round - b.round || a.fixtureId - b.fixtureId);
}

function priceInMillionsOrNull(tenths: number | undefined): number | null {
  return tenths === undefined || tenths === null ? null : tenths / 10;
}

/**
 * Defensive Contribution is genuinely tracked in history_past from this
 * season onward — confirmed directly against a real defender's data
 * (Gabriel/Arsenal: 159 in 2024/25, 277 in 2025/26). Earlier seasons show
 * 0 as an untracked placeholder, not a real zero, so those get nulled
 * out here rather than silently diluting a historic average.
 */
const DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR = 2024;

function seasonStartYear(seasonName: string): number {
  return parseInt(seasonName.split("/")[0], 10);
}

function normalizePastSeasons(historyPast: RawElementSummaryPastSeason[]): PlayerSeasonHistory[] {
  return (historyPast ?? [])
    .map((s) => ({
      seasonName: s.season_name,
      totalPoints: s.total_points,
      minutes: s.minutes,
      starts: parseNumberOrNull(s.starts ?? null),
      goals: s.goals_scored,
      assists: s.assists,
      cleanSheets: s.clean_sheets,
      goalsConceded: s.goals_conceded ?? null,
      bonus: s.bonus,
      bps: s.bps,
      ictIndex: parseNumericString(s.ict_index ?? null),
      startCost: priceInMillionsOrNull(s.start_cost),
      endCost: priceInMillionsOrNull(s.end_cost),
      xG: parseNumericString(s.expected_goals ?? null),
      xA: parseNumericString(s.expected_assists ?? null),
      xGI: parseNumericString(s.expected_goal_involvements ?? null),
      xGC: parseNumericString(s.expected_goals_conceded ?? null),
      defensiveContribution:
        seasonStartYear(s.season_name) >= DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR ? (s.defensive_contribution ?? null) : null,
    }))
    .sort((a, b) => a.seasonName.localeCompare(b.seasonName));
}

/**
 * Prior-season totals only — element-summary's "history_past" array,
 * never the live season. Oldest season first. A player with no prior
 * seasons in the FPL game (e.g. a summer signing new to the API) gets an
 * empty array here, not a missing one — callers should treat that as "no
 * career history available", not an error.
 */
export function normalizeSeasonHistory(raw: RawElementSummary): PlayerSeasonHistory[] {
  return normalizePastSeasons(raw.history_past ?? []);
}

/**
 * Same per-season mapping as normalizeSeasonHistory, applied to every
 * player in one bulk fetch (/api/historic-bulk) instead of one lazy
 * per-profile request. A player whose bulk fetch was skipped server-side
 * (a transient upstream failure — see RawHistoricBulk.skippedPlayerIds)
 * simply has no entry in the returned map, same as "no career history".
 */
export function normalizeBulkHistoricData(raw: RawHistoricBulk): Map<number, PlayerSeasonHistory[]> {
  const map = new Map<number, PlayerSeasonHistory[]>();
  for (const p of raw.players) {
    map.set(p.playerId, normalizePastSeasons(p.historyPast));
  }
  return map;
}
