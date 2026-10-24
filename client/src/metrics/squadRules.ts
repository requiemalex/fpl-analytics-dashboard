import type { NormalizedPlayer, Position } from "../types/normalized";
import { SQUAD_RULES } from "../types/team";

const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

export function squadBudgetUsed(squadPlayers: NormalizedPlayer[]): number {
  return squadPlayers.reduce((sum, p) => sum + p.price, 0);
}

export function squadCompositionCounts(squadPlayers: NormalizedPlayer[]): Record<Position, number> {
  const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of squadPlayers) counts[p.position] += 1;
  return counts;
}

export interface ClubViolation {
  teamId: number;
  teamName: string;
  count: number;
}

export function squadClubViolations(squadPlayers: NormalizedPlayer[]): ClubViolation[] {
  const byClub = new Map<number, { teamName: string; count: number }>();
  for (const p of squadPlayers) {
    const entry = byClub.get(p.teamId) ?? { teamName: p.teamName, count: 0 };
    entry.count += 1;
    byClub.set(p.teamId, entry);
  }
  const violations: ClubViolation[] = [];
  for (const [teamId, { teamName, count }] of byClub) {
    if (count > SQUAD_RULES.maxPerClub) violations.push({ teamId, teamName, count });
  }
  return violations;
}

export interface SquadValidation {
  squadSize: number;
  squadComplete: boolean; // exactly 15 players
  /** £m the squad can spend: FPL's £100m, or an import's own (<imported_budget>, types/team.ts). */
  budget: number;
  budgetUsed: number;
  budgetRemaining: number;
  budgetOk: boolean; // used <= budget
  composition: Record<Position, number>;
  compositionOk: boolean; // matches SQUAD_RULES.composition exactly
  clubViolations: ClubViolation[];
  /** True only when every rule above passes — a squad ready to pick a starting XI from. */
  valid: boolean;
}

/**
 * Validates the full 15-player squad against budget, composition, and
 * club-limit rules. Does not check the starting XI — see validateStartingXI.
 */
export function validateSquad(squadPlayers: NormalizedPlayer[], budget: number = SQUAD_RULES.budget): SquadValidation {
  const budgetUsed = squadBudgetUsed(squadPlayers);
  const composition = squadCompositionCounts(squadPlayers);
  const clubViolations = squadClubViolations(squadPlayers);
  const compositionOk = POSITIONS.every((pos) => composition[pos] === SQUAD_RULES.composition[pos]);
  const budgetOk = budgetUsed <= budget + 1e-9;
  const squadComplete = squadPlayers.length === SQUAD_RULES.squadSize;

  return {
    squadSize: squadPlayers.length,
    squadComplete,
    budget,
    budgetUsed,
    budgetRemaining: budget - budgetUsed,
    budgetOk,
    composition,
    compositionOk,
    clubViolations,
    valid: squadComplete && budgetOk && compositionOk && clubViolations.length === 0,
  };
}

export interface StartingXIValidation {
  size: number;
  sizeOk: boolean; // exactly 11
  composition: Record<Position, number>;
  formationOk: boolean; // within startingXIBounds for every position
  issues: string[];
  valid: boolean;
}

export function validateStartingXI(startingXIPlayers: NormalizedPlayer[]): StartingXIValidation {
  const composition = squadCompositionCounts(startingXIPlayers);
  const issues: string[] = [];
  const sizeOk = startingXIPlayers.length === SQUAD_RULES.startingXISize;
  if (!sizeOk) issues.push(`Starting XI has ${startingXIPlayers.length} of ${SQUAD_RULES.startingXISize} players`);

  let formationOk = true;
  for (const pos of POSITIONS) {
    const { min, max } = SQUAD_RULES.startingXIBounds[pos];
    const count = composition[pos];
    if (count < min || count > max) {
      formationOk = false;
      issues.push(`${pos}: ${count} selected (needs ${min}${max > min ? `–${max}` : ""})`);
    }
  }

  return { size: startingXIPlayers.length, sizeOk, composition, formationOk, issues, valid: sizeOk && formationOk };
}

/**
 * <add_to_xi>: can `candidate` join the starting XI (`xiPlayers`, not yet
 * including him) and still leave room for a legal formation? True while
 * the XI has a place, his position is under its starting maximum, and the
 * places left after him still cover every position's minimum. So Add
 * fills the pitch first and the bench takes the rest: a second goalkeeper,
 * or an outfielder who would leave no room for the 3 DEF / 2 MID / 1 FWD a
 * formation needs, goes to the bench.
 */
export function fitsStartingXI(xiPlayers: NormalizedPlayer[], candidate: NormalizedPlayer): boolean {
  if (xiPlayers.length >= SQUAD_RULES.startingXISize) return false;
  const after = squadCompositionCounts([...xiPlayers, candidate]);
  if (after[candidate.position] > SQUAD_RULES.startingXIBounds[candidate.position].max) return false;
  const placesLeft = SQUAD_RULES.startingXISize - (xiPlayers.length + 1);
  const stillNeeded = POSITIONS.reduce((sum, pos) => sum + Math.max(0, SQUAD_RULES.startingXIBounds[pos].min - after[pos]), 0);
  return stillNeeded <= placesLeft;
}

/** The shape empty pitch slots fill toward once each line has its minimum: FPL's own default, 4-4-2. */
const DEFAULT_SHAPE: Record<Position, number> = { GKP: 1, DEF: 4, MID: 4, FWD: 2 };

export interface OpenSlots {
  /** Empty places drawn on the pitch, by position. */
  pitch: Record<Position, number>;
  /** Empty bench places, goalkeeper first. */
  bench: Position[];
}

/**
 * <open_slots>: the "+" places a squad still has to fill, so the pitch and
 * bench always show where the next players go. Only positions the squad is
 * short of (2 GKP, 5 DEF, 5 MID, 3 FWD) get one. The starting XI's open
 * places take them first, in an order that keeps it legal: every line to
 * its minimum, then toward 4-4-2, then to its maximum. What's left goes on
 * the bench. An empty squad shows a 4-4-2 and a bench of GKP, DEF, MID, FWD.
 */
export function openSquadSlots(squadPlayers: NormalizedPlayer[], xiPlayers: NormalizedPlayer[]): OpenSlots {
  const squad = squadCompositionCounts(squadPlayers);
  const xi = squadCompositionCounts(xiPlayers);
  const pitch: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  const short = (pos: Position) => Math.max(0, SQUAD_RULES.composition[pos] - squad[pos]) - pitch[pos];
  let open = Math.max(0, SQUAD_RULES.startingXISize - xiPlayers.length);
  const fillTo = (limit: (pos: Position) => number) => {
    for (const pos of POSITIONS) {
      while (open > 0 && short(pos) > 0 && xi[pos] + pitch[pos] < limit(pos)) {
        pitch[pos] += 1;
        open -= 1;
      }
    }
  };
  fillTo((pos) => SQUAD_RULES.startingXIBounds[pos].min);
  fillTo((pos) => DEFAULT_SHAPE[pos]);
  fillTo((pos) => SQUAD_RULES.startingXIBounds[pos].max);
  const bench = POSITIONS.flatMap((pos) => Array<Position>(short(pos)).fill(pos));
  return { pitch, bench };
}

export interface AddPlayerCheck {
  ok: boolean;
  reason?: string;
}

/** Would adding `candidate` to the current squad (`squadPlayers`, not yet including candidate) break a rule? */
export function canAddPlayer(squadPlayers: NormalizedPlayer[], candidate: NormalizedPlayer): AddPlayerCheck {
  if (squadPlayers.some((p) => p.id === candidate.id)) return { ok: false, reason: "Already in squad" };
  if (squadPlayers.length >= SQUAD_RULES.squadSize) return { ok: false, reason: "Squad full (15/15)" };

  const composition = squadCompositionCounts(squadPlayers);
  if (composition[candidate.position] >= SQUAD_RULES.composition[candidate.position]) {
    return { ok: false, reason: `${candidate.position} slots full (${SQUAD_RULES.composition[candidate.position]}/${SQUAD_RULES.composition[candidate.position]})` };
  }

  // No budget check here by design — the budget is only ever shown
  // as a tracker (red once over, via SquadStatusLine's budgetOk), never a
  // hard block on adding a player. A user building a squad they intend to
  // trim down, or just exploring "what if" combinations, shouldn't be
  // stopped mid-build by a rule that isn't actually enforced anywhere else
  // in this app (there's no real-money transaction to protect).
  const clubCount = squadPlayers.filter((p) => p.teamId === candidate.teamId).length;
  if (clubCount >= SQUAD_RULES.maxPerClub) {
    return { ok: false, reason: `Max ${SQUAD_RULES.maxPerClub} players per club reached` };
  }

  return { ok: true };
}
