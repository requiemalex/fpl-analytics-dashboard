import type { ChipWindow, NormalizedEvent } from "../types/normalized";

/**
 * <gameweek_summary>: Team Building's Gameweek Summary, from what FPL
 * publishes about each gameweek across every manager (its average and
 * highest score, its most-captained player and top scorer, how many played
 * each chip) beside the squad's own Gameweek Log (<gameweek_log>). One
 * gameweek at a time, never added up across them: squads start in
 * different gameweeks, so a total to date compares unlike things (the
 * owner's call, 2026-11-02).
 */

export const CHIP_ORDER: ChipWindow["chip"][] = ["wildcard", "freehit", "bboost", "3xc"];
export const CHIP_NAME: Record<ChipWindow["chip"], string> = { wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain" };

export interface ChipStanding {
  chip: ChipWindow["chip"];
  /** False when the chip can't be played this gameweek (outside each of its windows). */
  inWindow: boolean;
  /** Managers who played it this gameweek, and as a share (0–1) of the managers ranked that gameweek. */
  playedThisWeek: number | null;
  shareThisWeek: number | null;
  /** Share of managers who still hold it after this gameweek: 1 − every play since its window opened ÷ the managers ranked this gameweek. */
  stillToPlay: number | null;
}

/**
 * Where each chip stands after gameweek `event`: each manager has one of
 * each chip per window (half of the season), so the share still holding
 * one is what's left after every play since its window opened. Over the
 * managers ranked that gameweek: a manager who joined later holds his
 * chips too. Null where FPL hasn't sent the figures.
 */
export function chipStandings(event: number, events: readonly NormalizedEvent[], windows: readonly ChipWindow[]): ChipStanding[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const managers = byId.get(event)?.summary?.rankedCount ?? null;
  return CHIP_ORDER.map((chip) => {
    const window = windows.find((w) => w.chip === chip && w.startEvent <= event && event <= w.stopEvent);
    if (!window) return { chip, inWindow: false, playedThisWeek: null, shareThisWeek: null, stillToPlay: null };
    // FPL lists only the chips someone played: one it leaves out of a gameweek it has figures for was played by no one.
    const plays = (id: number) => {
      const summary = byId.get(id)?.summary;
      return summary ? (summary.chipPlays[chip] ?? 0) : null;
    };
    const thisWeek = plays(event);
    let soFar: number | null = 0;
    for (let id = window.startEvent; id <= event; id++) {
      const n = plays(id);
      soFar = n === null || soFar === null ? null : soFar + n;
    }
    const share = (n: number | null) => (n === null || managers === null || managers <= 0 ? null : n / managers);
    const soFarShare = share(soFar);
    return { chip, inWindow: true, playedThisWeek: thisWeek, shareThisWeek: share(thisWeek), stillToPlay: soFarShare === null ? null : Math.max(0, 1 - soFarShare) };
  });
}

/**
 * <gameweek_points_colour>: a squad's gameweek points against every FPL
 * manager that gameweek, as a 0–100 score for the shared colour scale
 * (the owner's call, 2026-11-02: the comparison is other managers). Grey
 * at the gameweek's average; toward full green at its highest score and
 * toward full red at 0. Null when FPL hasn't sent the average and highest.
 */
export function pointsAgainstGameweek(points: number, average: number | null, highest: number | null): number | null {
  if (average === null || highest === null || average <= 0) return null;
  if (points >= average) return highest > average ? Math.min(100, 50 + (50 * (points - average)) / (highest - average)) : 50;
  return Math.max(0, (50 * points) / average);
}

/** A gameweek rank as a percentile among the managers ranked that gameweek: the top rank near 100, the last near 0. */
export function rankPercentile(rank: number | null, rankedCount: number | null): number | null {
  if (rank === null || rankedCount === null || rankedCount <= 0 || rank < 1) return null;
  return Math.max(0, Math.min(100, 100 * (1 - (rank - 1) / rankedCount)));
}
