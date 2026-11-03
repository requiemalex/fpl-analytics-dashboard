import type { NormalizedPlayer } from "../types/normalized";
import { DASH, fmtDate } from "../utils/format";

/**
 * <price_progress>: FPL's own Progress (`price_change_percent`) or Predicted
 * Progress (its projection for the next price update,
 * `price_change_projections[0]`), as FPL's Price Changes page reads them.
 * One reading for every place that shows it (the pitch's Price highlight,
 * the player tables' Predictive columns). Coloured by the figure itself, not
 * a rank (the owner's call, 2026-10-26): grey at 0 to full green at +100%
 * and full red at −100%, through the shared scale so the palette switch
 * turns it off with the rest. A locked or calibrating price says so instead.
 */

/** FPL's own words for its next-update projection's likelihood, as its Price Changes page shows them. */
const PROJECTION_STATUS: Record<number, string> = { 5: "very likely to rise", 4: "likely to rise", [-4]: "likely to drop", [-5]: "very likely to drop" };

/** "+51.2%", "−105.0%": FPL's progress figures, to one decimal as FPL shows them (the 100% threshold makes 99.6 and 100.0 different things). */
export function fmtProgress(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
}

export interface ProgressReading {
  /** The figure, for sorting, filtering and ranking; null when there's none (locked, calibrating, not sent). */
  value: number | null;
  text: string;
  /** Its hover: the figure explained, or why there's none. */
  title: string;
  /** Its colour on the shared 0–100 scale (50 grey at 0%); undefined with no figure. */
  tint: number | undefined;
}

export function progressReading(player: Pick<NormalizedPlayer, "priceChange">, predicted: boolean): ProgressReading {
  const pc = player.priceChange;
  const none = (text: string, title: string): ProgressReading => ({ value: null, text, title, tint: undefined });
  if (!pc) return none(DASH, "FPL hasn't sent his price change progress");
  if (pc.lockedUntil) return none("Locked", `FPL has locked his price until ${fmtDate(pc.lockedUntil)}`);
  if (pc.calibrating) return none("Calibrating", "FPL is still calibrating his price change progress");
  const next = pc.projections.find((p) => p.offsetDays === 0) ?? null;
  const status = next ? (PROJECTION_STATUS[next.likelihood] ?? "unlikely to change") : null;
  const value = predicted ? (next?.projectedPercent ?? null) : pc.percent;
  if (value === null) return none(DASH, "FPL hasn't sent a prediction for him");
  const towards = value >= 0 ? "a rise" : "a drop";
  const title = predicted
    ? `Predicted Progress ${fmtProgress(value)}: where FPL expects him to be toward ${towards} at the next price update${status ? `, ${status}` : ""}. Now ${fmtProgress(pc.percent)}.`
    : `Progress ${fmtProgress(value)}: FPL's figure for how far he is toward ${towards} (100% is the threshold)${next ? `. Predicted at the next update: ${fmtProgress(next.projectedPercent)}, ${status}` : ""}.`;
  return { value, text: fmtProgress(value), title, tint: Math.max(0, Math.min(100, 50 + value / 2)) };
}
