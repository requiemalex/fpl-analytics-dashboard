import type { NormalizedPlayer } from "../types/normalized";

const TOLERANCE = 0.01;

export interface ValidationDiscrepancy {
  playerId: number;
  playerName: string;
  metric: string;
  apiValue: number;
  derivedValue: number;
  diff: number;
}

export interface ValidationReport {
  checkedMetrics: string[];
  playersChecked: number;
  discrepancies: ValidationDiscrepancy[];
}

function compare(
  player: NormalizedPlayer,
  metric: string,
  apiValue: number | null,
  derivedValue: number | null,
  discrepancies: ValidationDiscrepancy[],
) {
  if (apiValue === null || derivedValue === null) return;
  // Rounded to 6dp before comparing against TOLERANCE — without this, IEEE-754
  // representation error can push a genuinely-exact value's diff just past
  // the boundary (e.g. 0.4 - 0.39 === 0.010000000000000009 in JS, > 0.01),
  // producing a false positive on real, correct data (L4 in the audit).
  const diff = Math.round(Math.abs(apiValue - derivedValue) * 1e6) / 1e6;
  if (diff > TOLERANCE) {
    discrepancies.push({ playerId: player.id, playerName: player.name, metric, apiValue, derivedValue, diff });
  }
}

/**
 * Runs the data-validation check required by <xgi_rule>: independently
 * recompute xGI as xG + xA and flag any discrepancy beyond the 0.01
 * tolerance. This file used to also cross-check the live API's own
 * per-90 fields (xG/90, xA/90, etc.) against a recomputed per90() —
 * retired alongside the app-wide move from per-90 to per-game metrics
 * (see <per_game_not_per_90> in metrics/calculations.ts). This app no
 * longer reads or surfaces FPL's raw per-90 figures at all for those
 * fields, so there's nothing left to cross-check them against.
 */
export function runMetricValidation(players: NormalizedPlayer[]): ValidationReport {
  const discrepancies: ValidationDiscrepancy[] = [];

  for (const p of players) {
    if (p.xGI !== null && p.xG !== null && p.xA !== null) {
      compare(p, "xGI vs xG+xA", p.xGI, p.xG + p.xA, discrepancies);
    }
  }

  const report: ValidationReport = {
    checkedMetrics: ["xGI vs xG+xA"],
    playersChecked: players.length,
    discrepancies,
  };

  if (discrepancies.length > 0) {
    // Intentionally visible in the dev console — discrepancies beyond
    // tolerance must never be silently concealed.
    // eslint-disable-next-line no-console
    console.warn(
      `[metric-validation] ${discrepancies.length} discrepancy(ies) beyond tolerance (${TOLERANCE}) found across ${players.length} players.`,
      discrepancies,
    );
  }

  return report;
}
