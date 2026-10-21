import type { Position } from "../types/normalized";
import { FIXED_FLOOR_LIVE_MINUTES, FIXED_FLOOR_MINUTES } from "../metrics/fixedMinutesFloor";
import { rankAmong } from "../metrics/comparativeColour";
import { perGame } from "../metrics/calculations";
import type { UsClubTotals, UsPlayerTotals, UsSeason } from "./schema";

/**
 * <comparative_colouring> for Understat figures on the profiles (the same
 * rule as every FPL figure, on Understat's own numbers only —
 * <one_source_per_figure>): a player's figure ranked within his position
 * (today's, as in every Data View) among every other player's Understat
 * figure for the same season(s); a club's among every other club's.
 *
 * The fixed floor is checked on Understat's own minutes (90 in the live
 * season, 450 in a completed one): a player under it gets no colour and
 * isn't in anyone's pool. Clubs have no floor.
 */
export interface UsComparisonContext {
  seasons: ReadonlyMap<string, UsSeason>;
  liveSeason: string;
  /** FPL player code -> today's position. */
  positionByCode: ReadonlyMap<number, Position>;
  /** FPL player code -> his club's FPL code today (the live season's per-match denominator). */
  clubCodeByPlayerCode: ReadonlyMap<number, number>;
}

/** Completed Premier League seasons: every club plays 38. */
const COMPLETED_SEASON_MATCHES = 38;

export function floorFor(ctx: UsComparisonContext, season: string): number {
  return season === ctx.liveSeason ? FIXED_FLOOR_LIVE_MINUTES : FIXED_FLOOR_MINUTES;
}

/** Whether a player's Understat figures for the season are coloured: he has a row at or above the floor. */
export function playerEligible(ctx: UsComparisonContext, code: number, season: string): boolean {
  const row = ctx.seasons.get(season)?.players.get(code);
  return !!row && row.minutes >= floorFor(ctx, season);
}

/** Other players in his position with a row at or above the floor that season. */
function peers(ctx: UsComparisonContext, code: number, season: string): [number, UsPlayerTotals][] {
  const position = ctx.positionByCode.get(code);
  const file = ctx.seasons.get(season);
  if (!position || !file) return [];
  const floor = floorFor(ctx, season);
  return [...file.players].filter(([c, row]) => c !== code && ctx.positionByCode.get(c) === position && row.minutes >= floor);
}

/** A club's matches played that season, for a per-match figure: 38 in a completed season, its Understat count so far in the live one. */
function clubMatches(ctx: UsComparisonContext, clubCode: number | undefined, season: string): number | null {
  const file = ctx.seasons.get(season);
  if (!file) return null;
  if (file.complete) return COMPLETED_SEASON_MATCHES;
  const played = clubCode === undefined ? undefined : file.clubs.get(clubCode)?.played;
  return played && played > 0 ? played : null;
}

/**
 * A player's Match Log Totals and Average for one Understat figure, ranked:
 * the total among the others' season totals, the per-match average among
 * each other's total ÷ his club's matches. Null when he's under the floor
 * or there's nobody to compare with.
 */
export function playerLogRanks(
  ctx: UsComparisonContext,
  code: number,
  season: string,
  value: (t: UsPlayerTotals) => number | null,
  shown: { total: number | null; average: number | null },
  higherIsBetter: boolean,
): { total: number | null; average: number | null } {
  if (!playerEligible(ctx, code, season)) return { total: null, average: null };
  // Others the figure is known for (Understat's xGC isn't for a season whose shot list is short).
  const others = peers(ctx, code, season).flatMap(([c, row]) => {
    const v = value(row);
    return v === null ? [] : [{ c, row, v }];
  });
  if (!higherIsBetter) {
    // A lower-is-better total grows with minutes — a bench player would look best — so, as FPL's xGC does, the
    // total ranks per game (Understat's minutes) and the average per match against each other's total ÷ his matches.
    const mine = ctx.seasons.get(season)?.players.get(code)?.minutes ?? 0;
    return {
      total: rankAmong(shown.total === null ? null : perGame(shown.total, mine), others.flatMap(({ row, v }) => { const g = perGame(v, row.minutes); return g === null ? [] : [g]; }), false),
      average: rankAmong(shown.average, others.filter(({ row }) => row.appearances > 0).map(({ row, v }) => v / row.appearances), false),
    };
  }
  const averages: number[] = [];
  for (const { c, v } of others) {
    const matches = clubMatches(ctx, ctx.clubCodeByPlayerCode.get(c), season);
    if (matches !== null) averages.push(v / matches);
  }
  return {
    total: rankAmong(shown.total, others.map(({ v }) => v), higherIsBetter),
    average: rankAmong(shown.average, averages, higherIsBetter),
  };
}

/** A club's Match Log Totals and Average for one Understat figure, ranked among every other club's that season (Average: total ÷ matches played). */
export function clubLogRanks(
  ctx: UsComparisonContext,
  code: number,
  season: string,
  value: (t: UsClubTotals) => number,
  shown: { total: number | null; average: number | null },
  higherIsBetter: boolean,
): { total: number | null; average: number | null } {
  const file = ctx.seasons.get(season);
  if (!file) return { total: null, average: null };
  const others = [...file.clubs].filter(([c]) => c !== code).map(([, row]) => row);
  return {
    total: rankAmong(shown.total, others.map(value), higherIsBetter),
    average: rankAmong(
      shown.average,
      others.filter((row) => row.played > 0).map((row) => value(row) / row.played),
      higherIsBetter,
    ),
  };
}

/**
 * A shot-figure pool over a view's seasons: each other player's (or
 * club's) figure per season, over the seasons of the view he qualifies in
 * — `get` returns a season's [numerator, denominator] for a rate, or
 * [total, 1] for a count, so a rate is worked out from the summed parts.
 */
function multiSeasonPool<T>(rowsBySeason: ReadonlyMap<number, T>[], get: (row: T) => [number, number] | null, perSeason: boolean): number[] {
  const sums = new Map<number, { num: number; den: number; seasons: number }>();
  for (const rows of rowsBySeason) {
    for (const [key, row] of rows) {
      const parts = get(row);
      if (parts === null) continue;
      const acc = sums.get(key) ?? { num: 0, den: 0, seasons: 0 };
      acc.num += parts[0];
      acc.den += parts[1];
      acc.seasons += 1;
      sums.set(key, acc);
    }
  }
  const out: number[] = [];
  for (const { num, den, seasons } of sums.values()) {
    if (perSeason) out.push(num / seasons);
    else if (den > 0) out.push(num / den);
  }
  return out;
}

export type ShotFigure = { key: string; higherIsBetter: boolean; perSeason: boolean };

/** Whether a player's shot figures for a view are compared at all: he reaches Understat's floor in at least one of its seasons (a Historic Average's seasons already do). */
export function playerShotsEligible(ctx: UsComparisonContext, code: number, seasons: string[]): boolean {
  return seasons.some((s) => playerEligible(ctx, code, s));
}

/** A player's shot-panel figures ranked within his position over the view's seasons (each other player's qualifying seasons only). */
export function playerShotRanks(
  ctx: UsComparisonContext,
  code: number,
  seasons: string[],
  figures: (ShotFigure & { get: (t: UsPlayerTotals) => [number, number] | null; shown: number | null })[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const eligible = playerShotsEligible(ctx, code, seasons);
  const rowsBySeason = seasons.map((s) => new Map(peers(ctx, code, s).filter(([, row]) => row.shotsComplete)));
  for (const f of figures) {
    out[f.key] = eligible ? rankAmong(f.shown, multiSeasonPool(rowsBySeason, f.get, f.perSeason), f.higherIsBetter) : null;
  }
  return out;
}

/** A club's shot-panel figures ranked among every other club's over the view's seasons. */
export function clubShotRanks(
  ctx: UsComparisonContext,
  code: number,
  seasons: string[],
  complete: (t: UsClubTotals) => boolean,
  figures: (ShotFigure & { get: (t: UsClubTotals) => [number, number] | null; shown: number | null })[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const rowsBySeason = seasons.map((s) => new Map([...(ctx.seasons.get(s)?.clubs ?? new Map<number, UsClubTotals>())].filter(([c, row]) => c !== code && complete(row))));
  for (const f of figures) out[f.key] = rankAmong(f.shown, multiSeasonPool(rowsBySeason, f.get, f.perSeason), f.higherIsBetter);
  return out;
}

/**
 * A club's mean Win or Loss Chance ranked among every club's that season
 * (`league`, which includes its own entry: the one nearest its figure is
 * taken out before ranking).
 */
export function leagueChanceRank(average: number | null, league: number[], higherIsBetter: boolean): number | null {
  if (average === null || league.length < 2) return null;
  let nearest = 0;
  for (let i = 1; i < league.length; i++) if (Math.abs(league[i] - average) < Math.abs(league[nearest] - average)) nearest = i;
  return rankAmong(average, league.filter((_, i) => i !== nearest), higherIsBetter);
}

/** A player's figure for shots faced from one season's summary row, as [numerator, denominator]; null when that row can't give one. */
export type FacedPart = (row: UsPlayerTotals) => [number, number] | null;

/**
 * A defender's or goalkeeper's Shots Faced figures ranked within his
 * position (<shots_faced_on_pitch>), fewer always better. Shots faced
 * depend on time on the pitch, so each `part` is a rate: a count as
 * [count × 90, minutes] (per 90 minutes), a share as [part, whole]. His own
 * figure is worked out from his own season rows the same way, so he's
 * ranked on exactly what the others are. Null for every figure when he's
 * under the floor, or a season here has no shots-faced totals yet (a file
 * from before the sync added them); others need complete ones.
 */
export function playerFacedRanks(ctx: UsComparisonContext, code: number, seasons: string[], parts: Record<string, FacedPart>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const own = seasons.flatMap((s) => {
    const row = ctx.seasons.get(s)?.players.get(code);
    return row ? [row] : [];
  });
  const usable = playerShotsEligible(ctx, code, seasons) && own.length > 0 && own.every((row) => !!row.facing);
  const rowsBySeason = seasons.map((s) => new Map(peers(ctx, code, s).filter(([, row]) => row.facing?.complete)));
  for (const [key, part] of Object.entries(parts)) {
    if (!usable) {
      out[key] = null;
      continue;
    }
    let num = 0;
    let den = 0;
    for (const row of own) {
      const p = part(row);
      if (p) {
        num += p[0];
        den += p[1];
      }
    }
    out[key] = den > 0 ? rankAmong(num / den, multiSeasonPool(rowsBySeason, part, false), false) : null;
  }
  return out;
}

/**
 * A formation's per-90 figure ranked among every other club's per-90
 * figure for the whole season (`value` over its matches played) — how the
 * club does in that formation against the league. Clubs have no floor.
 */
export function formationRank(ctx: UsComparisonContext, code: number, season: string, shown: number | null, value: (t: UsClubTotals) => number, higherIsBetter: boolean): number | null {
  const file = ctx.seasons.get(season);
  if (!file) return null;
  const others = [...file.clubs].filter(([c, row]) => c !== code && row.played > 0).map(([, row]) => value(row) / row.played);
  return rankAmong(shown, others, higherIsBetter);
}
