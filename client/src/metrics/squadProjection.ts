import { sumKnown, type PartialSum } from "./partialTotals";

/** Which Exp. Pts the totals add up: FPL Official or Scoutline's Model Predicted. */
export type ProjectionSource = "fpl" | "model";
/** How many of each player's next matches the Projected tile shows, one total each (GW+1 to GW+5). */
export const PROJECTION_MATCHES = 5;

export interface StarterProjection {
  /** His Exp. Pts for each of his next five matches (his own, so a blank gameweek is skipped); null with no figure or no match. Not captain-doubled. */
  perMatch: readonly (number | null)[];
  isCaptain: boolean;
}

/**
 * <squad_projection>: the squad's Projected points (README "Team Building —
 * predictions"). One total per match, never summed across matches: entry i
 * is the starting XI's Exp. Pts from one source for each starter's (i+1)th
 * next match, the captain's doubled (the squad's captain is assumed to keep
 * the armband). The bench doesn't count, and no automatic substitutions
 * are modelled.
 *
 * A starter with no figure for that match (no match left, or the model has
 * no playing-time estimate for him) is left out, never counted as 0, as a
 * Totals row does (<partial_totals>): `n` of `of` says how many had one.
 * An entry is null when none did, or with no starters.
 */
export function projectSquadPointsByMatch(starters: readonly StarterProjection[]): (PartialSum | null)[] {
  return Array.from({ length: PROJECTION_MATCHES }, (_, i) =>
    sumKnown(
      starters.map((s) => {
        const v = s.perMatch[i] ?? null;
        return v === null ? null : s.isCaptain ? v * 2 : v;
      }),
    ),
  );
}

/** Hover note when only some starters had a figure; undefined when all did (or none). */
export function projectionCoverageNote(s: PartialSum | null): string | undefined {
  if (s === null || s.n === s.of) return undefined;
  return `From the ${s.n} of ${s.of} starters who have a figure (a starter with none is left out, not counted as 0)`;
}
