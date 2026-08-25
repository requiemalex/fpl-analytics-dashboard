import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useSavedSquads } from "../state/useSavedSquads";
import { SQUAD_RULES } from "../types/team";
import {
  buildSquadGameweekProfiles,
  firstPlannableGw,
  recommendBenchBoost,
  recommendFreeHit,
  recommendTripleCaptain,
  recommendWildcard,
  isChipUsedForWindow,
  type ChipRecommendation,
  type SquadGameweekProfile,
} from "../metrics/chipPlanner";
import { fdrColor } from "../metrics/fixtureTicker";
import { PositionBadge, AvailabilityFlag, availabilityTextClass } from "../components/primitives";
import { fmtDate, DASH } from "../utils/format";
import type { ChipWindow, NormalizedPlayer } from "../types/normalized";

const CHIP_LABELS: Record<ChipWindow["chip"], string> = {
  bboost: "Bench Boost",
  freehit: "Free Hit",
  "3xc": "Triple Captain",
  wildcard: "Wildcard",
};

const CHIP_SHORT: Record<ChipWindow["chip"], string> = {
  bboost: "BB",
  freehit: "FH",
  "3xc": "TC",
  wildcard: "WC",
};

const CHIP_ORDER: ChipWindow["chip"][] = ["bboost", "3xc", "freehit", "wildcard"];

function RecommendationCard({ rec, window }: { rec: ChipRecommendation; window: ChipWindow }) {
  const alreadyUsed = rec.reason.startsWith("Already used");
  return (
    <div className="card">
      <div className="card-title">
        {CHIP_LABELS[rec.chip]} · GW{window.startEvent}{"\u2013"}{window.stopEvent}
      </div>
      {rec.gw !== null ? (
        <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", fontWeight: 700, marginBottom: 4 }}>Gameweek {rec.gw}</div>
      ) : (
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: alreadyUsed ? "var(--accent-positive)" : "var(--text-muted)" }}>
          {alreadyUsed ? "\u2713 Already used" : "No clear window yet"}
        </div>
      )}
      <p className="page-subtitle" style={{ margin: 0 }}>
        {rec.reason}
      </p>
    </div>
  );
}

export function ChipPlanner() {
  const { players, fixtures, teamsById, events, chips } = useAppState();
  const { squads } = useSavedSquads();
  const [, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(squads[0]?.id ?? null);

  useEffect(() => {
    if (!squads.some((s) => s.id === activeId)) setActiveId(squads[0]?.id ?? null);
  }, [squads, activeId]);

  const active = squads.find((s) => s.id === activeId) ?? null;
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const squadPlayers: NormalizedPlayer[] = useMemo(
    () => (active ? active.playerIds.map((id) => playersById.get(id)).filter((p): p is NormalizedPlayer => p !== undefined) : []),
    [active, playersById],
  );

  const fromGw = useMemo(() => firstPlannableGw(events), [events]);
  const toGw = useMemo(() => (events.length > 0 ? events[events.length - 1].id : fromGw), [events, fromGw]);

  const profiles: SquadGameweekProfile[] = useMemo(
    () => (squadPlayers.length > 0 && events.length > 0 ? buildSquadGameweekProfiles(squadPlayers, fixtures, teamsById, events, fromGw, toGw) : []),
    [squadPlayers, fixtures, teamsById, events, fromGw, toGw],
  );

  const windowsByHalf: Record<1 | 2, ChipWindow[]> = useMemo(() => {
    const grouped: Record<1 | 2, ChipWindow[]> = { 1: [], 2: [] };
    for (const chip of CHIP_ORDER) {
      for (const w of chips.filter((c) => c.chip === chip)) grouped[w.half].push(w);
    }
    return grouped;
  }, [chips]);

  function recommendationFor(window: ChipWindow): ChipRecommendation {
    if (active && isChipUsedForWindow(active.usedChips, window)) {
      return { chip: window.chip, half: window.half, window, gw: null, reason: "Already used this half, per this squad's Chips Used record in Team Building." };
    }
    if (window.chip === "bboost") return recommendBenchBoost(profiles, window, fromGw);
    if (window.chip === "freehit") return recommendFreeHit(profiles, window, fromGw);
    if (window.chip === "3xc") return recommendTripleCaptain(profiles, squadPlayers, window, fromGw);
    return recommendWildcard(profiles, window, fromGw);
  }

  const recommendationsByHalf: Record<1 | 2, ChipRecommendation[]> = useMemo(
    () => ({
      1: windowsByHalf[1].map(recommendationFor),
      2: windowsByHalf[2].map(recommendationFor),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowsByHalf, profiles, squadPlayers, fromGw, active],
  );

  /** gw -> short labels of chips recommended there, for highlighting the ticker. */
  const highlightedGws = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const half of [1, 2] as const) {
      for (const rec of recommendationsByHalf[half]) {
        if (rec.gw === null) continue;
        const list = map.get(rec.gw) ?? [];
        list.push(CHIP_SHORT[rec.chip]);
        map.set(rec.gw, list);
      }
    }
    return map;
  }, [recommendationsByHalf]);

  function selectPlayer(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  // The squad picker below needs to render even when the CURRENTLY selected
  // squad has no players — otherwise a user whose default squad is empty
  // (e.g. they built/imported a real squad as a second entry) can never
  // reach the control that would let them switch to it. Only the
  // recommendations/ticker content below is gated on having players.
  const hasSquadToShow = !!active && squadPlayers.length > 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Chip Planner</h1>
          <p className="page-subtitle">
            {hasSquadToShow ? (
              <>
                {active!.name}'s fixtures through to Gameweek {toGw}, with suggested windows for Bench Boost, Free Hit, Triple Captain, and
                Wildcard — one of each still available per half of the season.
              </>
            ) : (
              "Plots your saved squad's fixtures to the end of the season and suggests when to play each chip."
            )}
          </p>
        </div>
      </div>

      {active && (
        <div className="filters-bar">
          <div className="field">
            <label htmlFor="cp-squad">Squad</label>
            <select id="cp-squad" value={active.id} onChange={(e) => setActiveId(e.target.value)}>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.playerIds.length}/{SQUAD_RULES.squadSize})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!hasSquadToShow ? (
        <div className="empty-state">
          <h3>No squad to plan around yet</h3>
          <p>Build a squad in Team Building first, then come back here — or pick a different saved squad above if you already have one.</p>
        </div>
      ) : (
        <>
      {squadPlayers.length < SQUAD_RULES.squadSize && (
        <div className="banner stale">
          "{active.name}" has {squadPlayers.length} of {SQUAD_RULES.squadSize} players — recommendations below (especially Bench Boost,
          which cares about all 15) will be based on an incomplete squad until you fill it out in Team Building.
        </div>
      )}

      {chips.length === 0 && (
        <div className="banner stale">
          This build's live API response didn't carry FPL's chip-availability schedule — showing the fixture ticker only, without
          per-half recommendations.
        </div>
      )}

      <div className="banner info">
        <strong>How these recommendations work:</strong> Bench Boost and Triple Captain look for the gameweek(s) where your squad's total
        (or your best player's) fixture-difficulty-adjusted points projection peaks — today's Exp. Pts baseline scaled by each fixture's
        FDR, summed across doubles. Free Hit looks for your squad's biggest blank. Wildcard is the loosest of the four by nature — it's
        about players you don't yet own, so it can only flag when your <em>current</em> squad's fixture run turns hard, not recommend a
        rebuild target. <strong>Squad clashes</strong> — gameweeks where two of your own players are on opposite sides of the same match,
        marked with a {"\u2694"} in the ticker below — are factored into Bench Boost's ranking as a modest haircut, since a striker
        scoring past your own goalkeeper or defender is the literal mechanism by which one side's points disappear; Triple Captain's own
        ranking is unaffected (it doesn't change the captained player's own output) but flags a clash in its reasoning when relevant.
        None of this accounts for price changes, injuries, transfers, or form between now and a gameweek that might be months away —
        treat it as a fixture-based planning aid, not a forecast.
      </div>

      {([1, 2] as const).map((half) =>
        windowsByHalf[half].length > 0 ? (
          <React.Fragment key={half}>
            <div className="section-heading">
              {half === 1 ? "First Half" : "Second Half"} (GW{Math.min(...windowsByHalf[half].map((w) => w.startEvent))}
              {"\u2013"}
              {Math.max(...windowsByHalf[half].map((w) => w.stopEvent))})
            </div>
            <div className="card-grid">
              {windowsByHalf[half].map((w, i) => (
                <RecommendationCard key={`${w.chip}-${half}`} rec={recommendationsByHalf[half][i]} window={w} />
              ))}
            </div>
          </React.Fragment>
        ) : null,
      )}

      <div className="section-heading">Season Fixture Ticker</div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        Column headers marked BB / TC / FH / WC show this page's own suggested gameweek for that chip. A stacked cell is a double
        gameweek; a dash is a blank; a {"\u2694"} marks a fixture where two of your own squad players face each other.
      </p>
      <div className="table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              <th className="sticky-col" style={{ textAlign: "left" }}>
                Player
              </th>
              {profiles.map((p) => (
                <th key={p.gw} title={p.deadline ? `Deadline: ${fmtDate(p.deadline)}` : undefined}>
                  GW{p.gw}
                  {highlightedGws.has(p.gw) && (
                    <div style={{ fontSize: 9, color: "var(--accent-value)", fontWeight: 700 }}>{highlightedGws.get(p.gw)!.join(" \u00b7 ")}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {squadPlayers.map((player) => (
              <tr key={player.id} onClick={() => selectPlayer(player.id)}>
                <td className="sticky-col" style={{ textAlign: "left" }}>
                  <div className="player-name-cell">
                    <span className={`name ${availabilityTextClass(player.status)}`}>
                      {player.name}
                      <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
                    </span>
                    <span className="meta">
                      <PositionBadge position={player.position} /> {player.teamShortName}
                    </span>
                  </div>
                </td>
                {profiles.map((p) => {
                  const entry = p.players.get(player.id);
                  const cellFixtures = entry?.fixtures ?? [];
                  const highlighted = highlightedGws.has(p.gw);
                  const clash = p.clashes.find((c) => c.teamAPlayers.some((pl) => pl.id === player.id) || c.teamBPlayers.some((pl) => pl.id === player.id));
                  const clashOpponents = clash
                    ? (clash.teamAPlayers.some((pl) => pl.id === player.id) ? clash.teamBPlayers : clash.teamAPlayers).map((pl) => pl.name)
                    : [];
                  return (
                    <td key={p.gw} style={{ background: highlighted ? "rgba(216, 179, 74, 0.08)" : undefined, padding: "4px 6px" }}>
                      {cellFixtures.length === 0 ? (
                        <span className="value-muted">{DASH}</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                          {cellFixtures.map((f) => {
                            const isClashFixture = clash?.fixtureId === f.fixtureId;
                            return (
                              <span
                                key={f.fixtureId}
                                className="table-fixture-chip"
                                style={{
                                  background: fdrColor(f.difficulty),
                                  minWidth: 42,
                                  outline: isClashFixture ? "2px solid var(--accent-negative)" : undefined,
                                  outlineOffset: isClashFixture ? -1 : undefined,
                                }}
                                title={
                                  isClashFixture
                                    ? `${f.opponentShortName} (${f.isHome ? "H" : "A"}) \u2014 FDR ${f.difficulty} \u2014 also in your squad this match: ${clashOpponents.join(", ")}`
                                    : `${f.opponentShortName} (${f.isHome ? "H" : "A"}) \u2014 FDR ${f.difficulty}`
                                }
                              >
                                {f.opponentShortName.slice(0, 3)}
                                <span style={{ fontSize: 8, opacity: 0.8, marginLeft: 1 }}>({f.isHome ? "H" : "A"})</span>
                                {isClashFixture && (
                                  <span style={{ marginLeft: 2, fontSize: 9 }} title="Squad clash — one of your own players is on the opposing side">
                                    {"\u2694"}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}
