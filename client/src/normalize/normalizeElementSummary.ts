import type { RawElementSummary, RawElementSummaryPastSeason, RawHistoricBulk } from "../types/raw";
import type { PlayerGameweekHistory, PlayerSeasonHistory, SeasonMatch } from "../types/normalized";
import { parseNumericString, parseNumberOrNull } from "./parseNumeric";
import { seasonStartYear } from "../utils/season";

/**
 * Current-season gameweek-level history only. This is explicitly NOT
 * historical-season data — element-summary's "history" array covers the
 * live 2026/27 season the player has played in.
 *
 * <kicked_off_only>: once a gameweek is current, FPL lists each club's
 * match in it before kick-off too, with both scores null and every figure
 * 0 (Haaland's GW8 at Villa, live API checked 2026-10-24). That match
 * hasn't happened, so it's left out here: counted, it made the profile's
 * Match Log say 8 matches and average 77 minutes for 7 played at 88. A
 * match under way already has its score, so it stays.
 */
export function normalizeElementSummary(raw: RawElementSummary): PlayerGameweekHistory[] {
  return raw.history
    .filter((h) => (h.team_h_score ?? null) !== null || (h.team_a_score ?? null) !== null)
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

/**
 * Starts and the expected-stats family (xG, xA, xGI, xGC) are tracked in
 * history_past from 2022/23. Earlier seasons carry FPL's placeholder 0 /
 * "0.00" (Pickford 2021/22: 3,150 minutes, 0 starts, xGC "0.00"; live API
 * checked 2026-10-18), so they're nulled here and show "—", never as real
 * figures (audit 2026-10-18 M14).
 */
const STARTS_AND_EXPECTED_TRACKING_START_YEAR = 2022;

/**
 * DC's parts (tackles, CBI, recoveries) are tracked a season after DC
 * itself, from 2025/26: Gabriel 2024/25 shows DC 159 but 0 / 0 / 0, and
 * 2025/26 CBI 239 + tackles 38 = DC 277 (live API checked 2026-10-18).
 * Earlier seasons' 0 is a placeholder, nulled here.
 */
const DC_PARTS_TRACKING_START_YEAR = 2025;

function normalizePastSeasons(historyPast: RawElementSummaryPastSeason[]): PlayerSeasonHistory[] {
  return (historyPast ?? [])
    .map((s) => {
      const tracked = seasonStartYear(s.season_name) >= STARTS_AND_EXPECTED_TRACKING_START_YEAR;
      const dcPartsTracked = seasonStartYear(s.season_name) >= DC_PARTS_TRACKING_START_YEAR;
      return {
        seasonName: s.season_name,
        totalPoints: s.total_points,
        minutes: s.minutes,
        starts: tracked ? parseNumberOrNull(s.starts ?? null) : null,
        goals: s.goals_scored,
        assists: s.assists,
        cleanSheets: s.clean_sheets,
        goalsConceded: s.goals_conceded ?? null,
        bonus: s.bonus,
        bps: s.bps,
        ictIndex: parseNumericString(s.ict_index ?? null),
        startCost: priceInMillionsOrNull(s.start_cost),
        endCost: priceInMillionsOrNull(s.end_cost),
        xG: tracked ? parseNumericString(s.expected_goals ?? null) : null,
        xA: tracked ? parseNumericString(s.expected_assists ?? null) : null,
        xGI: tracked ? parseNumericString(s.expected_goal_involvements ?? null) : null,
        xGC: tracked ? parseNumericString(s.expected_goals_conceded ?? null) : null,
        defensiveContribution:
          seasonStartYear(s.season_name) >= DEFENSIVE_CONTRIBUTION_TRACKING_START_YEAR ? (s.defensive_contribution ?? null) : null,
        // Tracked in every season history_past covers (Pickford 2016/17–2025/26:
        // 89–135 saves a season; live API checked 2026-10-18).
        saves: parseNumberOrNull(s.saves ?? null),
        penaltiesSaved: parseNumberOrNull(s.penalties_saved ?? null),
        yellowCards: parseNumberOrNull(s.yellow_cards ?? null),
        redCards: parseNumberOrNull(s.red_cards ?? null),
        influence: parseNumericString(s.influence ?? null),
        creativity: parseNumericString(s.creativity ?? null),
        threat: parseNumericString(s.threat ?? null),
        tackles: dcPartsTracked ? parseNumberOrNull(s.tackles ?? null) : null,
        clearancesBlocksInterceptions: dcPartsTracked ? parseNumberOrNull(s.clearances_blocks_interceptions ?? null) : null,
        recoveries: dcPartsTracked ? parseNumberOrNull(s.recoveries ?? null) : null,
      };
    })
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
/** Each player's <season_matches>, oldest first; a player whose entry has none (an older server build) is left out, never given an empty season. */
export function normalizeBulkSeasonMatches(raw: RawHistoricBulk): Map<number, SeasonMatch[]> {
  const map = new Map<number, SeasonMatch[]>();
  for (const p of raw.players) {
    if (p.seasonMatches) map.set(p.playerId, p.seasonMatches.map(([minutes, starts]) => ({ minutes, started: starts > 0 })));
  }
  return map;
}

export function normalizeBulkHistoricData(raw: RawHistoricBulk): Map<number, PlayerSeasonHistory[]> {
  const map = new Map<number, PlayerSeasonHistory[]>();
  for (const p of raw.players) {
    map.set(p.playerId, normalizePastSeasons(p.historyPast));
  }
  return map;
}
