import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fmtDecimal, fmtSigned, DASH } from "../utils/format";
import { getMetricDefinition } from "../metrics/dictionary";
import { fdrColor, averageFixtureDifficulty, type UpcomingFixture } from "../metrics/fixtureTicker";
import { teamDisplayColors, teamIdentityColor } from "../utils/teamColors";
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
 * one flat colour made those hard to tell apart at a glance.
 *
 * Clicking it opens that club's team profile overlay (see
 * TeamDetailOverlay.tsx) — the same `?teamProfile=` query-param pattern
 * PlayerDetailOverlay uses for `?player=`, so it works from every page
 * this badge appears on without each page wiring its own handler.
 * stopPropagation keeps a badge click from also firing whatever the
 * enclosing row does (e.g. Teams.tsx's row click, which opens the same
 * overlay anyway).
 *
 * The badge's dominant colour (text/border/background tint) comes from
 * teamIdentityColor() — a primary/secondary blend — rather than the plain
 * primary alone. Several clubs share a near-identical primary (see
 * <red_cluster_fix> in utils/teamColors.ts), so colouring the dominant,
 * most-visible part of the badge by primary alone made those clubs read as
 * "the same colour"; the swatch stripe below stays literal primary/
 * secondary, unblended, so it still shows each club's real colours too.
 */
export function TeamBadge({ teamId, shortName }: { teamId: number; shortName: string }) {
  const { primary, secondary } = teamDisplayColors(teamId, shortName);
  const identity = teamIdentityColor(teamId, shortName);
  const [, setSearchParams] = useSearchParams();

  function openProfile(e: React.SyntheticEvent) {
    e.stopPropagation();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("teamProfile", String(teamId));
      return next;
    });
  }

  return (
    <span
      className="badge team-badge"
      style={{ color: identity, background: `color-mix(in srgb, ${identity} 12%, transparent)`, cursor: "pointer" }}
      onClick={openProfile}
      onKeyDown={(e) => {
        // A role="button" answers Enter and Space like a real button.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProfile(e);
        }
      }}
      role="button"
      tabIndex={0}
      title={`View ${shortName} team profile`}
      aria-label={`View ${shortName} team profile`}
    >
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

/** A team's upcoming fixtures as coloured FDR chips plus the average difficulty — shared by every table that offers a fixtures column (Team Building's picker, Player Explorer), so the visual reads identically wherever it appears. `avgTint` is an optional pre-computed background colour (relativeCellTint, lower-is-better) for the average-difficulty figure — comparative colouring against every other team, used by the team profile's Upcoming Fixtures card; every other caller omits it and gets the plain untinted figure unchanged. */
export function FixtureChips({ fixtures, avgTint }: { fixtures: UpcomingFixture[]; avgTint?: string }) {
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
        style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", background: avgTint, borderRadius: 3, padding: avgTint ? "1px 4px" : 0 }}
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
