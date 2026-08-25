import React, { useState } from "react";
import { fmtDecimal, fmtSigned, DASH } from "../utils/format";
import { bandForPercentile, type PercentileBand } from "../metrics/percentiles";
import { getMetricDefinition } from "../metrics/dictionary";
import { ARCHETYPE_SHORT_LABELS, type ArchetypeLabel } from "../metrics/archetypes";
import type { Position } from "../types/normalized";

export function PositionBadge({ position }: { position: Position }) {
  return <span className={`badge pos-${position}`}>{position}</span>;
}

const AVAILABILITY_STATUS_INFO: Record<string, { label: string; className: string } | undefined> = {
  d: { label: "Doubtful", className: "flag-doubtful" },
  i: { label: "Injured", className: "flag-unavailable" },
  s: { label: "Suspended", className: "flag-unavailable" },
  n: { label: "Not available (on loan elsewhere)", className: "flag-unavailable" },
  u: { label: "Unavailable", className: "flag-unavailable" },
};

/**
 * A small coloured dot next to a player's name, matching the spirit of
 * FPL's own injury/doubt flags — status "a" (available) with no chance-
 * of-playing doubt renders nothing, so this stays invisible for the vast
 * majority of players and only draws the eye where there's a real flag.
 */
/**
 * The class to apply to a player's NAME text so it matches their
 * availability marker's colour exactly — same CSS variable underneath,
 * not just a visually-similar shade. Empty string for available players
 * (no marker, no colour change).
 */
export function availabilityTextClass(status: string): string {
  const info = AVAILABILITY_STATUS_INFO[status];
  if (!info) return "";
  return info.className === "flag-doubtful" ? "name-doubtful" : "name-unavailable";
}

export function AvailabilityFlag({
  status,
  news,
  chanceOfPlayingNextRound,
}: {
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
}) {
  const info = AVAILABILITY_STATUS_INFO[status];
  if (!info) return null;
  const title = [info.label, chanceOfPlayingNextRound !== null ? `${chanceOfPlayingNextRound}% chance of playing next round` : null, news || null]
    .filter(Boolean)
    .join(" — ");
  return <span className={`availability-flag ${info.className}`} title={title} aria-label={title} />;
}

/** Renders a number, or "—" when null — never NaN/Infinity/undefined. */
export function Num({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  return <span className="num">{fmtDecimal(value, decimals)}</span>;
}

/** Renders a +/- signed number colour-coded green (above) / red (below). */
export function SignedNum({ value, decimals = 2 }: { value: number | null | undefined; decimals?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="num value-muted">{DASH}</span>;
  }
  const cls = value > 0 ? "value-positive" : value < 0 ? "value-negative" : "value-muted";
  return <span className={`num ${cls}`}>{fmtSigned(value, decimals)}</span>;
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tooltip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} tabIndex={0}>
      {label}
      {open && <span className="tooltip-bubble">{children}</span>}
    </span>
  );
}

/** Metric-name label with a hover tooltip sourced from the central metric dictionary. */
export function MetricLabel({ metricKey, fallback }: { metricKey: string; fallback: string }) {
  const def = getMetricDefinition(metricKey);
  if (!def) return <>{fallback}</>;
  return (
    <Tooltip label={fallback}>
      <strong>{def.displayName}</strong>
      <br />
      Source: {def.source}
      {def.formula ? (
        <>
          <br />
          {def.formula}
        </>
      ) : null}
      {def.caveats ? (
        <>
          <br />
          <em>{def.caveats}</em>
        </>
      ) : null}
    </Tooltip>
  );
}

export function PercentileBar({ percentile }: { percentile: number | null }) {
  if (percentile === null) {
    return <span className="value-muted">{DASH}</span>;
  }
  const band: PercentileBand = bandForPercentile(percentile);
  return (
    <span className="percentile-row">
      <span className="percentile-track">
        <span className={`percentile-fill ${band}`} style={{ width: `${Math.max(4, percentile)}%` }} />
      </span>
      <span className="percentile-label">{Math.round(percentile)}th</span>
    </span>
  );
}

export function ArchetypeBadges({ labels, compact = false }: { labels: string[]; compact?: boolean }) {
  if (labels.length === 0) return <span className="value-muted">{DASH}</span>;
  return (
    <span className="chip-row" style={compact ? { gap: 3 } : undefined}>
      {labels.map((l) => (
        <span key={l} className={`badge archetype${compact ? " compact" : ""}`} title={compact ? l : undefined}>
          {compact ? (ARCHETYPE_SHORT_LABELS[l as ArchetypeLabel] ?? l.slice(0, 3)) : l}
        </span>
      ))}
    </span>
  );
}
