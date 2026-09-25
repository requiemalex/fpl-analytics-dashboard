import type { PlayerSeasonHistory } from "../types/normalized";
import { perGame, estimatedGamesPerSeason } from "./calculations";

export interface CareerAverages {
  seasonsPlayed: number;
  avgPointsPerSeason: number | null;
  avgMinutesPerSeason: number | null;
  /** Estimated games per season, from the TOTAL minutes across every season (<games_from_total_minutes>, calculations.ts) — what every per-game rate over all these seasons divides by. */
  avgEstimatedGamesPerSeason: number | null;
  avgGoalsPerSeason: number | null;
  avgAssistsPerSeason: number | null;
  /** Averaged only over seasons where starts is known (see PlayerSeasonHistory.starts nullability). */
  avgStartsPerSeason: number | null;
  avgCleanSheetsPerSeason: number | null;
  /** Averaged only over seasons where goals conceded is known (see PlayerSeasonHistory.goalsConceded). */
  avgGoalsConcededPerSeason: number | null;
  avgBonusPerSeason: number | null;
  avgBpsPerSeason: number | null;
  avgIctIndex: number | null;
  avgXGPerSeason: number | null;
  avgXAPerSeason: number | null;
  avgXGIPerSeason: number | null;
  avgXGCPerSeason: number | null;
  /** Averaged only over seasons where DC was tracked (2024/25+) — see PlayerSeasonHistory.defensiveContribution. */
  avgDefensiveContributionPerSeason: number | null;
  /**
   * Per-game rates, each over the SAME seasons its stat is averaged over
   * (<matched_season_rates>): a stat that's null for some seasons (DC before
   * 2024/25) is divided by the games of the seasons that have it, never by
   * games across the whole window — mixing the two divided one season's DC
   * by a four-season games figure and inflated DC/Game for anyone with light
   * early seasons. Games come from those seasons' total minutes
   * (<games_from_total_minutes>), so each rate is total stat ÷ total games.
   */
  xGPerGame: number | null;
  xAPerGame: number | null;
  xGIPerGame: number | null;
  xGCPerGame: number | null;
  defensiveContributionPerGame: number | null;
}

/**
 * Averages across whichever prior seasons the player actually has data
 * for (0, 1, 2, or many) — never padded to a fixed number of seasons, so
 * a player with one prior season shows a one-season average, not a
 * one-third-weighted one. Fields that can be genuinely absent for a
 * season (xG-family, ICT, price) are averaged only over seasons where
 * that value isn't null, rather than treating a missing value as zero.
 */
export function computeCareerAverages(seasons: PlayerSeasonHistory[]): CareerAverages {
  const n = seasons.length;
  if (n === 0) {
    return {
      seasonsPlayed: 0,
      avgPointsPerSeason: null,
      avgMinutesPerSeason: null,
      avgEstimatedGamesPerSeason: null,
      avgGoalsPerSeason: null,
      avgStartsPerSeason: null,
      avgAssistsPerSeason: null,
      avgCleanSheetsPerSeason: null,
      avgGoalsConcededPerSeason: null,
      avgBonusPerSeason: null,
      avgBpsPerSeason: null,
      avgIctIndex: null,
      avgXGPerSeason: null,
      avgXAPerSeason: null,
      avgXGIPerSeason: null,
      avgXGCPerSeason: null,
      avgDefensiveContributionPerSeason: null,
      xGPerGame: null,
      xAPerGame: null,
      xGIPerGame: null,
      xGCPerGame: null,
      defensiveContributionPerGame: null,
    };
  }

  const sum = (fn: (s: PlayerSeasonHistory) => number) => seasons.reduce((acc, s) => acc + fn(s), 0);
  const avgOrNull = (fn: (s: PlayerSeasonHistory) => number | null): number | null => {
    const values = seasons.map(fn).filter((v): v is number => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  // <matched_season_rates>: the stat and the minutes both totalled over the
  // seasons where this stat is known, so games come from total minutes
  // (<games_from_total_minutes>).
  const perGameOverKnownSeasons = (fn: (s: PlayerSeasonHistory) => number | null): number | null => {
    const known = seasons.filter((s) => fn(s) !== null);
    if (known.length === 0) return null;
    const totalStat = known.reduce((acc, s) => acc + (fn(s) as number), 0);
    const totalMinutes = known.reduce((acc, s) => acc + s.minutes, 0);
    return perGame(totalStat, totalMinutes);
  };

  return {
    seasonsPlayed: n,
    avgPointsPerSeason: sum((s) => s.totalPoints) / n,
    avgMinutesPerSeason: sum((s) => s.minutes) / n,
    avgEstimatedGamesPerSeason: estimatedGamesPerSeason(sum((s) => s.minutes), n),
    avgGoalsPerSeason: sum((s) => s.goals) / n,
    avgStartsPerSeason: avgOrNull((s) => s.starts),
    avgAssistsPerSeason: sum((s) => s.assists) / n,
    avgCleanSheetsPerSeason: sum((s) => s.cleanSheets) / n,
    avgGoalsConcededPerSeason: avgOrNull((s) => s.goalsConceded),
    avgBonusPerSeason: sum((s) => s.bonus) / n,
    avgBpsPerSeason: sum((s) => s.bps) / n,
    avgIctIndex: avgOrNull((s) => s.ictIndex),
    avgXGPerSeason: avgOrNull((s) => s.xG),
    avgXAPerSeason: avgOrNull((s) => s.xA),
    avgXGIPerSeason: avgOrNull((s) => s.xGI),
    avgXGCPerSeason: avgOrNull((s) => s.xGC),
    avgDefensiveContributionPerSeason: avgOrNull((s) => s.defensiveContribution),
    xGPerGame: perGameOverKnownSeasons((s) => s.xG),
    xAPerGame: perGameOverKnownSeasons((s) => s.xA),
    xGIPerGame: perGameOverKnownSeasons((s) => s.xGI),
    xGCPerGame: perGameOverKnownSeasons((s) => s.xGC),
    defensiveContributionPerGame: perGameOverKnownSeasons((s) => s.defensiveContribution),
  };
}

/** Season-total points delta within this range counts as "flat" rather than up/down — a least-assumptive round number, not derived from data. */
const FLAT_TREND_POINTS_THRESHOLD = 5;

export type TrendDirection = "up" | "down" | "flat" | "unknown";

export interface SeasonTrend {
  direction: TrendDirection;
  pointsDelta: number | null;
  latestSeason: string | null;
  previousSeason: string | null;
}

/**
 * Compares total points between the two most recently completed prior
 * seasons only — the simplest honest read of "which way is this trending",
 * not a projection. Needs at least two prior seasons; a player with 0 or 1
 * gets "unknown", never a fabricated direction.
 *
 * Only reads seasonName/totalPoints, so it also works for a
 * squad-aggregated season total (see metrics/teamSeasonHistory.ts) — not
 * just a single player's real PlayerSeasonHistory.
 */
export function computeSeasonTrend(seasons: Pick<PlayerSeasonHistory, "seasonName" | "totalPoints">[]): SeasonTrend {
  if (seasons.length < 2) {
    return { direction: "unknown", pointsDelta: null, latestSeason: seasons[0]?.seasonName ?? null, previousSeason: null };
  }
  const sorted = [...seasons].sort((a, b) => a.seasonName.localeCompare(b.seasonName));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const delta = latest.totalPoints - previous.totalPoints;
  const direction: TrendDirection = delta > FLAT_TREND_POINTS_THRESHOLD ? "up" : delta < -FLAT_TREND_POINTS_THRESHOLD ? "down" : "flat";
  return { direction, pointsDelta: delta, latestSeason: latest.seasonName, previousSeason: previous.seasonName };
}
