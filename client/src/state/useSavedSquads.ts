import { useCallback, useEffect, useState } from "react";
import type { SavedSquad } from "../types/team";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:saved-squads:v1";
const STORAGE_VERSION = 1;

const SAVED_SQUADS_STORE: VersionedStore<SavedSquad[]> = {
  version: STORAGE_VERSION,
  fallback: [],
  migrate(data) {
    if (!Array.isArray(data)) return null;
    // Migration safety: a squad saved before usedChips/importedFrom existed
    // won't have them in localStorage — default them in rather than let
    // downstream code (Chip Planner, the "Loaded from FPL" badge) crash on
    // an undefined array/object for anyone with squads saved from an
    // earlier version of this app.
    return (data as Partial<SavedSquad>[]).map((s) => ({
      ...s,
      usedChips: s.usedChips ?? [],
      importedFrom: s.importedFrom ?? null,
    })) as SavedSquad[];
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
