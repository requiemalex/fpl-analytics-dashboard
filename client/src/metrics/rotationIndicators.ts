import type { PlayerGameweekHistory } from "../types/normalized";
import { per90 } from "./calculations";

const RECENT_WINDOW_SIZE = 5;

export interface PlayingTimeIndicators {
  windowSize: number;
  appearances: number; // entries in the window with minutes > 0
  startsPercentage: number | null; // starts / appearances, among entries where starts is known
  averageMinutes: number | null; // minutes / appearances
  substituteAppearanceFrequency: number | null; // (appearances - knownStarts) / appearances, among entries where starts is known
  recentMinutes: number; // total minutes across the window, regardless of appearance
}

/**
 * "Recent" = the 5 most recently completed current-season gameweeks
 * present in the player's history (see README → Playing-Time Indicator
 * methodology for the full definition and the least-assumptive choices
 * made where the brief did not pin one down).
 */
export function computePlayingTimeIndicators(history: PlayerGameweekHistory[]): PlayingTimeIndicators {
  const recent = [...history].sort((a, b) => b.round - a.round).slice(0, RECENT_WINDOW_SIZE);

  const appearances = recent.filter((g) => g.minutes > 0).length;
  const recentMinutes = recent.reduce((sum, g) => sum + g.minutes, 0);

  const entriesWithKnownStarts = recent.filter((g) => g.minutes > 0 && g.starts !== null);
  const knownStartsCount = entriesWithKnownStarts.filter((g) => (g.starts ?? 0) > 0).length;

  const startsPercentage = entriesWithKnownStarts.length > 0 ? (knownStartsCount / entriesWithKnownStarts.length) * 100 : null;
  const substituteAppearanceFrequency =
    entriesWithKnownStarts.length > 0 ? ((entriesWithKnownStarts.length - knownStartsCount) / entriesWithKnownStarts.length) * 100 : null;
  const averageMinutes = appearances > 0 ? recentMinutes / recent.length : null;

  return {
    windowSize: recent.length,
    appearances,
    startsPercentage,
    averageMinutes,
    substituteAppearanceFrequency,
    recentMinutes,
  };
}

/** Season-to-date totals across every gameweek entry in the player's current-season history — the Totals row under a gameweek-by-gameweek breakdown table. */
export interface GameweekHistoryTotals {
  matches: number;
  points: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  defensiveContribution: number;
  tackles: number;
  clearancesBlocksInterceptions: number;
  recoveries: number;
  /** Null only if every gameweek entry's value was itself null — shouldn't happen for the live season, but never silently treated as 0 either way. */
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
}

function sumOrNull(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
}

export function computeGameweekTotals(history: PlayerGameweekHistory[]): GameweekHistoryTotals {
  const sum = (fn: (g: PlayerGameweekHistory) => number) => history.reduce((acc, g) => acc + fn(g), 0);
  return {
    matches: history.length,
    points: sum((g) => g.totalPoints),
    starts: sum((g) => g.starts ?? 0),
    minutes: sum((g) => g.minutes),
    goals: sum((g) => g.goals),
    assists: sum((g) => g.assists),
    cleanSheets: sum((g) => g.cleanSheets),
    goalsConceded: sum((g) => g.goalsConceded),
    ownGoals: sum((g) => g.ownGoals),
    penaltiesSaved: sum((g) => g.penaltiesSaved),
    penaltiesMissed: sum((g) => g.penaltiesMissed),
    yellowCards: sum((g) => g.yellowCards),
    redCards: sum((g) => g.redCards),
    saves: sum((g) => g.saves),
    bonus: sum((g) => g.bonus),
    bps: sum((g) => g.bps),
    defensiveContribution: sum((g) => g.defensiveContribution),
    tackles: sum((g) => g.tackles),
    clearancesBlocksInterceptions: sum((g) => g.clearancesBlocksInterceptions),
    recoveries: sum((g) => g.recoveries),
    xG: sumOrNull(history.map((g) => g.xG)),
    xA: sumOrNull(history.map((g) => g.xA)),
    xGI: sumOrNull(history.map((g) => g.xGI)),
    xGC: sumOrNull(history.map((g) => g.xGC)),
  };
}

/** Per-90 rates for the expected-stats columns only — the rest (goals, cards, etc.) are whole-number counting stats a per-90 rate wouldn't meaningfully describe over a handful of gameweeks. */
export interface GameweekHistoryPer90 {
  xGPer90: number | null;
  xAPer90: number | null;
  xGIPer90: number | null;
  xGCPer90: number | null;
}

export function computeGameweekPer90(totals: GameweekHistoryTotals): GameweekHistoryPer90 {
  return {
    xGPer90: per90(totals.xG, totals.minutes),
    xAPer90: per90(totals.xA, totals.minutes),
    xGIPer90: per90(totals.xGI, totals.minutes),
    xGCPer90: per90(totals.xGC, totals.minutes),
  };
}
