import type { NormalizedPlayer } from "../types/normalized";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { fmtDecimal, fmtPrice, fmtPercent, fmtSigned, DASH } from "../utils/format";

export type ColumnGroup = "ACTUAL OUTPUT" | "UNDERLYING PERFORMANCE" | "VALUE" | "ADVANCED";

export interface PlayerColumn {
  key: string;
  label: string;
  group: ColumnGroup;
  metricKey?: string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  format: (v: number | null) => string;
  /** Whether a higher value is the "better" one for this metric — used by Player Comparison's colour scale. Defaults to true; only set false for metrics where lower is genuinely better (price, ownership, xGC). */
  higherIsBetter?: boolean;
}

const num = (decimals = 0) => (v: number | null) => fmtDecimal(v, decimals);
const signed = (decimals = 2) => (v: number | null) => fmtSigned(v, decimals);

export const PLAYER_COLUMNS: PlayerColumn[] = [
  // ACTUAL OUTPUT
  { key: "totalPoints", label: "Points", group: "ACTUAL OUTPUT", metricKey: "totalPoints", getValue: (p) => p.totalPoints, format: num(0) },
  { key: "pointsPerGame", label: "PPG", group: "ACTUAL OUTPUT", metricKey: "pointsPerGame", getValue: (p) => p.pointsPerGame, format: num(1) },
  { key: "goals", label: "Goals", group: "ACTUAL OUTPUT", metricKey: "goals", getValue: (p) => p.goals, format: num(0) },
  { key: "assists", label: "Assists", group: "ACTUAL OUTPUT", metricKey: "assists", getValue: (p) => p.assists, format: num(0) },
  { key: "cleanSheets", label: "CS", group: "ACTUAL OUTPUT", metricKey: "cleanSheets", getValue: (p) => p.cleanSheets, format: num(0) },
  { key: "bonus", label: "Bonus", group: "ACTUAL OUTPUT", metricKey: "bonus", getValue: (p) => p.bonus, format: num(0) },

  // UNDERLYING PERFORMANCE
  { key: "xG", label: "xG", group: "UNDERLYING PERFORMANCE", metricKey: "xG", getValue: (p) => p.xG, format: num(2) },
  { key: "xA", label: "xA", group: "UNDERLYING PERFORMANCE", metricKey: "xA", getValue: (p) => p.xA, format: num(2) },
  { key: "xGI", label: "xGI", group: "UNDERLYING PERFORMANCE", metricKey: "xGI", getValue: (p) => p.xGI, format: num(2) },
  { key: "xGPer90", label: "xG/90", group: "UNDERLYING PERFORMANCE", metricKey: "xGPer90", getValue: (p) => p.xGPer90, format: num(2) },
  { key: "xAPer90", label: "xA/90", group: "UNDERLYING PERFORMANCE", metricKey: "xAPer90", getValue: (p) => p.xAPer90, format: num(2) },
  { key: "xGIPer90", label: "xGI/90", group: "UNDERLYING PERFORMANCE", metricKey: "xGIPer90", getValue: (p) => p.xGIPer90, format: num(2) },
  { key: "xGC", label: "xGC", group: "UNDERLYING PERFORMANCE", metricKey: "xGC", getValue: (p) => p.xGC, format: num(2), higherIsBetter: false },

  // VALUE
  { key: "price", label: "Price", group: "VALUE", metricKey: "price", getValue: (p) => p.price, format: (v) => fmtPrice(v), higherIsBetter: false },
  { key: "pointsPerMillion", label: "Pts/\u00a3m", group: "VALUE", metricKey: "pointsPerMillion", getValue: (_p, d) => d.pointsPerMillion, format: num(1) },
  { key: "xGPerMillion", label: "xG/\u00a3m", group: "VALUE", metricKey: "xGPerMillion", getValue: (_p, d) => d.xGPerMillion, format: num(2) },
  { key: "xAPerMillion", label: "xA/\u00a3m", group: "VALUE", metricKey: "xAPerMillion", getValue: (_p, d) => d.xAPerMillion, format: num(2) },
  { key: "xGIPerMillion", label: "xGI/\u00a3m", group: "VALUE", metricKey: "xGIPerMillion", getValue: (_p, d) => d.xGIPerMillion, format: num(2) },

  // ADVANCED
  { key: "minutes", label: "Mins", group: "ADVANCED", metricKey: "minutes", getValue: (p) => p.minutes, format: num(0) },
  { key: "starts", label: "Starts", group: "ADVANCED", metricKey: "starts", getValue: (p) => p.starts, format: num(0) },
  { key: "bps", label: "BPS", group: "ADVANCED", metricKey: "bps", getValue: (p) => p.bps, format: num(0) },
  { key: "ictIndex", label: "ICT", group: "ADVANCED", metricKey: "ictIndex", getValue: (p) => p.ictIndex, format: num(1) },
  {
    key: "defensiveContributions",
    label: "DC",
    group: "ADVANCED",
    metricKey: "defensiveContributions",
    getValue: (p) => p.defensiveContributions,
    format: num(0),
  },
  {
    key: "defensiveContributionsPer90",
    label: "DC/90",
    group: "ADVANCED",
    metricKey: "defensiveContributionsPer90",
    getValue: (p) => p.defensiveContributionsPer90,
    format: num(2),
  },
  { key: "ownership", label: "Own%", group: "ADVANCED", metricKey: "ownership", getValue: (p) => p.ownership, format: (v) => fmtPercent(v, 1), higherIsBetter: false },
];

export const DEFAULT_VISIBLE_COLUMNS = [
  "ownership",
  "totalPoints",
  "pointsPerGame",
  "goals",
  "assists",
  "price",
  "pointsPerMillion",
  "xG",
  "xA",
  "xGI",
  "minutes",
];

export function columnByKey(key: string): PlayerColumn | undefined {
  return PLAYER_COLUMNS.find((c) => c.key === key);
}

export { DASH, signed };
