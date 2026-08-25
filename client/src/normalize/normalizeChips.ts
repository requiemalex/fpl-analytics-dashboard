import type { RawChip } from "../types/raw";
import type { ChipWindow } from "../types/normalized";

const KNOWN_CHIPS: ChipWindow["chip"][] = ["wildcard", "freehit", "bboost", "3xc"];

/**
 * Maps bootstrap-static's top-level "chips" array (confirmed live for
 * 2026/27 — see raw.ts RawChip) into one ChipWindow per chip type per half.
 * "number": 1 always means "the first use of this chip type"; combined
 * with two entries per chip name (an earlier start_event/stop_event pair
 * and a later one), that's how the first vs second half is told apart —
 * by actual position in the season, not by assuming which one comes first
 * in the array. Unknown chip names are skipped rather than guessed at.
 */
export function normalizeChips(rawChips: RawChip[]): ChipWindow[] {
  const byName = new Map<string, RawChip[]>();
  for (const c of rawChips) {
    if (!KNOWN_CHIPS.includes(c.name as ChipWindow["chip"])) continue;
    const list = byName.get(c.name) ?? [];
    list.push(c);
    byName.set(c.name, list);
  }

  const windows: ChipWindow[] = [];
  for (const [name, entries] of byName) {
    const sorted = [...entries].sort((a, b) => a.start_event - b.start_event);
    sorted.forEach((c, idx) => {
      windows.push({
        chip: name as ChipWindow["chip"],
        half: idx === 0 ? 1 : 2,
        startEvent: c.start_event,
        stopEvent: c.stop_event,
      });
    });
  }
  return windows;
}
