import { useCallback } from "react";
import type { SavedSquad } from "../types/team";
import { mapReadableEntries, type VersionedStore, usePersistentState } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:saved-squads:v1";
/**
 * 2: an import's `importedFrom.budget` (<imported_budget>); a version-1 import gets null, so the £100m it had still applies.
 * 3: `purchasePrices` (<purchase_prices>); an earlier squad gets none, so its purchase and selling prices show "—" until it's imported again or a player is re-added.
 * 4: an import's `importedFrom.playerIds` and `importedFrom.purchasePrices` (<imported_budget>); an earlier import gets null for both, and Team Building loads them from FPL the next time it's opened.
 */
const STORAGE_VERSION = 4;

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((id): id is number => typeof id === "number" && Number.isFinite(id)) : []);
const idOrNull = (v: unknown, allowed: number[]): number | null => (typeof v === "number" && allowed.includes(v) ? v : null);

/**
 * Brings one stored squad to the current shape, repairing what it can so
 * Team Building never meets a squad it can't draw (audit 2026-10-18 M8: a
 * squad with no `playerIds` blanked the page). Player lists keep only
 * numbers; the starting XI and the armbands keep only players in the squad.
 * A squad saved before usedChips/importedFrom existed gets them defaulted
 * in, as before. Null (skipped) without an id, since nothing can select it.
 */
export function normalizeSavedSquad(raw: Record<string, unknown>): SavedSquad | null {
  if (typeof raw.id !== "string" || raw.id === "") return null;
  const playerIds = [...new Set(ids(raw.playerIds))];
  const startingXI = [...new Set(ids(raw.startingXI))].filter((id) => playerIds.includes(id));
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "Squad",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    playerIds,
    startingXI,
    captainId: idOrNull(raw.captainId, startingXI),
    viceCaptainId: idOrNull(raw.viceCaptainId, startingXI),
    purchasePrices: normalizePurchasePrices(raw.purchasePrices, playerIds),
    usedChips: Array.isArray(raw.usedChips) ? (raw.usedChips as SavedSquad["usedChips"]) : [],
    importedFrom: normalizeImportedFrom(raw.importedFrom),
  };
}

const numberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Purchase prices kept only for players in the squad, each a real positive price; none for a squad saved before they were kept (version 2 and earlier). */
function normalizePurchasePrices(raw: unknown, playerIds: number[]): Record<number, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    const price = numberOrNull(value);
    if (playerIds.includes(id) && price !== null && price > 0) out[id] = price;
  }
  return out;
}

/** An import's record, with each field checked; null without the team id it names. `budget` is null where it wasn't saved (version 1). */
function normalizeImportedFrom(raw: unknown): SavedSquad["importedFrom"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const teamId = numberOrNull(r.teamId);
  if (teamId === null) return null;
  return {
    teamId,
    teamName: typeof r.teamName === "string" ? r.teamName : "",
    managerName: typeof r.managerName === "string" ? r.managerName : "",
    asOfEvent: numberOrNull(r.asOfEvent) ?? 0,
    bank: numberOrNull(r.bank),
    budget: numberOrNull(r.budget),
    playerIds: Array.isArray(r.playerIds) ? [...new Set(ids(r.playerIds))] : null,
    purchasePrices: r.purchasePrices && typeof r.purchasePrices === "object" && Array.isArray(r.playerIds) ? normalizePurchasePrices(r.purchasePrices, ids(r.playerIds)) : null,
  };
}

const SAVED_SQUADS_STORE: VersionedStore<SavedSquad[]> = {
  version: STORAGE_VERSION,
  fallback: [],
  migrate(data) {
    if (!Array.isArray(data)) return null;
    return mapReadableEntries(data, normalizeSavedSquad);
  },
};

/** Hard cap on saved squads — purely a UI/localStorage-hygiene limit, not an FPL rule. */
export const MAX_SAVED_SQUADS = 5;

export interface UseSavedSquads {
  squads: SavedSquad[];
  upsert: (squad: SavedSquad) => void;
  /** Changes one squad as it is at that moment (a change that arrives later, like prices loaded from FPL, never overwrites edits made meanwhile); nothing if it's gone. */
  update: (id: string, mutator: (squad: SavedSquad) => SavedSquad) => void;
  remove: (id: string) => void;
}

/**
 * Squads persist to the browser's localStorage only — there is no server
 * or account behind this, matching the rest of the app's no-auth,
 * no-server-storage design. Squads are tied to this browser; they won't
 * follow the user to a different device or browser profile.
 *
 * No squad is auto-created: an empty list is a legitimate, expected
 * starting state (first visit, or every squad deleted) — Team Building
 * shows a blank pitch and prompts the user to create or import one via
 * "New Squad" rather than silently seeding a squad nobody asked for.
 */
export function useSavedSquads(): UseSavedSquads {
  const [squads, setSquads] = usePersistentState(STORAGE_KEY, SAVED_SQUADS_STORE);


  const upsert = useCallback((squad: SavedSquad) => {
    setSquads((prev) => {
      const updated: SavedSquad = { ...squad, updatedAt: Date.now() };
      const idx = prev.findIndex((s) => s.id === squad.id);
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const update = useCallback((id: string, mutator: (squad: SavedSquad) => SavedSquad) => {
    setSquads((prev) => prev.map((s) => (s.id === id ? { ...mutator(s), updatedAt: Date.now() } : s)));
  }, []);

  const remove = useCallback((id: string) => {
    setSquads((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { squads, upsert, update, remove };
}
