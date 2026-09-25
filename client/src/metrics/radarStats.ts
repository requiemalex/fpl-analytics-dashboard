import type { NormalizedPlayer, Position } from "../types/normalized";
import { computePositionPercentiles } from "./percentiles";

export interface RadarAxis {
  key: string;
  label: string;
  metricFn: (p: NormalizedPlayer) => number | null;
  /** Decimal places for the raw value in the hover box — whole numbers for counts, as Player Explorer shows them. */
  decimals: number;
  /** False inverts the percentile — for metrics where a lower raw value is actually better (xGC/Game: fewer expected goals conceded is a tighter defence), so every axis on the chart still points "outward = good". */
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
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, decimals: 0, higherIsBetter: true },
    { key: "cleanSheets", label: "Clean Sheets", metricFn: (p) => p.cleanSheets, decimals: 0, higherIsBetter: true },
    { key: "xGCPerGame", label: "Defence Tightness", metricFn: (p) => p.xGCPerGame, decimals: 2, higherIsBetter: false },
    { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, decimals: 0, higherIsBetter: true },
    { key: "bps", label: "BPS", metricFn: (p) => p.bps, decimals: 0, higherIsBetter: true },
    { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, decimals: 1, higherIsBetter: true },
  ],
  DEF: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, decimals: 0, higherIsBetter: true },
    { key: "cleanSheets", label: "Clean Sheets", metricFn: (p) => p.cleanSheets, decimals: 0, higherIsBetter: true },
    { key: "xGCPerGame", label: "Defence Tightness", metricFn: (p) => p.xGCPerGame, decimals: 2, higherIsBetter: false },
    { key: "defensiveContributionsPerGame", label: "Def. Contribution/Game", metricFn: (p) => p.defensiveContributionsPerGame, decimals: 2, higherIsBetter: true },
    { key: "xGIPerGame", label: "Attacking Threat (xGI/Game)", metricFn: (p) => p.xGIPerGame, decimals: 2, higherIsBetter: true },
    { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, decimals: 0, higherIsBetter: true },
  ],
  MID: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, decimals: 0, higherIsBetter: true },
    { key: "goals", label: "Goals", metricFn: (p) => p.goals, decimals: 0, higherIsBetter: true },
    { key: "assists", label: "Assists", metricFn: (p) => p.assists, decimals: 0, higherIsBetter: true },
    { key: "xGIPerGame", label: "xGI/Game", metricFn: (p) => p.xGIPerGame, decimals: 2, higherIsBetter: true },
    { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, decimals: 1, higherIsBetter: true },
    { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, decimals: 0, higherIsBetter: true },
  ],
  FWD: [
    { key: "totalPoints", label: "Points", metricFn: (p) => p.totalPoints, decimals: 0, higherIsBetter: true },
    { key: "goals", label: "Goals", metricFn: (p) => p.goals, decimals: 0, higherIsBetter: true },
    { key: "xGPerGame", label: "xG/Game", metricFn: (p) => p.xGPerGame, decimals: 2, higherIsBetter: true },
    { key: "assists", label: "Assists", metricFn: (p) => p.assists, decimals: 0, higherIsBetter: true },
    { key: "xAPerGame", label: "xA/Game", metricFn: (p) => p.xAPerGame, decimals: 2, higherIsBetter: true },
    { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, decimals: 1, higherIsBetter: true },
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
  /** Decimal places the raw value is shown with. */
  decimals: number;
}

/**
 * One percentile-within-position computation per axis, for one player.
 * `allPlayers` must be the same full, unfiltered, mode-resolved
 * population used for percentiles everywhere else in the app
 * (<percentile_population> — never pre-filtered by team/ownership/price,
 * though the minutes-eligibility threshold IS applied, same as always).
 */
export function computeRadarDataForAxes(
  axes: RadarAxis[],
  player: NormalizedPlayer,
  allPlayers: NormalizedPlayer[],
  minMinutesThreshold: number,
): RadarDataPoint[] {
  return axes.map((axis) => {
    const percentiles = computePositionPercentiles(allPlayers, axis.metricFn, minMinutesThreshold);
    const rawPercentile = percentiles.get(player.id) ?? null;
    const percentile = rawPercentile === null ? null : axis.higherIsBetter ? rawPercentile : 100 - rawPercentile;
    return { key: axis.key, label: axis.label, percentile, rawValue: axis.metricFn(player), decimals: axis.decimals };
  });
}

export function computeRadarData(player: NormalizedPlayer, allPlayers: NormalizedPlayer[], minMinutesThreshold: number): RadarDataPoint[] {
  return computeRadarDataForAxes(getRadarAxesForPosition(player.position), player, allPlayers, minMinutesThreshold);
}

export interface RadarAxisGroup {
  /** "" for a position with one combined radar (GKP, FWD — points come
   * overwhelmingly from one facet already); "Defense"/"Offense" for a
   * position split into two (DEF, MID — both facets genuinely drive
   * their points). See README → "Metric methodology" (percentiles). */
  label: string;
  axes: RadarAxis[];
}

const DEFENSIVE_AXES: RadarAxis[] = [
  { key: "cleanSheets", label: "Clean Sheets", metricFn: (p) => p.cleanSheets, decimals: 0, higherIsBetter: true },
  { key: "xGCPerGame", label: "Defence Tightness", metricFn: (p) => p.xGCPerGame, decimals: 2, higherIsBetter: false },
  { key: "defensiveContributionsPerGame", label: "Def. Contribution/Game", metricFn: (p) => p.defensiveContributionsPerGame, decimals: 2, higherIsBetter: true },
  { key: "bps", label: "BPS", metricFn: (p) => p.bps, decimals: 0, higherIsBetter: true },
  { key: "bonus", label: "Bonus", metricFn: (p) => p.bonus, decimals: 0, higherIsBetter: true },
];

/** DEF and MID each get a Defense radar (built from `DEFENSIVE_AXES`, shared between them since the same defensive-scoring fields apply to both) plus their own Offense radar below — a defender's or midfielder's points genuinely come from both facets, unlike a goalkeeper's (defence) or forward's (attack). */
const SPLIT_RADAR_AXES: Partial<Record<Position, { defense: RadarAxis[]; offense: RadarAxis[] }>> = {
  DEF: {
    defense: DEFENSIVE_AXES,
    offense: [
      { key: "goals", label: "Goals", metricFn: (p) => p.goals, decimals: 0, higherIsBetter: true },
      { key: "assists", label: "Assists", metricFn: (p) => p.assists, decimals: 0, higherIsBetter: true },
      { key: "xGPerGame", label: "xG/Game", metricFn: (p) => p.xGPerGame, decimals: 2, higherIsBetter: true },
      { key: "xAPerGame", label: "xA/Game", metricFn: (p) => p.xAPerGame, decimals: 2, higherIsBetter: true },
      { key: "xGIPerGame", label: "xGI/Game", metricFn: (p) => p.xGIPerGame, decimals: 2, higherIsBetter: true },
    ],
  },
  MID: {
    defense: DEFENSIVE_AXES,
    offense: [
      { key: "goals", label: "Goals", metricFn: (p) => p.goals, decimals: 0, higherIsBetter: true },
      { key: "assists", label: "Assists", metricFn: (p) => p.assists, decimals: 0, higherIsBetter: true },
      { key: "xGPerGame", label: "xG/Game", metricFn: (p) => p.xGPerGame, decimals: 2, higherIsBetter: true },
      { key: "xAPerGame", label: "xA/Game", metricFn: (p) => p.xAPerGame, decimals: 2, higherIsBetter: true },
      { key: "xGIPerGame", label: "xGI/Game", metricFn: (p) => p.xGIPerGame, decimals: 2, higherIsBetter: true },
      { key: "ictIndex", label: "ICT Index", metricFn: (p) => p.ictIndex, decimals: 1, higherIsBetter: true },
    ],
  },
};

export function getRadarAxisGroupsForPosition(position: Position): RadarAxisGroup[] {
  const split = SPLIT_RADAR_AXES[position];
  if (split) {
    return [
      { label: "Defense", axes: split.defense },
      { label: "Offense", axes: split.offense },
    ];
  }
  return [{ label: "", axes: getRadarAxesForPosition(position) }];
}
