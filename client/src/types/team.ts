import type { Position, ChipWindow } from "./normalized";

/**
 * Standard official-FPL squad-building rules for a squad built from
 * scratch, or a real FPL team loaded in via its team ID (see the "New
 * Squad" dialog in pages/TeamBuilder.tsx and normalize/normalizeEntryImport.ts).
 * Loading a real team is a read-only, unauthenticated fetch of that
 * team's PUBLIC entry data — the FPL API's entry/{id}/ endpoints require
 * no login — so it doesn't need or add any authentication to this app;
 * that design principle (no accounts, nothing written back to FPL) is
 * unchanged. Centralised here so nowhere else hard-codes these numbers.
 */
export const SQUAD_RULES = {
  budget: 100.0, // £m
  squadSize: 15,
  composition: { GKP: 2, DEF: 5, MID: 5, FWD: 3 } as Record<Position, number>,
  maxPerClub: 3,
  startingXISize: 11,
  startingXIBounds: {
    GKP: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 2, max: 5 },
    FWD: { min: 1, max: 3 },
  } as Record<Position, { min: number; max: number }>,
};

/** One chip already spent — either read from a loaded FPL team's real history, or ticked manually for a squad built from scratch. */
export interface UsedChip {
  chip: ChipWindow["chip"];
  /** Gameweek it was played, if known (always known for an imported team; null if only marked manually with no specific gameweek attached). */
  event: number | null;
}

export interface SavedSquad {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Up to 15 player IDs — the full squad. */
  playerIds: number[];
  /** Subset of playerIds, up to 11 — who's in the starting line-up. */
  startingXI: number[];
  captainId: number | null;
  viceCaptainId: number | null;
  /**
   * <purchase_prices>: £m paid for each player, by id — for an import,
   * what the team really paid (importedPurchasePrices,
   * metrics/squadPrices.ts); for a player added in Scoutline, his price
   * the day he was added. A player with none (FPL's public data doesn't
   * have it, or the squad was saved before these were kept) shows "—".
   */
  purchasePrices: Record<number, number>;
  /** Chips already spent, from an FPL import. Empty for a squad built from scratch. Stored, but no page shows it at the moment. */
  usedChips: UsedChip[];
  /** Set when this squad was loaded from a real FPL team ID rather than built from scratch — its own bank/value at the time of import, and which team ID/gameweek it came from, purely for display ("Loaded from Team 1234567, GW3") and re-sync. Null for a from-scratch squad. */
  importedFrom: {
    teamId: number;
    teamName: string;
    managerName: string;
    asOfEvent: number;
    bank: number | null;
    /**
     * £m this squad had to spend at today's prices when it was imported
     * (its 15 players plus the bank): the budget only until its purchase
     * prices load (<imported_budget>, squadMoney in metrics/squadPrices.ts).
     * Null when that can't be known (no bank from FPL, a player FPL no
     * longer lists, or a squad imported before this existed): the £100m
     * then applies.
     */
    budget: number | null;
    /** The players it was imported with (<imported_budget>); null for an import saved before these were kept, until they're loaded again. */
    playerIds: number[] | null;
    /** What the team paid for each of them, from FPL (<purchase_prices>; one with none isn't known); null until loaded. */
    purchasePrices: Record<number, number> | null;
  } | null;
}

/** £m the squad can spend: an import's own budget (<imported_budget>), else FPL's starting £100m. */
export function squadBudget(squad: Pick<SavedSquad, "importedFrom"> | null | undefined): number {
  return squad?.importedFrom?.budget ?? SQUAD_RULES.budget;
}

export function createBlankSquad(name: string): SavedSquad {
  const now = Date.now();
  return {
    id: `squad-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
    playerIds: [],
    startingXI: [],
    captainId: null,
    viceCaptainId: null,
    purchasePrices: {},
    usedChips: [],
    importedFrom: null,
  };
}
