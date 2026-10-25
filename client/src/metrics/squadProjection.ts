import { sumKnown, type PartialSum } from "./partialTotals";

/** Which Exp. Pts the totals add up: FPL Official or Scoutline's Model Predicted. */
export type ProjectionSource = "fpl" | "model";

export interface StarterProjection {
  /** His Exp. Pts for each upcoming gameweek (aligned with upcomingGameweeks), a double's matches added up; null for a blank or with no figure. Not captain-doubled. */
  perGameweek: readonly (number | null)[];
  /** Whether his club plays in each of those gameweeks (false: a blank). */
  playing: readonly boolean[];
  isCaptain: boolean;
}

export interface GameweekProjection {
  /** The XI's total; null with no starter playing or no figures. */
  sum: PartialSum | null;
  /** Starters whose club has no match that gameweek. */
  blanks: number;
}

/**
 * <squad_projection>: the squad's Projected points (README "Team Building —
 * predictions"). One total per upcoming gameweek (<upcoming_gameweeks>),
 * never summed across gameweeks: entry i is the starting XI's Exp. Pts from
 * one source for gameweek i, a double gameweek's two matches both counted,
 * the captain's doubled (the squad's captain is assumed to keep the
 * armband). The bench doesn't count, and no automatic substitutions are
 * modelled.
 *
 * A starter whose club blanks has no match, so nothing to add: he's
 * counted in `blanks`, not in the total's `of`. A starter who plays but
 * has no figure (the model has no playing-time estimate for him) is left
 * out, never counted as 0, as a Totals row does (<partial_totals>): `n` of
 * `of` says how many had one.
 */
export function projectSquadPointsByGameweek(starters: readonly StarterProjection[], gameweekCount: number): GameweekProjection[] {
  return Array.from({ length: gameweekCount }, (_, i) => {
    const playing = starters.filter((s) => s.playing[i] === true);
    return {
      sum: sumKnown(
        playing.map((s) => {
          const v = s.perGameweek[i] ?? null;
          return v === null ? null : s.isCaptain ? v * 2 : v;
        }),
      ),
      blanks: starters.length - playing.length,
    };
  });
}

/** Hover note when only some playing starters had a figure; undefined when all did (or none). */
export function projectionCoverageNote(s: PartialSum | null): string | undefined {
  if (s === null || s.n === s.of) return undefined;
  return `From the ${s.n} of ${s.of} playing starters who have a figure (a starter with none is left out, not counted as 0)`;
}

/** Hover note for starters whose club blanks; undefined with none. */
export function projectionBlankNote(blanks: number, eventId: number): string | undefined {
  if (blanks === 0) return undefined;
  return `${blanks} starter${blanks === 1 ? " has" : "s have"} no match in GW${eventId}`;
}
