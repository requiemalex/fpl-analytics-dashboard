import { useCallback, useMemo } from "react";
import { usePersistentState, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "scoutline:dashboard:hide-small-samples:v1";

/** The ids of the Dashboard tiles and graphs whose Hide button is on (<hide_small_samples>). */
const HIDDEN_STORE: VersionedStore<string[]> = {
  version: 1,
  fallback: [],
  migrate: (data) => (Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : null),
};

/**
 * Which Dashboard tiles and graphs leave out the players under the minutes
 * threshold (<hide_small_samples>). Kept by item id in its own store, so it
 * survives a reload without changing what the tile, graph and saved-view
 * stores hold.
 */
export function useHiddenSmallSamples(): { hidden: ReadonlySet<string>; toggle: (id: string) => void } {
  const [ids, setIds] = usePersistentState(STORAGE_KEY, HIDDEN_STORE);
  const hidden = useMemo(() => new Set(ids), [ids]);
  const toggle = useCallback((id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])), [setIds]);
  return { hidden, toggle };
}
