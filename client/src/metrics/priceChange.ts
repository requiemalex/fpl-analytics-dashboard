import type { NormalizedPlayer } from "../types/normalized";

export type PriceDirection = "rising" | "falling" | "stable";

/**
 * FPL's own price_change_percent, bucketed into a display direction and a
 * confidence label. Thresholds below are NOT FPL's real trigger threshold
 * (that isn't published — the underlying mechanism is proprietary and
 * ownership-relative). They're purely a display convenience for grouping
 * FPL's own percentage into "how close", using the same >100%-crosses-
 * threshold anchor FPL itself has published, scaled down for the earlier
 * bands. See README for the source of this interpretation.
 */
export interface PriceChangeSignal {
  direction: PriceDirection;
  /** "high" once FPL's own figure has already crossed its own 100% threshold for today. */
  confidence: "high" | "medium" | "low" | "none";
  /** FPL's live current-moment percentage (not the projection). */
  percent: number;
  /** FPL's own projection for today's close, if available — usually a more complete picture than the live mid-day percent. */
  projectedToday: number | null;
}

export function classifyPriceChangeSignal(player: NormalizedPlayer): PriceChangeSignal | null {
  const pc = player.priceChange;
  if (pc === null) return null;

  const projectedToday = pc.projections.find((p) => p.offsetDays === 0)?.projectedPercent ?? null;
  // Prefer the projection for classification when it exists — it's FPL's
  // own forward-looking figure for today's actual deadline, which is a
  // more decision-relevant number than the live mid-day snapshot.
  const reference = projectedToday ?? pc.percent;
  const magnitude = Math.abs(reference);
  const direction: PriceDirection = reference > 0.5 ? "rising" : reference < -0.5 ? "falling" : "stable";

  let confidence: PriceChangeSignal["confidence"];
  if (direction === "stable") confidence = "none";
  else if (magnitude >= 100) confidence = "high";
  else if (magnitude >= 60) confidence = "medium";
  else if (magnitude >= 25) confidence = "low";
  else confidence = "none";

  return { direction, confidence, percent: pc.percent, projectedToday };
}

/** Approximate current owner count from ownership% × total registered managers — null if either input is missing. Used only for the supporting "transfer momentum" view, not for the official percentage above. */
export function estimatedOwnerCount(player: NormalizedPlayer, totalPlayers: number | null): number | null {
  if (player.ownership === null || totalPlayers === null) return null;
  return Math.round((player.ownership / 100) * totalPlayers);
}

/**
 * Net transfers this event as a share of the player's estimated current
 * owner base — a normalised "momentum" figure so a low-ownership player
 * moving a few thousand transfers isn't dwarfed on a raw-count view by a
 * highly-owned player moving tens of thousands. Purely a supporting/
 * explanatory figure alongside FPL's own official percent above — not a
 * competing prediction.
 */
export function netTransferRatio(player: NormalizedPlayer, totalPlayers: number | null): number | null {
  if (player.transfersInEvent === null || player.transfersOutEvent === null) return null;
  const owned = estimatedOwnerCount(player, totalPlayers);
  if (owned === null || owned <= 0) return null;
  return (player.transfersInEvent - player.transfersOutEvent) / owned;
}

export function netTransfersEvent(player: NormalizedPlayer): number | null {
  if (player.transfersInEvent === null || player.transfersOutEvent === null) return null;
  return player.transfersInEvent - player.transfersOutEvent;
}
