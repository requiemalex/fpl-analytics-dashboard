import React, { useState } from "react";
import { fmtDecimal, fmtSigned, DASH } from "../utils/format";
import { getMetricDefinition } from "../metrics/dictionary";
import { fdrColor, averageFixtureDifficulty, type UpcomingFixture } from "../metrics/fixtureTicker";
import { teamDisplayColors } from "../utils/teamColors";
import type { Position } from "../types/normalized";

export function PositionBadge({ position }: { position: Position }) {
  return <span className={`badge pos-${position}`}>{position}</span>;
}

/**
 * Same visual language as PositionBadge (flush-left flag shape, ~12%
 * tinted fill) but for a team — colours come from teamDisplayColors()
 * (that club's real primary/secondary colours where known, else a
 * generated per-id fallback for both — see utils/teamColors.ts) as inline
 * styles rather than a fixed --pos-* token, since the team list isn't a
 * small fixed set the way positions are. The two-colour swatch (primary
 * on top, secondary below) exists because several clubs share close to
 * the same primary colour (e.g. Arsenal/Forest/Brentford are all red) —
 * one flat colour made those hard to tell apart at a glance. Used only
 * where a team is a row's own primary subject (Teams, Team Detail, the
 * Dashboard's team tiles) — the small team abbreviation shown next to a
 * player's name elsewhere stays plain text, deliberately subdued relative
 * to the player.
 */
export function TeamBadge({ teamId, shortName }: { teamId: number; shortName: string }) {
  const { primary, secondary } = teamDisplayColors(teamId, shortName);
  return (
    <span className="badge team-badge" style={{ color: primary, background: `color-mix(in srgb, ${primary} 12%, transparent)` }}>
      <span className="team-badge-swatch" style={{ background: `linear-gradient(180deg, ${primary} 50%, ${secondary} 50%)` }} />
      {shortName}
    </span>
  );
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

/** A team's upcoming fixtures as coloured FDR chips plus the average difficulty — shared by every table that offers a fixtures column (Team Building's picker, Player Explorer), so the visual reads identically wherever it appears. */
export function FixtureChips({ fixtures }: { fixtures: UpcomingFixture[] }) {
  const avgFdr = averageFixtureDifficulty(fixtures);
  if (fixtures.length === 0 || avgFdr === null) return <span className="value-muted">{DASH}</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div className="table-fixtures">
        {fixtures.map((f) => (
          <span
            key={f.fixtureId}
            className="table-fixture-chip"
            style={{ background: fdrColor(f.difficulty) }}
            title={`${f.opponentShortName} (${f.isHome ? "H" : "A"}) — FDR ${f.difficulty}`}
          >
            {f.opponentShortName.slice(0, 3)}
          </span>
        ))}
      </div>
      <span
        style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        title="Average fixture difficulty across the fixtures shown (1 = easiest, 5 = hardest)"
      >
        {avgFdr.toFixed(1)}
      </span>
    </div>
  );
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
