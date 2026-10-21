import type { Position } from "../types/normalized";

/** Understat's position codes, spelled out on hover (the Match Log's Position column, the Formations section's slots). */
export const POSITION_NAMES: Record<string, string> = {
  GK: "Goalkeeper",
  DC: "Centre-back",
  DL: "Left-back",
  DR: "Right-back",
  DMC: "Defensive midfield",
  DML: "Defensive midfield, left",
  DMR: "Defensive midfield, right",
  MC: "Central midfield",
  ML: "Left midfield",
  MR: "Right midfield",
  AMC: "Attacking midfield",
  AML: "Attacking midfield, left",
  AMR: "Attacking midfield, right",
  FW: "Forward",
  FWL: "Forward, left",
  FWR: "Forward, right",
  Sub: "Came off the bench",
};

/**
 * The FPL position whose colour a slot's badge takes on a formation pitch
 * (the app's position colours, as on Team Building's pitch): the keeper,
 * the back line, every midfield slot (wing-backs, DML/DMR, too, as the
 * formation counts them) and the forwards.
 */
export function positionGroupOf(code: string): Position {
  if (code === "GK") return "GKP";
  if (code.startsWith("FW")) return "FWD";
  if (code.startsWith("D") && !code.startsWith("DM")) return "DEF";
  return "MID";
}
