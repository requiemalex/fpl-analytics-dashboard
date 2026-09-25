import { useEffect, useRef } from "react";

type Layer = { current: () => void };

/** Every open layer (popover, picker, dialog, profile), oldest first. */
const openLayers: Layer[] = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || openLayers.length === 0) return;
  openLayers[openLayers.length - 1].current();
}

/**
 * Escape closes the most recently opened layer only — a column filter left
 * open under a player profile stays open when Escape closes the profile,
 * and a dialog under a profile isn't discarded along with it. Each layer
 * used to listen for Escape on its own, so one press closed every open
 * layer at once (audit 2026-09-25). `onEscape` is always the latest one
 * passed, so it never runs a stale copy.
 */
export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const layer = useRef(onEscape);
  layer.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const entry: Layer = { current: () => layer.current() };
    openLayers.push(entry);
    if (openLayers.length === 1) window.addEventListener("keydown", onKeyDown);
    return () => {
      const index = openLayers.indexOf(entry);
      if (index >= 0) openLayers.splice(index, 1);
      if (openLayers.length === 0) window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);
}
