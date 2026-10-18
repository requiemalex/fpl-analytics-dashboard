import { useCallback, useEffect, useState } from "react";
import type { SavedSquad } from "../types/team";
import { loadVersioned, mapReadableEntries, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:saved-squads:v1";
const STORAGE_VERSION = 1;

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
    usedChips: Array.isArray(raw.usedChips) ? (raw.usedChips as SavedSquad["usedChips"]) : [],
    importedFrom: raw.importedFrom && typeof raw.importedFrom === "object" ? (raw.importedFrom as SavedSquad["importedFrom"]) : null,
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

function loadFromStorage(): SavedSquad[] {
  return loadVersioned(STORAGE_KEY, SAVED_SQUADS_STORE);
}

function saveToStorage(squads: SavedSquad[]) {
  saveVersioned(STORAGE_KEY, STORAGE_VERSION, squads);
}

/** Hard cap on saved squads — purely a UI/localStorage-hygiene limit, not an FPL rule. */
export const MAX_SAVED_SQUADS = 5;

export interface UseSavedSquads {
  squads: SavedSquad[];
  upsert: (squad: SavedSquad) => void;
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
  const [squads, setSquads] = useState<SavedSquad[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(squads);
  }, [squads]);

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

  const remove = useCallback((id: string) => {
    setSquads((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { squads, upsert, remove };
}
