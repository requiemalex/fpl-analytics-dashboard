import type { RawElement } from "../types/raw";

/**
 * The FPL API sometimes omits fields entirely for a given season/build
 * rather than sending them as null. Detecting "does this key exist at all
 * on the object" (rather than trusting a TypeScript type) is how this app
 * honours the "inspect the actual live API response, don't assume a field
 * name based on historical API behaviour" rule.
 *
 * We sample every element (bootstrap-static is a few hundred players — this
 * is cheap) rather than just the first one, in case a field is present but
 * null/undefined for some players (e.g. keepers) and only present for others.
 */
export interface AdvancedFieldAvailability {
  expected_goals: boolean;
  expected_assists: boolean;
  expected_goal_involvements: boolean;
  expected_goals_conceded: boolean;
  expected_goals_per_90: boolean;
  expected_assists_per_90: boolean;
  expected_goal_involvements_per_90: boolean;
  expected_goals_conceded_per_90: boolean;
  defensive_contribution: boolean;
  defensive_contribution_per_90: boolean;
  starts: boolean;
  starts_per_90: boolean;
  transfers_in: boolean;
  transfers_out: boolean;
  transfers_in_event: boolean;
  transfers_out_event: boolean;
  cost_change_event: boolean;
  cost_change_start: boolean;
  form: boolean;
  /** New for 2026/27 — FPL's own official Price Change Predictor fields (see raw.ts). */
  price_change_percent: boolean;
  price_change_projections: boolean;
  price_change_calibrating: boolean;
}

const CANDIDATE_FIELDS = [
  "expected_goals",
  "expected_assists",
  "expected_goal_involvements",
  "expected_goals_conceded",
  "expected_goals_per_90",
  "expected_assists_per_90",
  "expected_goal_involvements_per_90",
  "expected_goals_conceded_per_90",
  "defensive_contribution",
  "defensive_contribution_per_90",
  "starts",
  "starts_per_90",
  "transfers_in",
  "transfers_out",
  "transfers_in_event",
  "transfers_out_event",
  "cost_change_event",
  "cost_change_start",
  "form",
  "price_change_percent",
  "price_change_projections",
  "price_change_calibrating",
] as const;

export function detectAdvancedFieldAvailability(elements: RawElement[]): AdvancedFieldAvailability {
  const availability = Object.fromEntries(CANDIDATE_FIELDS.map((f) => [f, false])) as unknown as AdvancedFieldAvailability;

  for (const el of elements) {
    for (const field of CANDIDATE_FIELDS) {
      if (availability[field]) continue; // already confirmed present
      if (Object.prototype.hasOwnProperty.call(el, field)) {
        (availability as unknown as Record<string, boolean>)[field] = true;
      }
    }
    if (Object.values(availability).every(Boolean)) break; // early exit once everything is confirmed
  }

  return availability;
}
