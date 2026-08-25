import type { PlayerGameweekHistory } from "../types/normalized";

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
