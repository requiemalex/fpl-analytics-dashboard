import type { ChipWindow, NormalizedEvent } from "../types/normalized";

/**
 * <gameweek_summary>: Team Building's Gameweek Summary, from what FPL
 * publishes about each gameweek across every manager (its average and
 * highest score, its most-captained player and top scorer, how many played
 * each chip) beside the squad's own Gameweek Log (<gameweek_log>).
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

/** The squad's points over its log up to and including `event`, beside every manager's average over the same gameweeks (null if any is missing). */
export function pointsToDate(rows: readonly { event: number; points: number; average: number | null }[], event: number): { yours: number; average: number | null; from: number | null; count: number } {
  const upTo = rows.filter((r) => r.event <= event);
  const average = upTo.every((r) => r.average !== null) ? upTo.reduce((s, r) => s + (r.average as number), 0) : null;
  return {
    yours: upTo.reduce((s, r) => s + r.points, 0),
    average: upTo.length > 0 ? average : null,
    from: upTo.length > 0 ? Math.min(...upTo.map((r) => r.event)) : null,
    count: upTo.length,
  };
}
