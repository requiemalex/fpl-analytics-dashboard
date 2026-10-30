import React from "react";
import { useAppState } from "../state/AppStateContext";

/** Plain names for the FPL fields whose presence is checked at load (normalize/fieldAvailability.ts). */
const FIELD_LABELS: Record<string, string> = {
  expected_goals: "xG",
  expected_assists: "xA",
  expected_goal_involvements: "xGI",
  expected_goals_conceded: "xGC",
  expected_goals_per_90: "xG per 90",
  expected_assists_per_90: "xA per 90",
  expected_goal_involvements_per_90: "xGI per 90",
  expected_goals_conceded_per_90: "xGC per 90",
  defensive_contribution: "Defensive Contributions",
  defensive_contribution_per_90: "Defensive Contributions per 90",
  starts: "Starts",
  starts_per_90: "Starts per 90",
  transfers_in: "Transfers in",
  transfers_out: "Transfers out",
  transfers_in_event: "Transfers in this gameweek",
  transfers_out_event: "Transfers out this gameweek",
  cost_change_event: "Price change this gameweek",
  cost_change_start: "Price change this season",
  form: "Form",
  price_change_percent: "Price Progress",
  price_change_projections: "Predicted Progress",
  price_change_calibrating: "Price predictor status",
};

/**
 * <data_health>: what this session's FPL data load left out, live, in the
 * "Something looks wrong" Help guide — fields FPL didn't send (shown as
 * "—" throughout), records dropped for invalid data, and any player whose
 * xGI isn't his xG + xA (the API's figure is always the one shown). A
 * clean load says so in one line.
 */
export function DataHealth() {
  const { advancedFieldAvailability, validationReport, skippedPlayerCount, skippedRecordCounts } = useAppState();
  const missing = advancedFieldAvailability
    ? Object.entries(advancedFieldAvailability)
        .filter(([, present]) => !present)
        .map(([field]) => FIELD_LABELS[field] ?? field)
    : [];
  const xgiOff = validationReport?.discrepancies.length ?? 0;
  const problems = [
    missing.length > 0 && `Not sent by FPL, so shown as "—": ${missing.join(", ")}.`,
    skippedPlayerCount > 0 && `${skippedPlayerCount} player record(s) left out for invalid data.`,
    skippedRecordCounts.fixtures > 0 && `${skippedRecordCounts.fixtures} fixture(s) left out for invalid data.`,
    skippedRecordCounts.clubSeasons > 0 && `${skippedRecordCounts.clubSeasons} club season(s) left out for invalid data.`,
    xgiOff > 0 && `${xgiOff} player(s) whose FPL xGI isn't xG + xA (FPL's figure is shown).`,
  ].filter((p): p is string => !!p);

  if (problems.length === 0) {
    return <div className="help-health ok">{advancedFieldAvailability ? "This session's FPL data loaded in full." : "FPL data is still loading."}</div>;
  }
  return (
    <div className="help-health">
      {problems.map((p) => (
        <div key={p}>{p}</div>
      ))}
    </div>
  );
}
