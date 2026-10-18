/**
 * Accuracy checks run on every sync, before anything is written. Two kinds:
 *
 *  - Understat against itself: each match's goals add up from its players
 *    (plus the other side's own goals), and the match and club pages give
 *    the same club xG — a failure means a garbled download. Players' xG
 *    not adding up to the listed shots' xG is Understat's own gap (once in
 *    3,865 matches), so a warning (<incomplete_shot_list>). (Club xG is NOT the sum of its
 *    shots: Understat counts a shot and its rebound as one chance — see
 *    <club_xg_is_per_chance> in client/src/understat/columns.ts.)
 *  - Understat against FPL: match scores, player goals and own goals are
 *    the same facts in both sources (0 differences in 23,837 player-matches
 *    across 2021/22, 2022/23 and 2026/27), which is why the app shows them
 *    from FPL only, with no source toggle. These checks keep proving that;
 *    if it ever stops being true the run fails and alerts, rather than the
 *    app quietly showing two versions of a goal.
 *
 * Errors stop the run (nothing written). Warnings go in the run report.
 */
import type { LedgerRow } from "../../clubHistory/types.js";
import type { SeasonData } from "./files.js";
import type { PlayerLink } from "./types.js";

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

/** Understat rounds each figure separately. */
const XG_TOLERANCE = 0.02;
/** Above this share of linked player-matches with different goals, something is wrong rather than a one-off correction. */
const MAX_GOAL_DIFFERENCE_SHARE = 0.005;

export function checkSeasonInternally(data: SeasonData): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const appsByMatch = new Map<string, SeasonData["appearances"]>();
  for (const a of data.appearances) appsByMatch.set(a.matchId, [...(appsByMatch.get(a.matchId) ?? []), a]);
  const shotsByMatch = new Map<string, SeasonData["shots"]>();
  for (const s of data.shots) shotsByMatch.set(s.matchId, [...(shotsByMatch.get(s.matchId) ?? []), s]);
  const teamMatchKeys = new Set(data.teamMatches.map((t) => `${t.matchId}|${t.teamId}`));

  for (const m of data.matches) {
    if (!m.isResult) continue;
    const apps = appsByMatch.get(m.id) ?? [];
    if (apps.length === 0) {
      errors.push(`${data.season}: match ${m.id} has a result but no line-ups`);
      continue;
    }
    for (const [team, side] of [
      [m.homeTeamId, "h"],
      [m.awayTeamId, "a"],
    ] as const) {
      if (!teamMatchKeys.has(`${m.id}|${team}`)) errors.push(`${data.season}: match ${m.id} has no club figures (PPDA, xPts…) for team ${team}`);
      const own = apps.filter((a) => a.side === side).reduce((s, a) => s + a.goals, 0);
      const theirOwnGoals = apps.filter((a) => a.side !== side).reduce((s, a) => s + a.ownGoals, 0);
      const expected = side === "h" ? m.homeGoals : m.awayGoals;
      if (expected !== null && own + theirOwnGoals !== expected) {
        errors.push(`${data.season}: match ${m.id} — players' goals for side ${side} add up to ${own + theirOwnGoals}, the score says ${expected}`);
      }
      const shotXG = (shotsByMatch.get(m.id) ?? []).filter((s) => s.side === side && s.result !== "OwnGoal").reduce((s, x) => s + x.xG, 0);
      const playerXG = apps.filter((a) => a.side === side).reduce((s, a) => s + a.xG, 0);
      if (Math.abs(shotXG - playerXG) > XG_TOLERANCE) {
        // Understat's own published data, not a bad download (re-fetching gives the same) — so a
        // warning, and the affected shot-based figures show "—" (<incomplete_shot_list>, aggregate.ts).
        warnings.push(
          `${data.season}: match ${m.id} — Understat's shot list for side ${side} is missing shots (players' xG ${playerXG.toFixed(2)}, listed shots' ${shotXG.toFixed(2)}); those players' and clubs' shot-based figures show "—" for the season`,
        );
      }
      const matchXG = side === "h" ? m.homeXG : m.awayXG;
      const clubXG = data.teamMatches.find((t) => t.matchId === m.id && t.teamId === team)?.xG;
      if (matchXG !== null && clubXG !== undefined && Math.abs(clubXG - matchXG) > XG_TOLERANCE) {
        errors.push(`${data.season}: match ${m.id} — the match page gives side ${side} ${matchXG.toFixed(2)} xG, the club page ${clubXG.toFixed(2)}`);
      }
    }
  }
  return { errors, warnings };
}

/** FPL and Understat must agree on every linked player's goals and own goals in every paired match. */
export function checkAgainstFpl(
  data: SeasonData,
  ledgerRows: LedgerRow[],
  matchByFixture: Map<number, string>,
  links: Map<number, PlayerLink>,
): CheckResult & { compared: number } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byKey = new Map(data.appearances.map((a) => [`${a.matchId}|${a.playerId}`, a]));
  let compared = 0;
  const differences: string[] = [];
  for (const row of ledgerRows) {
    const link = links.get(row.code);
    const match = matchByFixture.get(row.fixture);
    if (!link || link.status !== "confirmed" || match === undefined) continue;
    const us = byKey.get(`${match}|${link.understatId}`);
    if (row.minutes <= 0 && (!us || us.minutes <= 0)) continue;
    compared += 1;
    const usGoals = us?.goals ?? 0;
    const usOwn = us?.ownGoals ?? 0;
    if (usGoals !== row.goals || (row.ownGoals !== null && usOwn !== row.ownGoals)) {
      differences.push(`${link.fplName} in match ${match}: FPL ${row.goals} goals/${row.ownGoals ?? "?"} own goals, Understat ${usGoals}/${usOwn}`);
    }
  }
  if (differences.length > 0) {
    const share = differences.length / Math.max(1, compared);
    const line = `${data.season}: ${differences.length} of ${compared} player-matches have different goals in FPL and Understat (e.g. ${differences.slice(0, 3).join("; ")})`;
    if (share > MAX_GOAL_DIFFERENCE_SHARE) errors.push(line);
    else warnings.push(line);
  }
  return { errors, warnings, compared };
}
