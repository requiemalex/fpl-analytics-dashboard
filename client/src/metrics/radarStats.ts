import type { NormalizedPlayer, Position } from "../types/normalized";
import { computePositionPercentiles } from "./percentiles";

export interface RadarAxis {
  key: string;
  label: string;
  metricFn: (p: NormalizedPlayer) => number | null;
  /** False inverts the percentile — for metrics where a lower raw value is actually better (xGC/90: fewer expected goals conceded is a tighter defence), so every axis on the chart still points "outward = good". */
  higherIsBetter: boolean;
}

/**
 * Deliberately different per position — "important for the position
 * they play" means a goalkeeper's chart shouldn't have an xG axis, and
 * a forward's shouldn't be built around clean sheets. Every metric here
 * already exists on NormalizedPlayer, so this works unchanged across
 * whichever analysis mode is resolving that player at the time (Last
 * Completed Season / Historic Average / Current Season) — the axes
 * don't change, only the percentiles do.
 */
const RADAR_AXES_BY_POSITION: Record<Position, RadarAxis[]> = {
  GKP: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, higherIsBetter: true },
    { key: "cleanSheets", label: "Clean Sheets", metricFn: (p) => p.cleanSheets, higherIsBetter: true },
    { key: "xGCPer90", label: "Defence Tightness", metricFn: (p) => p.xGCPer90, higherIsBetter: false },
    { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, higherIsBetter: true },
    { key: "bps", label: "BPS", metricFn: (p) => p.bps, higherIsBetter: true },
    { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, higherIsBetter: true },
  ],
  DEF: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, higherIsBetter: true },
    { key: "cleanSheets", label: "Clean Sheets", metricFn: (p) => p.cleanSheets, higherIsBetter: true },
    { key: "xGCPer90", label: "Defence Tightness", metricFn: (p) => p.xGCPer90, higherIsBetter: false },
    { key: "defensiveContributionsPer90", label: "Def. Contribution/90", metricFn: (p) => p.defensiveContributionsPer90, higherIsBetter: true },
    { key: "xGIPer90", label: "Attacking Threat (xGI/90)", metricFn: (p) => p.xGIPer90, higherIsBetter: true },
    { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, higherIsBetter: true },
  ],
  MID: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, higherIsBetter: true },
    { key: "goals", label: "Goals", metricFn: (p) => p.goals, higherIsBetter: true },
    { key: "assists", label: "Assists", metricFn: (p) => p.assists, higherIsBetter: true },
    { key: "xGIPer90", label: "xGI/90", metricFn: (p) => p.xGIPer90, higherIsBetter: true },
    { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, higherIsBetter: true },
    { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, higherIsBetter: true },
  ],
  FWD: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, higherIsBetter: true },
    { key: "goals", label: "Goals", metricFn: (p) => p.goals, higherIsBetter: true },
    { key: "xGPer90", label: "xG/90", metricFn: (p) => p.xGPer90, higherIsBetter: true },
    { key: "assists", label: "Assists", metricFn: (p) => p.assists, higherIsBetter: true },
    { key: "xAPer90", label: "xA/90", metricFn: (p) => p.xAPer90, higherIsBetter: true },
    { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, higherIsBetter: true },
  ],
};

export function getRadarAxesForPosition(position: Position): RadarAxis[] {
  return RADAR_AXES_BY_POSITION[position];
}

export interface RadarDataPoint {
  key: string;
  label: string;
  /** Within-position percentile, already flipped for higherIsBetter:false axes so higher always means "better" on the chart. Null if the player or the axis metric has no data. */
  percentile: number | null;
  rawValue: number | null;
}

/**
 * One percentile-within-position computation per axis, for one player.
 * `allPlayers` must be the same full, unfiltered, mode-resolved
 * population used for percentiles everywhere else in the app
 * (<percentile_population> — never pre-filtered by team/ownership/price,
 * though the minutes-eligibility threshold IS applied, same as always).
 */
export function computeRadarData(player: NormalizedPlayer, allPlayers: NormalizedPlayer[], minMinutesThreshold: number): RadarDataPoint[] {
  const axes = getRadarAxesForPosition(player.position);
  return axes.map((axis) => {
    const percentiles = computePositionPercentiles(allPlayers, axis.metricFn, minMinutesThreshold);
    const rawPercentile = percentiles.get(player.id) ?? null;
    const percentile = rawPercentile === null ? null : axis.higherIsBetter ? rawPercentile : 100 - rawPercentile;
    return { key: axis.key, label: axis.label, percentile, rawValue: axis.metricFn(player) };
  });
}
