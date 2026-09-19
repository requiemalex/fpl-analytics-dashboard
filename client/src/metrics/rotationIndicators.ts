import type { PlayerGameweekHistory } from "../types/normalized";

export interface SeasonAverageMinutes {
  averageMinutes: number | null;
  gameweeksPlayed: number;
}

/**
 * Average minutes per completed gameweek across the whole current season
 * so far — not a rolling recent-form window — used to drive the player
 * profile's single-icon Playing Time summary (see README → Playing-time
 * indicator methodology).
 */
export function computeSeasonAverageMinutes(history: PlayerGameweekHistory[]): SeasonAverageMinutes {
  const gameweeksPlayed = history.length;
  if (gameweeksPlayed === 0) return { averageMinutes: null, gameweeksPlayed: 0 };
  const totalMinutes = history.reduce((sum, g) => sum + g.minutes, 0);
  return { averageMinutes: totalMinutes / gameweeksPlayed, gameweeksPlayed };
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

/** Average per completed gameweek — total ÷ gameweeks played — for every
 * column in the Season Log table, not just the four expected-stats
 * columns a per-90-minutes rate used to cover (leaving every other
 * column's average cell blank). */
export interface GameweekHistoryAverages {
  points: number | null;
  starts: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  cleanSheets: number | null;
  goalsConceded: number | null;
  ownGoals: number | null;
  penaltiesSaved: number | null;
  penaltiesMissed: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  bonus: number | null;
  bps: number | null;
  defensiveContribution: number | null;
  tackles: number | null;
  clearancesBlocksInterceptions: number | null;
  recoveries: number | null;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  xGC: number | null;
}

export function computeGameweekAverages(totals: GameweekHistoryTotals): GameweekHistoryAverages {
  const matches = totals.matches;
  const avg = (total: number | null) => (matches > 0 && total !== null ? total / matches : null);
  return {
    points: avg(totals.points),
    starts: avg(totals.starts),
    minutes: avg(totals.minutes),
    goals: avg(totals.goals),
    assists: avg(totals.assists),
    cleanSheets: avg(totals.cleanSheets),
    goalsConceded: avg(totals.goalsConceded),
    ownGoals: avg(totals.ownGoals),
    penaltiesSaved: avg(totals.penaltiesSaved),
    penaltiesMissed: avg(totals.penaltiesMissed),
    yellowCards: avg(totals.yellowCards),
    redCards: avg(totals.redCards),
    saves: avg(totals.saves),
    bonus: avg(totals.bonus),
    bps: avg(totals.bps),
    defensiveContribution: avg(totals.defensiveContribution),
    tackles: avg(totals.tackles),
    clearancesBlocksInterceptions: avg(totals.clearancesBlocksInterceptions),
    recoveries: avg(totals.recoveries),
    xG: avg(totals.xG),
    xA: avg(totals.xA),
    xGI: avg(totals.xGI),
    xGC: avg(totals.xGC),
  };
}
