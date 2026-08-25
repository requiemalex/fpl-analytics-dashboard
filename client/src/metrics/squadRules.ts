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
export function validateSquad(squadPlayers: NormalizedPlayer[]): SquadValidation {
  const budgetUsed = squadBudgetUsed(squadPlayers);
  const composition = squadCompositionCounts(squadPlayers);
  const clubViolations = squadClubViolations(squadPlayers);
  const compositionOk = POSITIONS.every((pos) => composition[pos] === SQUAD_RULES.composition[pos]);
  const budgetOk = budgetUsed <= SQUAD_RULES.budget + 1e-9;
  const squadComplete = squadPlayers.length === SQUAD_RULES.squadSize;

  return {
    squadSize: squadPlayers.length,
    squadComplete,
    budgetUsed,
    budgetRemaining: SQUAD_RULES.budget - budgetUsed,
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

  const budgetUsed = squadBudgetUsed(squadPlayers);
  if (budgetUsed + candidate.price > SQUAD_RULES.budget + 1e-9) {
    return { ok: false, reason: `Would exceed £${SQUAD_RULES.budget.toFixed(1)}m budget` };
  }

  const clubCount = squadPlayers.filter((p) => p.teamId === candidate.teamId).length;
  if (clubCount >= SQUAD_RULES.maxPerClub) {
    return { ok: false, reason: `Max ${SQUAD_RULES.maxPerClub} players per club reached` };
  }

  return { ok: true };
}
