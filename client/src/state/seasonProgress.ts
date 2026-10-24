import { useSyncExternalStore } from "react";

/**
 * How many of the season's gameweeks FPL has finished: what Current
 * Season's fixed minutes floor grows with (metrics/fixedMinutesFloor.ts,
 * <fixed_minutes_floor>). Set from bootstrap-static's events on every
 * load; 0 before the first load and in pre-season.
 *
 * Held outside React so the floor's helpers can read it wherever they're
 * called, as comparativeColour.ts holds its switch; App re-renders the
 * whole tree when it changes.
 */
let gameweeksFinished = 0;
const listeners = new Set<() => void>();

export function finishedGameweeks(): number {
  return gameweeksFinished;
}

export function setFinishedGameweeks(count: number): void {
  if (count === gameweeksFinished) return;
  gameweeksFinished = count;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The count, re-rendering the caller whenever it changes. */
export function useFinishedGameweeks(): number {
  return useSyncExternalStore(subscribe, finishedGameweeks);
}
