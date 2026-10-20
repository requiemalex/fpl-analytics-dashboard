import { useSyncExternalStore } from "react";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "scoutline:comparative-colour:v1";

/** Whether comparative colouring is on (<comparative_colour_switch>). Version 1: a boolean, on by default. */
const COMPARATIVE_COLOUR_STORE: VersionedStore<boolean> = {
  version: 1,
  fallback: true,
  migrate: (data) => (typeof data === "boolean" ? data : null),
};

/**
 * <comparative_colour_switch>: the top bar's one switch for every
 * comparative colour in the app (<comparative_colouring>). Off, the
 * painting functions (percentileTint, percentileColour in
 * utils/colorScale.ts) give no colour, so every table, tile, card, profile
 * and Understat column loses its green and red at once; the ranks behind
 * them and their hover text stay. One app-wide setting, not per page, kept
 * across restarts.
 *
 * Held outside React so the painting functions can read it wherever
 * they're called; App re-renders the whole tree when it changes, and a
 * memoized row subscribes itself (useComparativeColour).
 */
let comparativeColourOn = loadVersioned(STORAGE_KEY, COMPARATIVE_COLOUR_STORE);
const listeners = new Set<() => void>();

export function isComparativeColourOn(): boolean {
  return comparativeColourOn;
}

export function setComparativeColourOn(on: boolean): void {
  if (on === comparativeColourOn) return;
  comparativeColourOn = on;
  saveVersioned(STORAGE_KEY, COMPARATIVE_COLOUR_STORE.version, on);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The switch's state, re-rendering the caller whenever it changes. */
export function useComparativeColour(): boolean {
  return useSyncExternalStore(subscribe, isComparativeColourOn);
}
