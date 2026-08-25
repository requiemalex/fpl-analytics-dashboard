import type { NormalizedPlayer, NormalizedTeam, Position } from "../types/normalized";
import { SQUAD_RULES } from "../types/team";
import type { UpcomingFixture } from "./fixtureTicker";
import { computeExpPointsBreakdown, type ExpectedPointsWindow } from "./expectedPoints";
import { computeBlendedMinutesReliability } from "./minutesReliabilityBlend";
import type { HistoricPlayerProfile } from "./historicAnalysis";

/** A player needs at least this much blended minutes reliability to be considered for the draft at all — excludes fringe/bench-risk players. */
export const OPTIMAL_DRAFT_MIN_RELIABILITY = 0.4;
/** Hard ceiling on backtracking search steps — bounds worst-case runtime rather than risking the browser hanging on a pathological candidate pool. Generous because branch-and-bound pruning means most of this budget is never actually needed. */
const NODE_BUDGET = 2_000_000;

interface DraftCandidate {
  player: NormalizedPlayer;
  expPts: number;
  /** Already in the user's squad when the draft was run — pre-committed outside the search entirely (see buildOptimalDraft), so it's guaranteed to end up in the final 15 rather than merely favoured within the search. Bypasses the reliability/data-availability eligibility filters non-locked candidates need to clear. */
  locked: boolean;
}

/** One squad slot to fill — `positions` has one entry for a fixed-position slot (e.g. "must be a GKP"), or several for a flexible one. */
interface SlotSpec {
  positions: Position[];
}

export interface DraftResult {
  squadPlayerIds: number[];
  startingXI: number[];
  captainId: number;
  viceCaptainId: number;
  /** Captain-doubled sum of Exp. Pts (Overall Average) across the starting XI — the value the draft was built to maximise. */
  totalExpPts: number;
  startingXIValue: number;
  benchValue: number;
}

export interface DraftFailure {
  reason: string;
}

function isFailure(result: DraftResult | DraftFailure): result is DraftFailure {
  return "reason" in result;
}

/**
 * A cheap LOWER BOUND on the cost of filling every slot from `fromIndex`
 * onward, given what's already chosen — the cheapest still-available
 * candidate for each remaining slot, without double-counting one
 * candidate across two slots. Ignores club limits (an already-chosen
 * club-mate could make the true cheapest option unavailable), so this
 * can slightly UNDERSTATE the true minimum cost — which only makes the
 * bound conservative in the safe direction: it might fail to prune a
 * branch that's actually doomed, but it will never prune a branch that
 * could still succeed.
 */
function minCostForRemainingSlots(
  byPosition: Record<Position, DraftCandidate[]>,
  slots: SlotSpec[],
  fromIndex: number,
  chosenIds: Set<number>,
): number {
  let total = 0;
  const virtuallyUsed = new Set<number>();
  for (let i = fromIndex; i < slots.length; i++) {
    let cheapest: DraftCandidate | null = null;
    for (const pos of slots[i].positions) {
      for (const c of byPosition[pos]) {
        if (chosenIds.has(c.player.id) || virtuallyUsed.has(c.player.id)) continue;
        if (!cheapest || c.player.price < cheapest.player.price) cheapest = c;
      }
    }
    if (!cheapest) return Infinity;
    virtuallyUsed.add(cheapest.player.id);
    total += cheapest.player.price;
  }
  return total;
}

/**
 * Depth-first backtracking search with branch-and-bound pruning: tries
 * the highest-Exp-Pts eligible candidate for the current slot, recurses
 * to the next one, and if that path can't ultimately complete, undoes
 * the pick and tries the next-best candidate for THIS slot instead —
 * rather than a single greedy pass that gives up the instant one slot
 * looks unaffordable or club-exhausted. Before committing to a
 * candidate, also checks whether even the cheapest possible way to fill
 * everything else still fits the budget (`minCostForRemainingSlots`),
 * skipping straight past doomed branches without wasting search budget
 * recursing into them. `nodeBudget` remains as a hard ceiling on
 * worst-case search size.
 */
function backtrackFill(
  byPosition: Record<Position, DraftCandidate[]>,
  slots: SlotSpec[],
  slotIndex: number,
  chosenList: DraftCandidate[],
  chosenIds: Set<number>,
  clubCounts: Map<number, number>,
  spendRef: { value: number },
  budgetCap: number,
  positionCaps: Partial<Record<Position, number>>,
  countsByPosition: Record<Position, number>,
  nodeBudget: { remaining: number },
): boolean {
  if (slotIndex >= slots.length) return true;

  const spec = slots[slotIndex];
  const pool = spec.positions
    .filter((p) => positionCaps[p] === undefined || countsByPosition[p] < positionCaps[p]!)
    .flatMap((p) => byPosition[p])
    .sort((a, b) => b.expPts - a.expPts);

  for (const candidate of pool) {
    if (nodeBudget.remaining <= 0) return false;
    nodeBudget.remaining--;
    if (chosenIds.has(candidate.player.id)) continue;
    const club = candidate.player.teamId;
    if ((clubCounts.get(club) ?? 0) >= SQUAD_RULES.maxPerClub) continue;
    if (spendRef.value + candidate.player.price > budgetCap) continue;

    chosenIds.add(candidate.player.id);
    const remainingMinCost = minCostForRemainingSlots(byPosition, slots, slotIndex + 1, chosenIds);
    chosenIds.delete(candidate.player.id);
    if (spendRef.value + candidate.player.price + remainingMinCost > budgetCap) continue;

    chosenList.push(candidate);
    chosenIds.add(candidate.player.id);
    clubCounts.set(club, (clubCounts.get(club) ?? 0) + 1);
    spendRef.value += candidate.player.price;
    countsByPosition[candidate.player.position]++;

    if (backtrackFill(byPosition, slots, slotIndex + 1, chosenList, chosenIds, clubCounts, spendRef, budgetCap, positionCaps, countsByPosition, nodeBudget)) {
      return true;
    }

    chosenList.pop();
    chosenIds.delete(candidate.player.id);
    clubCounts.set(club, (clubCounts.get(club) ?? 0) - 1);
    spendRef.value -= candidate.player.price;
    countsByPosition[candidate.player.position]--;
  }
  return false;
}

function sumTop(sorted: DraftCandidate[], n: number): number {
  return sorted.slice(0, n).reduce((sum, c) => sum + c.expPts, 0);
}

/**
 * Given a FIXED 15-man squad, this is EXACT, not heuristic: with the
 * squad already bought, there's no budget trade-off left to weigh, so
 * the Exp-Pts-maximising starting XI for any given formation is simply
 * the top-N players by Exp Pts within each position for that formation
 * — and the best formation is found by exhaustively trying every legal
 * (DEF, MID, FWD) split (a handful of combinations, not an expensive
 * search) and keeping whichever scores highest. This guarantees, by
 * construction, that no bench player can have a higher Exp Pts than a
 * formation-compatible starter — the exact bug this replaced a
 * price-driven "corrective pass" to fix.
 */
function selectBestStartingXI(squad: DraftCandidate[]): { xi: DraftCandidate[]; bench: DraftCandidate[] } {
  const byPos = (pos: Position) => squad.filter((c) => c.player.position === pos).sort((a, b) => b.expPts - a.expPts);
  const gkps = byPos("GKP");
  const defs = byPos("DEF");
  const mids = byPos("MID");
  const fwds = byPos("FWD");
  const bounds = SQUAD_RULES.startingXIBounds;

  let best: { d: number; m: number; f: number; total: number } | null = null;
  for (let d = bounds.DEF.min; d <= bounds.DEF.max; d++) {
    for (let m = bounds.MID.min; m <= bounds.MID.max; m++) {
      const f = 10 - d - m;
      if (f < bounds.FWD.min || f > bounds.FWD.max) continue;
      const total = sumTop(defs, d) + sumTop(mids, m) + sumTop(fwds, f);
      if (!best || total > best.total) best = { d, m, f, total };
    }
  }
  // A legal 5 DEF / 5 MID / 3 FWD squad always has at least one valid split (e.g. 4-4-2), so `best` should never be null here — the fallback exists only as a defensive guard, not an expected path.
  const formation = best ?? { d: 4, m: 4, f: 2, total: 0 };

  const xi = [gkps[0], ...defs.slice(0, formation.d), ...mids.slice(0, formation.m), ...fwds.slice(0, formation.f)];
  const xiIds = new Set(xi.map((c) => c.player.id));
  const bench = squad.filter((c) => !xiIds.has(c.player.id));
  return { xi, bench };
}

/**
 * A backtracking-search heuristic, not a provably optimal solver — no
 * constrained-optimisation library is available in this project (see
 * README), and this is disclosed as a strong heuristic throughout the
 * UI, never claimed as mathematically optimal.
 *
 * `players` is the candidate pool to draw NEW players from — callers
 * are expected to pass whatever's currently visible in the Add Players
 * table (respecting the user's own filters), not the whole unfiltered
 * player base. `lockedPlayerIds` are players already in the user's
 * squad — bypass the reliability/data-availability filters everyone
 * else needs to clear (since the user already chose them), and are
 * pre-committed to the squad BEFORE the search runs, not merely tried
 * first within it. An earlier version only sorted locked candidates
 * first, which was not sufficient: backtracking's whole mechanism is
 * "undo a tentative pick and try an alternative if something downstream
 * fails", and it doesn't distinguish a merely-preferred candidate from
 * a required one — two expensive locked players could still get undone
 * if their combined cost left too little room for the rest of a legal
 * squad. Pre-committing them means they are never part of the search's
 * own decision space, so there's nothing for it to undo; the search
 * only ever runs over the positions genuinely still needed once the
 * locked players' contribution is accounted for.
 *
 * Order of operations: build the candidate pool, pre-commit locked
 * players and compute what's still needed to reach 2 GKP / 5 DEF /
 * 5 MID / 3 FWD, then search for the REMAINING slots in ONE unified
 * pass against the REMAINING £100m budget — no separate starting-XI
 * sub-budget, there's no budget split to enforce any more, the target
 * is simply maximising Exp. Pts. Given the resulting fixed squad,
 * exactly select the Exp-Pts-maximising starting XI
 * (`selectBestStartingXI`). Captain and vice-captain are the two
 * highest-Exp-Pts starters.
 */
export function buildOptimalDraft(
  players: NormalizedPlayer[],
  lockedPlayerIds: Set<number>,
  fixturesByTeamId: Map<number, UpcomingFixture[]>,
  window: ExpectedPointsWindow,
  historicProfiles: Map<number, HistoricPlayerProfile>,
  teamsById: Map<number, NormalizedTeam>,
  currentSeasonHasStarted: boolean,
): DraftResult | DraftFailure {
  const candidates: DraftCandidate[] = [];
  for (const p of players) {
    const locked = lockedPlayerIds.has(p.id);
    const reliability = computeBlendedMinutesReliability(p, teamsById.get(p.teamId), historicProfiles.get(p.id)).value;
    if (!locked && (reliability === null || reliability < OPTIMAL_DRAFT_MIN_RELIABILITY)) continue;
    const breakdown = computeExpPointsBreakdown(p, fixturesByTeamId.get(p.teamId) ?? [], window, historicProfiles.get(p.id), currentSeasonHasStarted);
    if (!locked && breakdown.overallAverage === null) continue;
    candidates.push({ player: p, expPts: breakdown.overallAverage ?? 0, locked });
  }

  // <locked_player_guarantee>: locked players are pre-committed here,
  // BEFORE the search runs, rather than merely sorted first within it.
  // Sorting-first was tried initially and was not sufficient — trying a
  // candidate first only means backtracking reaches for it before other
  // options, not that it can never be undone. If committing to a locked
  // player later turned out to make some OTHER slot infeasible (e.g.
  // two expensive locked forwards leaving too little budget for the
  // rest of a legal squad), backtracking would undo them just like any
  // other tentative pick and search for an affordable full squad
  // without them — which is exactly the bug this replaced. Pre-
  // committing them here means they are never part of the search's own
  // decision space at all, so there is nothing for backtracking to undo.
  const lockedCandidates = candidates.filter((c) => c.locked);
  const nonLockedCandidates = candidates.filter((c) => !c.locked);

  const byPosition: Record<Position, DraftCandidate[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const c of nonLockedCandidates) byPosition[c.player.position].push(c);
  (Object.keys(byPosition) as Position[]).forEach((pos) => byPosition[pos].sort((a, b) => b.expPts - a.expPts));

  const chosen = new Set<number>();
  const clubCounts = new Map<number, number>();
  const spendRef = { value: 0 };
  const squadCounts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const c of lockedCandidates) {
    chosen.add(c.player.id);
    clubCounts.set(c.player.teamId, (clubCounts.get(c.player.teamId) ?? 0) + 1);
    spendRef.value += c.player.price;
    squadCounts[c.player.position]++;
  }

  const remainingNeeded: Record<Position, number> = {
    GKP: SQUAD_RULES.composition.GKP - squadCounts.GKP,
    DEF: SQUAD_RULES.composition.DEF - squadCounts.DEF,
    MID: SQUAD_RULES.composition.MID - squadCounts.MID,
    FWD: SQUAD_RULES.composition.FWD - squadCounts.FWD,
  };
  if (remainingNeeded.GKP < 0 || remainingNeeded.DEF < 0 || remainingNeeded.MID < 0 || remainingNeeded.FWD < 0) {
    return { reason: "The current squad already has more players in one position than a legal 15-man squad allows — this shouldn't be possible through normal use, so something's out of sync." };
  }

  const poolSummary = `(pool after reliability/data filters, beyond ${lockedCandidates.length} already-locked player(s): ${byPosition.GKP.length} GKP, ${byPosition.DEF.length} DEF, ${byPosition.MID.length} MID, ${byPosition.FWD.length} FWD)`;

  if (byPosition.GKP.length < remainingNeeded.GKP || byPosition.DEF.length < remainingNeeded.DEF ||
      byPosition.MID.length < remainingNeeded.MID || byPosition.FWD.length < remainingNeeded.FWD) {
    return { reason: `Not enough reliable, well-projected players available in one or more positions to complete a legal 15-man squad around what's already locked in ${poolSummary}.` };
  }

  const squadSlots: SlotSpec[] = [];
  (["GKP", "DEF", "MID", "FWD"] as Position[]).forEach((pos) => {
    for (let i = 0; i < remainingNeeded[pos]; i++) squadSlots.push({ positions: [pos] });
  });

  const searchResult: DraftCandidate[] = [];
  const nodeBudget = { remaining: NODE_BUDGET };

  const found = squadSlots.length === 0
    ? true // every slot is already filled by locked players
    : backtrackFill(byPosition, squadSlots, 0, searchResult, chosen, clubCounts, spendRef, SQUAD_RULES.budget, {}, squadCounts, nodeBudget);
  if (!found) {
    const cheapestRemainingCost = minCostForRemainingSlots(byPosition, squadSlots, 0, new Set());
    const remainingBudget = SQUAD_RULES.budget - lockedCandidates.reduce((sum, c) => sum + c.player.price, 0);
    const exhaustedSearch = nodeBudget.remaining <= 0;
    const note =
      cheapestRemainingCost > remainingBudget
        ? ` Even the cheapest possible way to complete the squad from this pool costs about £${cheapestRemainingCost.toFixed(1)}m, above the £${remainingBudget.toFixed(1)}m left after what's already locked in.`
        : ` A budget-feasible completion exists in principle (cheapest possible: about £${cheapestRemainingCost.toFixed(1)}m) — the search ${exhaustedSearch ? "ran out of its search-step budget before finding it" : "still couldn't reach it, most likely due to club-limit interactions"}.`;
    return { reason: `Couldn't complete a legal 15-man squad around what's already locked in, within budget and club-limit rules ${poolSummary}.${note}` };
  }

  const squad = [...lockedCandidates, ...searchResult];
  const { xi, bench } = selectBestStartingXI(squad);

  const xiByExpPts = [...xi].sort((a, b) => b.expPts - a.expPts);
  const captain = xiByExpPts[0];
  const viceCaptain = xiByExpPts[1];
  const totalExpPts = xi.reduce((sum, c) => sum + (c.player.id === captain.player.id ? c.expPts * 2 : c.expPts), 0);

  return {
    squadPlayerIds: squad.map((c) => c.player.id),
    startingXI: xi.map((c) => c.player.id),
    captainId: captain.player.id,
    viceCaptainId: viceCaptain.player.id,
    totalExpPts,
    startingXIValue: xi.reduce((sum, c) => sum + c.player.price, 0),
    benchValue: bench.reduce((sum, c) => sum + c.player.price, 0),
  };
}

export { isFailure as isDraftFailure };
