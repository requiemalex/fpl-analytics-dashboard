import { useCallback, useEffect, useState } from "react";
import { createBlankSquad, type SavedSquad } from "../types/team";

const STORAGE_KEY = "fpl-dashboard:saved-squads:v1";

function loadFromStorage(): SavedSquad[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migration safety: a squad saved before usedChips/importedFrom existed
    // won't have them in localStorage — default them in rather than let
    // downstream code (Chip Planner, the "Loaded from FPL" badge) crash on
    // an undefined array/object for anyone with squads saved from an
    // earlier version of this app.
    return (parsed as Partial<SavedSquad>[]).map((s) => ({
      ...s,
      usedChips: s.usedChips ?? [],
      importedFrom: s.importedFrom ?? null,
    })) as SavedSquad[];
  } catch {
    return [];
  }
}

function saveToStorage(squads: SavedSquad[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(squads));
  } catch {
    // localStorage can throw (private browsing, quota) — squads still work
    // for the rest of this session, they just won't persist on reload.
  }
}

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
 */
export function useSavedSquads(): UseSavedSquads {
  const [squads, setSquads] = useState<SavedSquad[]>(() => {
    const loaded = loadFromStorage();
    return loaded.length > 0 ? loaded : [createBlankSquad("My Squad 1")];
  });

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
