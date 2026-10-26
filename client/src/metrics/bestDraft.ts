import { SQUAD_RULES } from "../types/team";
import type { Position } from "../types/normalized";

/** One squad player for Best Draft: his Exp. Pts for the chosen gameweek (one source, not captain-doubled). */
export interface DraftCandidate {
  id: number;
  position: Position;
  /** Null with no figure. */
  points: number | null;
  /** Whether his club plays that gameweek: a blank is a real 0, not a missing figure. */
  playing: boolean;
}

export interface DraftPicks {
  startingXI: number[];
  captainId: number | null;
  viceCaptainId: number | null;
}

/** What Best Draft can't work around, in words, for the button's hover; null when it can run. */
export function bestDraftBlocker(candidates: readonly DraftCandidate[]): string | null {
  const bounds = SQUAD_RULES.startingXIBounds;
  const short = (Object.keys(bounds) as Position[]).some((pos) => candidates.filter((c) => c.position === pos).length < bounds[pos].min);
  if (short || candidates.length < SQUAD_RULES.startingXISize) {
    return `Needs players for a legal starting XI first: ${SQUAD_RULES.startingXISize} in all, with at least ${bounds.GKP.min} goalkeeper, ${bounds.DEF.min} defenders, ${bounds.MID.min} midfielders and ${bounds.FWD.min} forward`;
  }
  if (!candidates.some((c) => c.playing && c.points !== null)) return "No player in the squad has a figure for this gameweek";
  return null;
}

/** His figure for ranking: a blank scores 0; null when he plays but has no figure. */
function value(c: DraftCandidate): number | null {
  return c.playing ? c.points : 0;
}

/**
 * <best_draft>: the starting XI, captain and vice-captain with the most
 * Exp. Pts for one gameweek, in a formation FPL allows (1 GKP, 3–5 DEF,
 * 2–5 MID, 1–3 FWD). Every legal formation is tried, each taking its
 * best players per position; the captain's doubling can't change which
 * XI wins (the squad's top scorer starts in every formation, since each
 * position starts at least one), so he's simply the XI's top figure and
 * the vice-captain the next. A player who plays but has no figure is
 * picked only when a legal XI needs him, never counted as 0
 * (<partial_totals>). Ties keep the current arrangement: a current
 * starter before a benched player, the current captain and vice before
 * anyone else. Null when bestDraftBlocker has a reason.
 */
export function bestDraft(candidates: readonly DraftCandidate[], current: DraftPicks): DraftPicks | null {
  if (bestDraftBlocker(candidates) !== null) return null;
  const starting = new Set(current.startingXI);
  const order = (a: DraftCandidate, b: DraftCandidate) => {
    const va = value(a);
    const vb = value(b);
    if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
    if (va !== null && vb !== null && va !== vb) return vb - va;
    if (starting.has(a.id) !== starting.has(b.id)) return starting.has(a.id) ? -1 : 1;
    return a.id - b.id;
  };
  const byPosition = (pos: Position) => candidates.filter((c) => c.position === pos).sort(order);
  const pools: Record<Position, DraftCandidate[]> = { GKP: byPosition("GKP"), DEF: byPosition("DEF"), MID: byPosition("MID"), FWD: byPosition("FWD") };
  const bounds = SQUAD_RULES.startingXIBounds;

  let best: { xi: DraftCandidate[]; missing: number; total: number; kept: number } | null = null;
  for (let def = bounds.DEF.min; def <= bounds.DEF.max; def++) {
    for (let mid = bounds.MID.min; mid <= bounds.MID.max; mid++) {
      const fwd = SQUAD_RULES.startingXISize - bounds.GKP.min - def - mid;
      if (fwd < bounds.FWD.min || fwd > bounds.FWD.max) continue;
      const counts: Record<Position, number> = { GKP: bounds.GKP.min, DEF: def, MID: mid, FWD: fwd };
      if ((Object.keys(counts) as Position[]).some((pos) => pools[pos].length < counts[pos])) continue;
      const xi = (Object.keys(counts) as Position[]).flatMap((pos) => pools[pos].slice(0, counts[pos]));
      const missing = xi.filter((c) => value(c) === null).length;
      const total = xi.reduce((sum, c) => sum + (value(c) ?? 0), 0);
      const kept = xi.filter((c) => starting.has(c.id)).length;
      const better = best === null || missing < best.missing || (missing === best.missing && (total > best.total + 1e-9 || (Math.abs(total - best.total) <= 1e-9 && kept > best.kept)));
      if (better) best = { xi, missing, total, kept };
    }
  }
  if (best === null) return null;

  const armbandOrder = (a: DraftCandidate, b: DraftCandidate) => {
    const rank = (c: DraftCandidate) => (c.id === current.captainId ? 0 : c.id === current.viceCaptainId ? 1 : 2);
    const va = value(a);
    const vb = value(b);
    if (va !== null && vb !== null && va !== vb) return vb - va;
    return rank(a) - rank(b) || order(a, b);
  };
  const armbands = best.xi.filter((c) => value(c) !== null).sort(armbandOrder);
  return {
    startingXI: best.xi.map((c) => c.id),
    captainId: armbands[0]?.id ?? null,
    viceCaptainId: armbands[1]?.id ?? null,
  };
}
