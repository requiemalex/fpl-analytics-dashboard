import type { Position, ChipWindow } from "./normalized";

/**
 * Standard official-FPL squad-building rules for a squad built from
 * scratch, or a real FPL team loaded in via its team ID (see the "New
 * Squad" dialog in pages/TeamBuilder.tsx and normalize/normalizeEntryImport.ts).
 * Loading a real team is a read-only, unauthenticated fetch of that
 * team's PUBLIC entry data — the FPL API's entry/{id}/ endpoints require
 * no login — so it doesn't need or add any authentication to this app;
 * that design principle (no accounts, nothing written back to FPL) is
 * unchanged. Centralised here for the same reason ARCHETYPE_THRESHOLDS is
 * centralised — change it in one place, nowhere else hard-codes these
 * numbers.
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
  /** Ownership% below which a strong-underlying player counts as a "good differential". */
  differentialOwnershipMax: 10,
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
  /** Chips already spent — drives Chip Planner's "still available" filtering. Empty for a squad built from scratch until the user ticks any manually. */
  usedChips: UsedChip[];
  /** Set when this squad was loaded from a real FPL team ID rather than built from scratch — its own bank/value at the time of import, and which team ID/gameweek it came from, purely for display ("Loaded from Team 1234567, GW3") and re-sync. Null for a from-scratch squad. */
  importedFrom: { teamId: number; teamName: string; managerName: string; asOfEvent: number; bank: number } | null;
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
    usedChips: [],
    importedFrom: null,
  };
}
