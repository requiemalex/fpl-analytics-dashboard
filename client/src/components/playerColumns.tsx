import type { NormalizedPlayer } from "../types/normalized";
import type { PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { defensiveRewardPerGame } from "../metrics/defensiveReward";
import { fmtDecimal, fmtPrice, fmtPercent } from "../utils/format";

export type ColumnGroup = "ACTUAL OUTPUT" | "UNDERLYING PERFORMANCE" | "VALUE" | "ADVANCED";

export interface PlayerColumn {
  key: string;
  label: string;
  group: ColumnGroup;
  metricKey?: string;
  getValue: (p: NormalizedPlayer, d: PlayerDerivedMetrics) => number | null;
  format: (v: number | null) => string;
  /** Decimal places `format` shows — column filters compare values as displayed (see columnFilterPasses). */
  decimals: number;
  /** Whether a higher value is the "better" one for this metric — used by Player Comparison's colour scale. Defaults to true; only set false for metrics where lower is genuinely better (price, ownership, xGC). */
  higherIsBetter?: boolean;
  /**
   * Whether this column's value actually changes with the page's
   * Last Completed Season / Historic Average / Current Season toggle
   * (or Team Building's equivalent Historic/Raw toggle) — i.e. whether
   * resolvePlayerStats (resolvePlayerStats.ts) overwrites this field per
   * mode. Defaults true (almost every performance metric does); only
   * price and ownership are explicitly false — both are always today's
   * live figure regardless of mode, per resolvePlayerStats.ts's own
   * price_always_live note. Drives the "always live" header styling
   * shared across every table that lists PLAYER_COLUMNS — see the
   * .col-static rule in components.css.
   */
  varies?: boolean;
}

const num = (decimals = 0) => ({ format: (v: number | null) => fmtDecimal(v, decimals), decimals });

export const PLAYER_COLUMNS: PlayerColumn[] = [
  // ACTUAL OUTPUT
  { key: "totalPoints", label: "Points", group: "ACTUAL OUTPUT", metricKey: "totalPoints", getValue: (p) => p.totalPoints, ...num(0) },
  { key: "pointsPerGame", label: "PPG", group: "ACTUAL OUTPUT", metricKey: "pointsPerGame", getValue: (p) => p.pointsPerGame, ...num(1) },
  { key: "goals", label: "Goals", group: "ACTUAL OUTPUT", metricKey: "goals", getValue: (p) => p.goals, ...num(0) },
  { key: "assists", label: "Assists", group: "ACTUAL OUTPUT", metricKey: "assists", getValue: (p) => p.assists, ...num(0) },
  { key: "cleanSheets", label: "CS", group: "ACTUAL OUTPUT", metricKey: "cleanSheets", getValue: (p) => p.cleanSheets, ...num(0) },
  { key: "bonus", label: "Bonus", group: "ACTUAL OUTPUT", metricKey: "bonus", getValue: (p) => p.bonus, ...num(0) },

  // UNDERLYING PERFORMANCE
  { key: "xG", label: "xG", group: "UNDERLYING PERFORMANCE", metricKey: "xG", getValue: (p) => p.xG, ...num(2) },
  { key: "xA", label: "xA", group: "UNDERLYING PERFORMANCE", metricKey: "xA", getValue: (p) => p.xA, ...num(2) },
  { key: "xGI", label: "xGI", group: "UNDERLYING PERFORMANCE", metricKey: "xGI", getValue: (p) => p.xGI, ...num(2) },
  { key: "xGPerGame", label: "xG/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xGPerGame", getValue: (p) => p.xGPerGame, ...num(2) },
  { key: "xAPerGame", label: "xA/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xAPerGame", getValue: (p) => p.xAPerGame, ...num(2) },
  { key: "xGIPerGame", label: "xGI/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xGIPerGame", getValue: (p) => p.xGIPerGame, ...num(2) },
  { key: "xGC", label: "xGC", group: "UNDERLYING PERFORMANCE", metricKey: "xGC", getValue: (p) => p.xGC, ...num(2), higherIsBetter: false },
  { key: "xGCPerGame", label: "xGC/Game", group: "UNDERLYING PERFORMANCE", metricKey: "xGCPerGame", getValue: (p) => p.xGCPerGame, ...num(2), higherIsBetter: false },

  // VALUE
  { key: "price", label: "Price", group: "VALUE", metricKey: "price", getValue: (p) => p.price, format: (v) => fmtPrice(v), decimals: 1, higherIsBetter: false, varies: false },
  { key: "pointsPerMillion", label: "Pts/\u00a3m", group: "VALUE", metricKey: "pointsPerMillion", getValue: (_p, d) => d.pointsPerMillion, ...num(1) },
  { key: "xGPerMillion", label: "xG/\u00a3m", group: "VALUE", metricKey: "xGPerMillion", getValue: (_p, d) => d.xGPerMillion, ...num(2) },
  { key: "xAPerMillion", label: "xA/\u00a3m", group: "VALUE", metricKey: "xAPerMillion", getValue: (_p, d) => d.xAPerMillion, ...num(2) },
  { key: "xGIPerMillion", label: "xGI/\u00a3m", group: "VALUE", metricKey: "xGIPerMillion", getValue: (_p, d) => d.xGIPerMillion, ...num(2) },

  // ADVANCED
  { key: "minutes", label: "Mins", group: "ADVANCED", metricKey: "minutes", getValue: (p) => p.minutes, ...num(0) },
  { key: "starts", label: "Starts", group: "ADVANCED", metricKey: "starts", getValue: (p) => p.starts, ...num(0) },
  { key: "bps", label: "BPS", group: "ADVANCED", metricKey: "bps", getValue: (p) => p.bps, ...num(0) },
  { key: "ictIndex", label: "ICT", group: "ADVANCED", metricKey: "ictIndex", getValue: (p) => p.ictIndex, ...num(1) },
  {
    key: "defensiveContributions",
    label: "DC",
    group: "ADVANCED",
    metricKey: "defensiveContributions",
    getValue: (p) => p.defensiveContributions,
    ...num(0),
  },
  {
    key: "defensiveContributionsPerGame",
    label: "DC/Game",
    group: "ADVANCED",
    metricKey: "defensiveContributionsPerGame",
    getValue: (p) => p.defensiveContributionsPerGame,
    ...num(2),
  },
  {
    key: "defensiveRewardPerGame",
    label: "Def. Reward/Game",
    group: "ADVANCED",
    metricKey: "defensiveRewardPerGame",
    getValue: (p) => defensiveRewardPerGame(p),
    ...num(2),
  },
  {
    key: "ownership",
    label: "Own%",
    group: "ADVANCED",
    metricKey: "ownership",
    getValue: (p) => p.ownership,
    format: (v) => fmtPercent(v, 1),
    decimals: 1,
    higherIsBetter: false,
    varies: false,
  },
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

/** `varies` defaults to true (unset ≠ static) — this is the one place that distinction is interpreted, so every table applies the "always live" header styling identically rather than each re-deriving its own `c.varies === false` check. */
export function isStaticColumn(c: PlayerColumn): boolean {
  return c.varies === false;
}

