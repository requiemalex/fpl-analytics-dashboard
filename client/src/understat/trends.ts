/**
 * Understat's figures for Player Comparison's trend graphs, season by
 * season (through extensions/externalStats.ts `playerTrends`). Each point
 * is one completed season's own Understat totals for the player — the
 * seasons on the x axis are his FPL ones, as for FPL trends — or a
 * per-game rate built from them on Understat's own minutes
 * (<us_minutes_for_us_rates>, <games_from_total_minutes>).
 *
 * A season Understat has no row for (no link yet, a held link, or he
 * didn't play) is a gap in his line, never 0. Shot-list figures are a gap
 * for a season whose shot list is incomplete (<incomplete_shot_list>,
 * columns.ts). Like FPL trends: no signed (+/−) figures, nothing always-live.
 *
 * As with the columns, Understat's version of an FPL trend figure (xG,
 * assists, minutes…) is an alternate under the FPL trend key — what the
 * trend graph's ⇄ toggle switches to — and its own figures are in groups.
 */
import type { ExternalColumnSet, ExternalTrendMetric } from "../extensions/externalStats";
import { perGame } from "../metrics/calculations";
import type { UnderstatData, UsPlayerTotals } from "./schema";

type EnabledData = Extract<UnderstatData, { enabled: true }>;

type Figure = (t: UsPlayerTotals) => number | null;

const total = (f: (t: UsPlayerTotals) => number): Figure => f;
const perGameOf = (f: (t: UsPlayerTotals) => number): Figure => (t) => perGame(f(t), t.minutes);
/** From the shot list: a gap where it's incomplete. */
const fromShots = (f: Figure): Figure => (t) => (t.shotsComplete ? f(t) : null);

type Def = { key: string; label: string; decimals: number; figure: Figure };

/** Keyed by the FPL trend key (metrics/careerTrends.ts TREND_METRICS). */
const ALTERNATES: Def[] = [
  { key: "xG", label: "xG", decimals: 2, figure: total((t) => t.xG) },
  { key: "xA", label: "xA", decimals: 2, figure: total((t) => t.xA) },
  { key: "xGI", label: "xGI", decimals: 2, figure: total((t) => t.xG + t.xA) },
  { key: "xGPerGame", label: "xG per Game", decimals: 2, figure: perGameOf((t) => t.xG) },
  { key: "xAPerGame", label: "xA per Game", decimals: 2, figure: perGameOf((t) => t.xA) },
  { key: "xGIPerGame", label: "xGI per Game", decimals: 2, figure: perGameOf((t) => t.xG + t.xA) },
  { key: "assists", label: "Assists", decimals: 0, figure: total((t) => t.assists) },
  { key: "minutes", label: "Minutes", decimals: 0, figure: total((t) => t.minutes) },
];

const GROUPS: { heading: string; metrics: Def[] }[] = [
  {
    heading: "Understat · Shooting",
    metrics: [
      { key: "us.shots", label: "Shots", decimals: 0, figure: fromShots(total((t) => t.shots)) },
      { key: "us.shotsPerGame", label: "Shots per Game", decimals: 2, figure: fromShots(perGameOf((t) => t.shots)) },
      { key: "us.npxG", label: "NPxG", decimals: 2, figure: fromShots(total((t) => t.npxG)) },
      { key: "us.npxGPerGame", label: "NPxG per Game", decimals: 2, figure: fromShots(perGameOf((t) => t.npxG)) },
      { key: "us.xGPerShot", label: "xG per Shot", decimals: 2, figure: fromShots((t) => (t.shots > 0 ? t.xG / t.shots : null)) },
    ],
  },
  {
    heading: "Understat · Creating",
    metrics: [
      { key: "us.keyPasses", label: "Key Passes", decimals: 0, figure: total((t) => t.keyPasses) },
      { key: "us.keyPassesPerGame", label: "Key Passes per Game", decimals: 2, figure: perGameOf((t) => t.keyPasses) },
      { key: "us.npxGI", label: "NPxGI", decimals: 2, figure: fromShots(total((t) => t.npxG + t.xA)) },
      { key: "us.xGChain", label: "xGChain", decimals: 2, figure: total((t) => t.xGChain) },
      { key: "us.xGChainPerGame", label: "xGChain per Game", decimals: 2, figure: perGameOf((t) => t.xGChain) },
      { key: "us.xGBuildup", label: "xGBuildup", decimals: 2, figure: total((t) => t.xGBuildup) },
    ],
  },
];

/** The trend figures, reading `data` (null while it loads: every point a gap). */
export function understatTrends(data: EnabledData | null): ExternalColumnSet<ExternalTrendMetric> {
  const metric = (m: Def): ExternalTrendMetric => ({
    key: m.key,
    label: m.label,
    decimals: m.decimals,
    value: (code: number, season: string) => {
      const row = data?.seasons.get(season)?.players.get(code);
      if (!row) return null;
      const v = m.figure(row);
      return v !== null && Number.isFinite(v) ? v : null;
    },
  });
  return {
    alternates: Object.fromEntries(ALTERNATES.map((m) => [m.key, metric(m)])),
    groups: GROUPS.map((g) => ({ heading: g.heading, columns: g.metrics.map(metric) })),
  };
}
