import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { DASH, fmtDecimal, fmtPercent } from "../utils/format";
import { MinutesFloorBadge } from "../components/MinutesFloorBadge";
import type { DetailLoad, UsClubSeasonDetail, UsFormation, UsLineup } from "./profileData";
import { formationLineups, type FormationSlot, type SlotPlayer } from "./lineups";
import { POSITION_NAMES, positionGroupOf } from "./positionNames";
import { PitchMarkings } from "../components/PitchMarkings";
import { Kit } from "../components/Kit";
import { percentileTint } from "../utils/colorScale";
import { formationRank, type UsComparisonContext } from "./comparisons";
import type { UsClubTotals } from "./schema";

/**
 * The Team Profile's Formations section (owner's decision, 2026-10-21):
 * the live season only, outside the profile's Data View — a club's
 * formations now, not its past ones. The formations it used for at least a
 * match's worth of minutes, its three most-used at most, one at a time with
 * arrows between them: the shape on a pitch, who started in each slot and
 * how many times, and the formation's figures beside it, as the shot maps
 * have theirs. Its per-90 figures (and its goals, per 90 in it) are
 * coloured against every other club's per-90 figure for the whole season
 * (<comparative_colouring>): more xG and goals better, less xGA and fewer
 * conceded better. Time, minutes and starts are how much it was used, and
 * like games played aren't coloured.
 *
 * The one place a team view names players — an exception to the
 * team/player separation the owner made for it — from Understat's own
 * line-ups, match by match. A name opens that player's profile; one who
 * isn't in FPL any more (or that the app couldn't link to an FPL player)
 * is greyed out, not a link, and drops out as the season goes on.
 */

/** A formation needs a match's worth of minutes to be shown (<minutes_marker>: the section's stopwatch says so). */
export const FORMATION_MIN_MINUTES = 90;
/** Formations the arrows step through: the club's most-used. */
export const FORMATIONS_SHOWN = 3;
/** A club FPL no longer lists has no colours to wear: a plain neutral shirt. */
const NEUTRAL_KIT = { body: "var(--text-secondary)", trim: "var(--border-strong)" };
/** Names shown in a slot before the rest go into "+n more". */
const NAMES_PER_SLOT = 3;

const FLOOR_NOTE = `Minimum minutes: only formations used for ${FORMATION_MIN_MINUTES}+ minutes this season are shown (the club's ${FORMATIONS_SHOWN} most-used at most).`;

function Arrow({ left }: { left?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: left ? "rotate(180deg)" : undefined }}>
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The formations shown: used for a match's worth of minutes, most-used first, three at most. */
export function shownFormations(formations: UsFormation[]): UsFormation[] {
  return formations
    .filter((f) => f.minutes >= FORMATION_MIN_MINUTES)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, FORMATIONS_SHOWN);
}

function PlayerName({ player, idByCode }: { player: SlotPlayer; idByCode: ReadonlyMap<number, { id: number; name: string }> }) {
  const [, setSearchParams] = useSearchParams();
  const fpl = player.code === null ? undefined : idByCode.get(player.code);
  const starts = `${player.starts} start${player.starts === 1 ? "" : "s"}`;
  if (!fpl) {
    const why = `${player.name}: ${starts}. Not in FPL's player list now, so there's no profile to open.`;
    return (
      <span className="formation-player is-gone" title={why} aria-label={why}>
        <span className="formation-player-name">{player.name}</span>
        <span className="formation-player-starts num">{player.starts}</span>
      </span>
    );
  }
  const label = `${fpl.name}: ${starts}. Open his profile`;
  return (
    <button
      type="button"
      className="formation-player"
      title={label}
      aria-label={label}
      onClick={() =>
        // The team profile closes for his: it sits over the player profile, so leaving it open would hide his.
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("teamProfile");
          next.set("player", String(fpl.id));
          return next;
        })
      }
    >
      <span className="formation-player-name">{fpl.name}</span>
      <span className="formation-player-starts num">{player.starts}</span>
    </button>
  );
}

function Slot({ slot, club, idByCode }: { slot: FormationSlot; club: { id: number; shortName: string } | null; idByCode: ReadonlyMap<number, { id: number; name: string }> }) {
  const shown = slot.players.slice(0, NAMES_PER_SLOT);
  const rest = slot.players.slice(NAMES_PER_SLOT);
  const nameOf = (p: SlotPlayer) => (p.code !== null ? (idByCode.get(p.code)?.name ?? p.name) : p.name);
  const group = positionGroupOf(slot.position);
  // Team Building's pitch card: the club's kit (a goalkeeper's colours swapped), the slot's code in its FPL
  // position's colour at the shirt's top left (where Team Building's armband sits), a nameplate under it.
  return (
    <div className="formation-slot">
      <span className="formation-slot-code">
        <span className={`badge pos-${group}`} title={POSITION_NAMES[slot.position] ?? slot.position}>
          {slot.position}
        </span>
      </span>
      <Kit club={club ?? undefined} colours={club ? undefined : NEUTRAL_KIT} goalkeeper={group === "GKP"} />
      <div className="pitch-card-plate formation-slot-plate">
        {shown.map((p) => (
          <PlayerName key={p.code ?? p.name} player={p} idByCode={idByCode} />
        ))}
        {rest.length > 0 && (
          <span className="formation-slot-more" title={rest.map((p) => `${nameOf(p)} (${p.starts})`).join(", ")}>
            +{rest.length} more
          </span>
        )}
      </div>
    </div>
  );
}

/** Hover on a coloured formation figure. */
const RANK_HINT = "coloured against every club's per-90 figure for the season";

function FormationCard({ code, formations, lineups, season, compare }: { code: number; formations: UsFormation[]; lineups: UsLineup[] | null; season: string; compare: UsComparisonContext | null }) {
  const { players, teams } = useAppState();
  const [index, setIndex] = useState(0);
  const total = formations.reduce((s, f) => s + f.minutes, 0);
  const shown = useMemo(() => shownFormations(formations), [formations]);
  const team = teams.find((t) => t.code === code);
  const club = team ? { id: team.id, shortName: team.shortName } : null;
  const idByCode = useMemo(() => new Map(players.flatMap((p) => (p.code === null ? [] : [[p.code, { id: p.id, name: p.name }] as const]))), [players]);
  const at = Math.min(index, shown.length - 1);
  const f = shown[at];
  const xi = useMemo(() => (f && lineups ? formationLineups(f.formation, lineups) : null), [f, lineups]);
  if (!f) {
    return (
      <div className="card">
        <div className="card-title">
          Formations
          <MinutesFloorBadge note={FLOOR_NOTE} active={false} />
        </div>
        <p className="page-subtitle" style={{ margin: 0 }}>
          {formations.length === 0 ? "No matches played yet this season." : `No formation used for ${FORMATION_MIN_MINUTES}+ minutes yet this season.`}
        </p>
      </div>
    );
  }
  const per90 = (v: number) => (v / f.minutes) * 90;
  const share = total > 0 ? (f.minutes / total) * 100 : 0;
  const step = (by: number) => setIndex((at + by + shown.length) % shown.length);
  const prev = shown[(at - 1 + shown.length) % shown.length];
  const next = shown[(at + 1) % shown.length];
  const rank = (shown: number, value: (t: UsClubTotals) => number, higherIsBetter: boolean) => (compare ? formationRank(compare, code, season, shown, value, higherIsBetter) : null);
  const rows: { label: string; value: React.ReactNode; title?: string; rank?: number | null }[] = [
    { label: "Time", value: fmtPercent(share, 0), title: "Share of the club's minutes this season" },
    { label: "Minutes", value: fmtDecimal(f.minutes, 0) },
    { label: "Starts", value: xi ? fmtDecimal(xi.starts, 0) : lineups ? "0" : DASH, title: "Matches the club started in this formation" },
    { label: "xG/90", value: fmtDecimal(per90(f.xG), 2), title: `xG per 90 minutes in this formation, ${RANK_HINT}`, rank: rank(per90(f.xG), (t) => t.xG, true) },
    { label: "xGA/90", value: fmtDecimal(per90(f.xGA), 2), title: `xG conceded per 90 minutes in this formation, ${RANK_HINT}`, rank: rank(per90(f.xGA), (t) => t.xGA, false) },
    { label: "Scored", value: fmtDecimal(f.goals, 0), title: `Goals scored in this formation; per 90 minutes, ${RANK_HINT}`, rank: rank(per90(f.goals), (t) => t.goalsFor, true) },
    { label: "Conceded", value: fmtDecimal(f.goalsAgainst, 0), title: `Goals conceded in this formation; per 90 minutes, ${RANK_HINT}`, rank: rank(per90(f.goalsAgainst), (t) => t.goalsAgainst, false) },
  ];
  return (
    <div className="card">
      <div className="card-title formation-card-title">
        <span>
          Formation · {f.formation}
          <MinutesFloorBadge note={FLOOR_NOTE} active={false} />
        </span>
        {shown.length > 1 && (
          <span className="formation-pager">
            <button type="button" className="chip chip-icon" onClick={() => step(-1)} title={`Previous formation: ${prev.formation}`} aria-label={`Previous formation: ${prev.formation}`}>
              <Arrow left />
            </button>
            <span className="formation-pager-count num" aria-live="polite">
              {at + 1} / {shown.length}
            </span>
            <button type="button" className="chip chip-icon" onClick={() => step(1)} title={`Next formation: ${next.formation}`} aria-label={`Next formation: ${next.formation}`}>
              <Arrow />
            </button>
          </span>
        )}
      </div>
      <div className="shot-card-body is-wide">
        <div className="pitch formation-pitch" role="group" aria-label={`${f.formation}: who started where`}>
          <PitchMarkings />
          {xi ? (
            xi.lines.map((line, i) => (
              <div className="pitch-row formation-line" key={i}>
                {line.map((slot, j) => (
                  <Slot key={`${slot.position}-${j}`} slot={slot} club={club} idByCode={idByCode} />
                ))}
              </div>
            ))
          ) : (
            <p className="page-subtitle formation-pitch-empty">
              {lineups ? "The club hasn't started a match in this formation: it was used only after a change during a match." : `Line-ups aren't available yet (${DASH}).`}
            </p>
          )}
        </div>
        <div className="shot-stats">
          <div className="shot-stats-heading">{season}</div>
          <div className="shot-stats-rows">
            {rows.map((r) => (
              <div className="shot-stats-row" key={r.label} title={r.title}>
                <span className="shot-stats-label">{r.label}</span>
                <span className="shot-stats-value num" style={{ background: percentileTint(r.rank) }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The section's card for one club, loading the live season's figures itself (`request` from an effect). */
/** `compare`: what the figures are coloured against; null while it loads (nothing coloured). */
export function FormationsSection({
  code,
  season,
  load,
  request,
  compare = null,
}: {
  code: number;
  season: string;
  load: DetailLoad<UsClubSeasonDetail> | undefined;
  request: (code: number, seasons: string[]) => void;
  compare?: UsComparisonContext | null;
}) {
  useEffect(() => {
    request(code, [season]);
  }, [code, season, request]);
  const status = (text: string) => (
    <div className="card">
      <div className="card-title">Formations</div>
      <p className="page-subtitle" style={{ margin: 0 }}>
        {text}
      </p>
    </div>
  );
  if (!load || load.state === "loading") return status("Loading…");
  if (load.state === "error") return status("Couldn't load Understat's club figures.");
  if (load.state === "none") return status(`No Understat record for this season (${DASH}).`);
  if (load.detail.formations === null) return status(`Not available yet (${DASH}).`);
  // Keyed by club, so the next club opened starts on its most-used formation.
  return <FormationCard key={code} code={code} formations={load.detail.formations} lineups={load.detail.lineups} season={season} compare={compare} />;
}
