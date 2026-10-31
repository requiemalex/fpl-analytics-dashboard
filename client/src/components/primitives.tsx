import React from "react";
import { useSearchParams } from "react-router-dom";
import { DASH, fmtDecimal } from "../utils/format";
import { fdrColor, averageFixtureDifficulty, type UpcomingFixture } from "../metrics/fixtureTicker";
import { teamDisplayColors, teamIdentityColor } from "../utils/teamColors";
import type { Position } from "../types/normalized";
import { coverageNote, type PartialSum } from "../metrics/partialTotals";
import { averageFixtureHint, fixtureHint, statHover } from "./hoverText";

/**
 * A Match Log Totals or Average cell (<partial_totals>): its text, with a
 * hover note when it's from only some of the listed matches. `source` names
 * a second data source whose figures they are.
 */
export function withCoverage(text: string, sum: PartialSum | null, source?: string): React.ReactNode {
  const note = coverageNote(sum, source);
  return note ? <span title={note}>{text}</span> : text;
}

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
/**
 * <keyboard_reachable>: what a clickable name that isn't a button needs to
 * work like one from the keyboard — a Tab stop, Enter or Space to press,
 * and a name for screen readers — as TeamBadge has. Player names used to be
 * mouse-only, so a profile couldn't be opened from the keyboard (audit
 * 2026-10-23 in-app). Stops the event, so a row or card around the name
 * doesn't act on it too.
 */
export function pressable(onPress: () => void, label: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    title: label,
    "aria-label": label,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onPress();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }
    },
  };
}

/** The page address with a club's profile open. */
export function withTeamProfile(prev: URLSearchParams, teamId: number): URLSearchParams {
  const next = new URLSearchParams(prev);
  next.set("teamProfile", String(teamId));
  return next;
}

/**
 * <team_badge_opener>: a long table's one way to open a club's profile,
 * shared by all its Team badges. A badge on its own follows the page
 * address (useSearchParams), so it redraws whenever the address changes;
 * under this, the table's hundreds of badges don't each redraw when a
 * profile opens or closes.
 */
export const TeamProfileOpener = React.createContext<((teamId: number) => void) | null>(null);

export function TeamBadge({ teamId, shortName }: { teamId: number; shortName: string }) {
  const open = React.useContext(TeamProfileOpener);
  return open ? <TeamBadgeView teamId={teamId} shortName={shortName} onOpen={open} /> : <RoutedTeamBadge teamId={teamId} shortName={shortName} />;
}

function RoutedTeamBadge({ teamId, shortName }: { teamId: number; shortName: string }) {
  const [, setSearchParams] = useSearchParams();
  return <TeamBadgeView teamId={teamId} shortName={shortName} onOpen={(id) => setSearchParams((prev) => withTeamProfile(prev, id))} />;
}

function TeamBadgeView({ teamId, shortName, onOpen }: { teamId: number; shortName: string; onOpen: (teamId: number) => void }) {
  const { primary, secondary } = teamDisplayColors(teamId, shortName);
  const identity = teamIdentityColor(teamId, shortName);

  function openProfile(e: React.SyntheticEvent) {
    e.stopPropagation();
    onOpen(teamId);
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

/** A club's badge as the table draws it, without opening anything: for a picker (the Player filter's clubs). */
export function TeamBadgeLook({ teamId, shortName }: { teamId: number; shortName: string }) {
  const { primary, secondary } = teamDisplayColors(teamId, shortName);
  const identity = teamIdentityColor(teamId, shortName);
  return (
    <span className="badge team-badge" style={{ color: identity, background: `color-mix(in srgb, ${identity} 12%, transparent)` }}>
      <span className="team-badge-swatch" style={{ background: `linear-gradient(180deg, ${primary} 50%, ${secondary} 50%)` }} />
      {shortName}
    </span>
  );
}

/** <player_filter>: FPL's status as the filter groups it — available, doubtful, or out (injured, suspended, on loan, unavailable); null for a status FPL hasn't defined. */
export function availabilityGroup(status: string): "available" | "doubtful" | "out" | null {
  if (status === "a") return "available";
  const info = AVAILABILITY_STATUS_INFO[status];
  if (!info) return null;
  return info.className === "flag-doubtful" ? "doubtful" : "out";
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
    .join(". ");
  return <span className={`availability-flag ${info.className}`} title={title} aria-label={title} />;
}

/** A team's upcoming fixtures as coloured FDR chips plus the average difficulty — shared by every table that offers a fixtures column (Team Building's picker, Player Explorer), so the visual reads identically wherever it appears. `avgTint` is an optional pre-computed background colour (relativeCellTint, lower-is-better) for the average-difficulty figure — comparative colouring against every other team, used by the team profile's Upcoming Fixtures card; every other caller omits it and gets the plain untinted figure unchanged. */
/** `avgRank`: his club's place among the clubs for the average (<stat_hover>), after what the average is. */
export function FixtureChips({ fixtures, avgTint, avgRank }: { fixtures: UpcomingFixture[]; avgTint?: string; avgRank?: string }) {
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
            title={fixtureHint(f)}
          >
            {f.opponentShortName.slice(0, 3)}
          </span>
        ))}
      </div>
      <span
        style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", background: avgTint, borderRadius: 3, padding: avgTint ? "1px 4px" : 0 }}
        title={statHover(averageFixtureHint(avgFdr, fixtures.length), avgRank)}
      >
        {fmtDecimal(avgFdr, 1)}
      </span>
    </div>
  );
}
