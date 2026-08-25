import type { NormalizedPlayer } from "../types/normalized";
import { per90 } from "./calculations";

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
  const diff = Math.abs(apiValue - derivedValue);
  if (diff > TOLERANCE) {
    discrepancies.push({ playerId: player.id, playerName: player.name, metric, apiValue, derivedValue, diff });
  }
}

/**
 * Runs the data-validation checks required by <per90_validation> and
 * <xgi_rule>: independently recompute each API-supplied per-90 metric (and
 * xGI) from raw totals + minutes, and flag any discrepancy beyond the
 * 0.01 tolerance. The API-supplied value is ALWAYS what gets displayed —
 * this never mutates player data, it only surfaces discrepancies so they
 * are identifiable during development rather than silently concealed.
 */
export function runMetricValidation(players: NormalizedPlayer[]): ValidationReport {
  const discrepancies: ValidationDiscrepancy[] = [];

  for (const p of players) {
    if (p.minutes === null || p.minutes <= 0) continue; // per90 is undefined at 0 minutes; nothing to cross-check

    compare(p, "xG/90", p.xGPer90, per90(p.xG, p.minutes), discrepancies);
    compare(p, "xA/90", p.xAPer90, per90(p.xA, p.minutes), discrepancies);
    compare(p, "xGI/90", p.xGIPer90, per90(p.xGI, p.minutes), discrepancies);
    compare(p, "xGC/90", p.xGCPer90, per90(p.xGC, p.minutes), discrepancies);
    compare(p, "Defensive Contributions/90", p.defensiveContributionsPer90, per90(p.defensiveContributions, p.minutes), discrepancies);

    if (p.xGI !== null && p.xG !== null && p.xA !== null) {
      compare(p, "xGI vs xG+xA", p.xGI, p.xG + p.xA, discrepancies);
    }
  }

  const report: ValidationReport = {
    checkedMetrics: ["xG/90", "xA/90", "xGI/90", "xGC/90", "Defensive Contributions/90", "xGI vs xG+xA"],
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
