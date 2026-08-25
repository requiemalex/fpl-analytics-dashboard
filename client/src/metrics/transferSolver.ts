import type { NormalizedPlayer } from "../types/normalized";
import { computeExpectedPointsForWindow, type ExpectedPointsWindow } from "./expectedPoints";
import type { UpcomingFixture } from "./fixtureTicker";
import { canAddPlayer } from "./squadRules";

/** Standard FPL cost per transfer beyond the free allowance — stable, well-known rule, not a tunable heuristic. */
export const TRANSFER_HIT_COST = 4;

/** How many single-swap candidates get carried forward into the 2-transfer search — see findDoubleTransferSuggestions for why this is a heuristic, not an exhaustive search. */
const DOUBLE_TRANSFER_BEAM_WIDTH = 10;

export interface SwapLeg {
  out: NormalizedPlayer;
  in: NormalizedPlayer;
  /** computeExpectedPointsForWindow(in) − computeExpectedPointsForWindow(out) over the selected horizon. Null if either side has no ep_next to project from. */
  gain: number | null;
  /** in.price − out.price — positive costs more, negative frees up budget. */
  priceDelta: number;
}

export interface TransferSuggestion {
  legs: SwapLeg[]; // exactly 1 or 2
  /** Sum of every leg's gain — null if any leg is unprojectable (never silently treated as 0). */
  totalGain: number | null;
  /** 0 if this fits within freeTransfers, otherwise (legs.length − freeTransfers) × TRANSFER_HIT_COST. */
  hitCost: number;
  /** totalGain − hitCost — what suggestions are ranked by. Null propagates from totalGain. */
  netGain: number | null;
  totalPriceDelta: number;
}

function scoreFor(player: NormalizedPlayer, fixturesByTeamId: Map<number, UpcomingFixture[]>, window: ExpectedPointsWindow): number | null {
  return computeExpectedPointsForWindow(player, fixturesByTeamId.get(player.teamId) ?? [], window);
}

/**
 * Every valid same-position, budget-and-club-limit-respecting single swap,
 * sorted by expected-points gain (best first). "Valid" is delegated
 * entirely to canAddPlayer against the squad with `out` already removed —
 * the same rule-check the Add Players table itself uses, so a suggestion
 * here is never one canAddPlayer would reject if you tried to apply it by
 * hand.
 *
 * Scoped to same-position swaps only (a DEF replaced by a DEF, etc.) —
 * this keeps the 2-5-5-3 composition trivially intact and keeps the
 * search small enough to run synchronously in the browser. A transfer
 * that also changes formation shape (e.g. selling a DEF to add an extra
 * MID) isn't considered — see the Transfer Solver card's own note on this.
 */
export function findSingleTransferSuggestions(
  squadPlayers: NormalizedPlayer[],
  pool: NormalizedPlayer[],
  fixturesByTeamId: Map<number, UpcomingFixture[]>,
  window: ExpectedPointsWindow,
  freeTransfers: number,
): TransferSuggestion[] {
  const squadIds = new Set(squadPlayers.map((p) => p.id));
  const suggestions: TransferSuggestion[] = [];

  for (const outP of squadPlayers) {
    const outScore = scoreFor(outP, fixturesByTeamId, window);
    const remainingSquad = squadPlayers.filter((p) => p.id !== outP.id);
    for (const inP of pool) {
      if (inP.position !== outP.position) continue;
      if (squadIds.has(inP.id)) continue;
      if (!canAddPlayer(remainingSquad, inP).ok) continue;
      const inScore = scoreFor(inP, fixturesByTeamId, window);
      const gain = outScore !== null && inScore !== null ? inScore - outScore : null;
      const hitCost = freeTransfers >= 1 ? 0 : TRANSFER_HIT_COST;
      suggestions.push({
        legs: [{ out: outP, in: inP, gain, priceDelta: inP.price - outP.price }],
        totalGain: gain,
        hitCost,
        netGain: gain !== null ? gain - hitCost : null,
        totalPriceDelta: inP.price - outP.price,
      });
    }
  }

  return suggestions.filter((s) => s.netGain !== null).sort((a, b) => b.netGain! - a.netGain!);
}

/**
 * Two-transfer suggestions, built by pairing up the strongest single-swap
 * legs rather than exhaustively searching every possible pair of pairs.
 * <two_transfer_search_scope>: an exhaustive search would be roughly
 * C(15,2) squad-pairs × C(pool,2) replacement-pairs — tens of millions of
 * combinations, not something to run synchronously in a browser. Instead,
 * this takes the top `DOUBLE_TRANSFER_BEAM_WIDTH` single-leg swaps (by
 * gain alone) and checks every combination of two of them that involves
 * two different squad players and two different incoming players,
 * re-validating the combined move against budget/composition/club-limits
 * together (not just each leg individually — two legs that are each valid
 * alone can still jointly bust a club limit or the budget). This is a
 * genuine heuristic: a strong 2-transfer combination built from two
 * moves that are only mediocre on their own (but happen to complement
 * each other) would not surface here. Labelled as such on the page.
 */
export function findDoubleTransferSuggestions(
  squadPlayers: NormalizedPlayer[],
  pool: NormalizedPlayer[],
  fixturesByTeamId: Map<number, UpcomingFixture[]>,
  window: ExpectedPointsWindow,
  freeTransfers: number,
): TransferSuggestion[] {
  // freeTransfers=1 here is just "guarantee no hit cost gets baked into
  // each leg's own gain figure" — beam selection should rank candidate
  // legs purely on their own expected-points gain, not on a hypothetical
  // single-transfer hit framing. The REAL hit cost for the pair as a
  // whole is computed separately below, from the actual freeTransfers
  // this function was called with.
  const singleLegs = findSingleTransferSuggestions(squadPlayers, pool, fixturesByTeamId, window, 1).slice(0, DOUBLE_TRANSFER_BEAM_WIDTH);
  const suggestions: TransferSuggestion[] = [];

  for (let i = 0; i < singleLegs.length; i++) {
    for (let j = i + 1; j < singleLegs.length; j++) {
      const legA = singleLegs[i].legs[0];
      const legB = singleLegs[j].legs[0];
      if (legA.out.id === legB.out.id || legA.in.id === legB.in.id) continue;

      const remainingSquad = squadPlayers.filter((p) => p.id !== legA.out.id && p.id !== legB.out.id);
      if (!canAddPlayer(remainingSquad, legA.in).ok) continue;
      const afterFirstAdd = [...remainingSquad, legA.in];
      if (!canAddPlayer(afterFirstAdd, legB.in).ok) continue;

      const totalGain = legA.gain !== null && legB.gain !== null ? legA.gain + legB.gain : null;
      const hitCost = Math.max(0, 2 - freeTransfers) * TRANSFER_HIT_COST;
      suggestions.push({
        legs: [legA, legB],
        totalGain,
        hitCost,
        netGain: totalGain !== null ? totalGain - hitCost : null,
        totalPriceDelta: legA.priceDelta + legB.priceDelta,
      });
    }
  }

  // De-duplicate the symmetric (B, A) vs (A, B) pairing the double loop
  // above already avoids by construction (j starts at i+1), so no further
  // de-dup needed — sort and return.
  return suggestions.filter((s) => s.netGain !== null).sort((a, b) => b.netGain! - a.netGain!);
}
