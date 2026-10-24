import { sumKnown, type PartialSum } from "./partialTotals";

/** Which Exp. Pts the total adds up: FPL Official or Scoutline's Model Predicted. */
export type ProjectionSource = "fpl" | "model";
/** How many of each player's next matches it covers: 1 = GW+1 only, 3 = GW+1 to GW+3. */
export type ProjectionHorizon = 1 | 2 | 3 | 4 | 5;

export interface StarterProjection {
  /** His Exp. Pts for each of his next five matches (his own, so a blank gameweek is skipped); null with no figure or no match. Not captain-doubled. */
  perMatch: readonly (number | null)[];
  isCaptain: boolean;
}

/**
 * <squad_projection>: the squad's Projected points (README "Team Building —
 * predictions"). The starting XI's Exp. Pts from one source, added up over
 * each starter's next `horizon` matches, the captain's doubled in every one
 * of them (the squad's captain is assumed to keep the armband). The bench
 * doesn't count, and no automatic substitutions are modelled.
 *
 * A starter-match with no figure (no match left, or the model has no
 * playing-time estimate for him) is left out, never counted as 0, as a
 * Totals row does (<partial_totals>): `n` of `of` says how many had one.
 * Null when none did, or with no starters.
 */
export function projectSquadPoints(starters: readonly StarterProjection[], horizon: ProjectionHorizon): PartialSum | null {
  const values = starters.flatMap((s) =>
    Array.from({ length: horizon }, (_, i) => {
      const v = s.perMatch[i] ?? null;
      return v === null ? null : s.isCaptain ? v * 2 : v;
    }),
  );
  return sumKnown(values);
}

/** Hover note when only some starter-matches had a figure; undefined when all did (or none). */
export function projectionCoverageNote(s: PartialSum | null): string | undefined {
  if (s === null || s.n === s.of) return undefined;
  return `From the ${s.n} of ${s.of} starter-matches that have a figure (a match with none is left out, not counted as 0)`;
}

/** "GW+1", or "GW+1–3" for a range. */
export function horizonLabel(horizon: ProjectionHorizon): string {
  return horizon === 1 ? "GW+1" : `GW+1–${horizon}`;
}
