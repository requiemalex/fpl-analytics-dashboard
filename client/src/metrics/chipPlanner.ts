import type { ChipWindow } from "../types/normalized";
import type { UsedChip } from "../types/team";

/**
 * Whether a squad's recorded chip usage covers this specific window — an
 * event-level record (from an FPL import) counts if it falls inside the
 * window's own gameweek range; a manually-ticked record (event: null, no
 * specific gameweek known) counts regardless, since there's no gameweek
 * to check it against. Used by Team Building's own "Chips Used" card —
 * the rest of this file's original chip-recommendation logic (the old
 * Chip Planner page) was removed when that page was removed; this one
 * function survived because Team Building still depends on it.
 */
export function isChipUsedForWindow(usedChips: UsedChip[], window: ChipWindow): boolean {
  return usedChips.some((c) => c.chip === window.chip && (c.event === null || (c.event >= window.startEvent && c.event <= window.stopEvent)));
}
