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
  /**
   * <squad_transfers>: free transfers bank up to this many (bootstrap's
   * `max_extra_free_transfers` is 4 on top of the week's one, checked live
   * 2026-11-02), and each transfer past them costs this many points (FPL's
   * rule; its API doesn't send it, but every hit in a team's history is a
   * multiple of it).
   */
  maxFreeTransfers: 5,
  hitCost: 4,
};

export type ChipName = ChipWindow["chip"];

/** One chip already spent — read from a loaded FPL team's history, played in Scoutline (<squad_chips>), or marked used by hand for a squad built here. */
export interface UsedChip {
  chip: ChipName;
  /** Gameweek it was played, if known (always for an import or a chip played here); null when only marked used by hand. */
  event: number | null;
  /** The half of the season (its chip window) a chip marked used by hand belongs to; absent when `event` says it. */
  half?: 1 | 2;
}

/** <gameweek_log>: one squad as it stood at one gameweek's deadline. */
export interface GameweekRecord {
  event: number;
  playerIds: number[];
  startingXI: number[];
  captainId: number | null;
  viceCaptainId: number | null;
  /** <squad_transfers>: transfers made for the gameweek and the points they cost; absent where they weren't tracked. */
  transfers?: number;
  transferCost?: number;
  /** <squad_chips>: the chip played that gameweek, if any. */
  chip?: ChipName;
}

/** A squad's players, XI, armbands and purchase prices at one moment: what a Free Hit puts back. */
export interface SquadSnapshot {
  playerIds: number[];
  startingXI: number[];
  captainId: number | null;
  viceCaptainId: number | null;
  purchasePrices: Record<number, number>;
}

/**
 * <squad_transfers>: a squad's transfers for the gameweek open for picks.
 * Pending transfers are the players bought since `baseIds` (the squad at
 * the deadline or the last confirm); confirming adds them to `made`. At
 * the deadline they're counted, and the next gameweek's free transfers
 * follow FPL's rules (metrics/squadTransfers.ts).
 */
export interface TransferWindow {
  /** The gameweek these are for: the next deadline. */
  event: number;
  /** Free transfers at its start; null is unlimited (a new squad's first gameweek). */
  free: number | null;
  /** Transfers confirmed so far this gameweek. */
  made: number;
  /** The squad's players at the deadline or the last confirm. */
  baseIds: number[];
  /** The squad at the deadline: what a Free Hit puts back after the gameweek. */
  start: SquadSnapshot;
  /** <squad_chips>: the chip played this gameweek, if any. */
  chip: ChipName | null;
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
  /**
   * <gameweek_log>: a squad built in Scoutline, as it stood at each deadline
   * passed since it was made (state/gameweekRecords.ts), so its Gameweek Log
   * can score it. Empty for an import: FPL keeps its history.
   */
  gameweekLog: GameweekRecord[];
  /** <squad_chips>: chips already spent — an import's from FPL; a squad built here's played in Scoutline or marked used by hand. */
  usedChips: UsedChip[];
  /**
   * <squad_transfers>: this gameweek's transfers and chip. Null for a squad
   * built here until it has played a gameweek or its free transfers are set
   * (its first gameweek's transfers are unlimited), and for an import saved
   * before these were kept, until Team Building reads them from FPL.
   */
  transfers: TransferWindow | null;
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
    transfers: null,
    gameweekLog: [],
    importedFrom: null,
  };
}

/** <squad_transfers>: the squad as it stands, for a Free Hit to put back. */
export function snapshotOf(squad: Pick<SavedSquad, "playerIds" | "startingXI" | "captainId" | "viceCaptainId" | "purchasePrices">): SquadSnapshot {
  return {
    playerIds: [...squad.playerIds],
    startingXI: [...squad.startingXI],
    captainId: squad.captainId,
    viceCaptainId: squad.viceCaptainId,
    purchasePrices: { ...squad.purchasePrices },
  };
}
