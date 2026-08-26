import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStats, resolvePlayerStatsList, hasDataForMode } from "../metrics/resolvePlayerStats";
import { computeRadarData } from "../metrics/radarStats";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { PlayerRadarChart } from "../components/PlayerRadarChart";
import { PlayerSearch } from "../components/PlayerSearch";
import { PositionBadge, AvailabilityFlag, availabilityTextClass } from "../components/primitives";
import { PLAYER_COLUMNS, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { relativeCellTextColor } from "../utils/colorScale";
import { DASH } from "../utils/format";
import type { NormalizedPlayer } from "../types/normalized";

const MAX_COMPARE = 5;
const COLUMN_GROUP_ORDER: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

interface WinTally {
  counts: Map<number, number>;
  comparableMetrics: number;
}

/**
 * For each column with at least 2 non-null values among the compared
 * players, whoever has the "best" value (respecting that column's own
 * direction) gets a point — a universal tie on a metric awards nobody a
 * point for it. This is a plain count of metrics led, not a weighted
 * judgement: it treats Points and Starts as equally significant, which
 * they obviously aren't — stated directly in the summary caption rather
 * than hidden behind a single confident-looking number.
 */
function computeWinTally(comparedPlayers: NormalizedPlayer[], columns: PlayerColumn[], derivedById: Map<number, PlayerDerivedMetrics>): WinTally {
  const counts = new Map<number, number>(comparedPlayers.map((p) => [p.id, 0]));
  let comparableMetrics = 0;
  for (const col of columns) {
    const entries = comparedPlayers
      .map((p) => ({ id: p.id, v: col.getValue(p, derivedById.get(p.id)!) }))
      .filter((e): e is { id: number; v: number } => e.v !== null);
    if (entries.length < 2) continue;
    comparableMetrics++;
    const higherIsBetter = col.higherIsBetter !== false;
    const best = higherIsBetter ? Math.max(...entries.map((e) => e.v)) : Math.min(...entries.map((e) => e.v));
    const winners = entries.filter((e) => e.v === best);
    if (winners.length === entries.length) continue; // everyone tied on this metric — not a real "win"
    for (const w of winners) counts.set(w.id, (counts.get(w.id) ?? 0) + 1);
  }
  return { counts, comparableMetrics };
}

function ComparisonSummary({ comparedPlayers, derivedById }: { comparedPlayers: NormalizedPlayer[]; derivedById: Map<number, PlayerDerivedMetrics> }) {
  const overall = useMemo(() => computeWinTally(comparedPlayers, PLAYER_COLUMNS, derivedById), [comparedPlayers, derivedById]);
  const actualOutputColumns = useMemo(() => PLAYER_COLUMNS.filter((c) => c.group === "ACTUAL OUTPUT"), []);
  const actualOutput = useMemo(
    () => computeWinTally(comparedPlayers, actualOutputColumns, derivedById),
    [comparedPlayers, actualOutputColumns, derivedById],
  );

  const maxOverall = Math.max(0, ...Array.from(overall.counts.values()));
  const overallLeaders = comparedPlayers.filter((p) => overall.counts.get(p.id) === maxOverall && maxOverall > 0);

  const maxOutput = Math.max(0, ...Array.from(actualOutput.counts.values()));
  const outputLeaders = comparedPlayers.filter((p) => actualOutput.counts.get(p.id) === maxOutput && maxOutput > 0);

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-title">Summary</div>
      {overallLeaders.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          No player here leads on more metrics than the others — too close to call from this table alone.
        </p>
      ) : (
        <p className="page-subtitle" style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--text-primary)" }}>{joinNames(overallLeaders.map((p) => p.name))}</strong>
          {overallLeaders.length > 1 ? " are tied for" : " rates"} best overall, leading on {maxOverall} of {overall.comparableMetrics}{" "}
          comparable metrics.
          {outputLeaders.length > 0 &&
            ` Looking only at actual output (points, goals, assists, clean sheets, bonus), ${joinNames(outputLeaders.map((p) => p.name))} ${
              outputLeaders.length > 1 ? "lead" : "leads"
            } there${outputLeaders.length === overallLeaders.length && outputLeaders.every((p) => overallLeaders.includes(p)) ? " too" : ""}.`}
        </p>
      )}
    </div>
  );
}

function useComparisonIds(): [number[], (ids: number[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("players");
  const ids = raw
    ? raw
        .split(",")
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    : [];

  const setIds = (newIds: number[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newIds.length === 0) next.delete("players");
      else next.set("players", newIds.join(","));
      return next;
    });
  };

  return [ids, setIds];
}

export function PlayerComparison() {
  const { players, filters, analysisMode, historicProfiles, currentSeasonHasStarted } = useAppState();
  const [ids, setIds] = useComparisonIds();
  const [, setSearchParams] = useSearchParams();

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // The whole population, resolved the same way as every other page —
  // radar percentiles need to be computed against everyone, never just
  // the up-to-5 players actually being compared here
  // (<percentile_population>).
  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  const comparisonResults = useMemo(
    () =>
      ids
        .map((id) => playersById.get(id))
        .filter((p): p is NormalizedPlayer => !!p)
        .map((live) => ({ live, resolved: resolvePlayerStats(live, analysisMode, historicProfiles.get(live.id), currentSeasonHasStarted) })),
    [ids, playersById, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // Every selected player stays in the comparison — even one with nothing
  // to show for the current mode is still a column, just with "—" for the
  // fields this mode can't fill in, rather than vanishing from a
  // comparison the user explicitly built.
  const comparedPlayers = comparisonResults.map((r) => r.resolved);
  const noDataNames = comparisonResults.filter((r) => !hasDataForMode(r.resolved)).map((r) => r.live.name);
  const derivedById = useMemo(() => new Map(comparedPlayers.map((p) => [p.id, getPlayerDerivedMetrics(p)])), [comparedPlayers]);
  const minMinutesThreshold = effectiveMinMinutes(filters, analysisMode);

  function addPlayer(id: number) {
    if (ids.length >= MAX_COMPARE || ids.includes(id)) return;
    setIds([...ids, id]);
  }
  function removePlayer(id: number) {
    setIds(ids.filter((x) => x !== id));
  }
  function viewProfile(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Player Comparison</h1>
        </div>
      </div>

      <AnalysisModeToggle />

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">
          Players ({comparisonResults.length}/{MAX_COMPARE})
        </div>
        {comparisonResults.length > 0 && (
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {comparisonResults.map(({ live }) => (
              <span key={live.id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  onClick={() => viewProfile(live.id)}
                  title="View profile"
                >
                  <PositionBadge position={live.position} />
                  {live.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePlayer(live.id);
                  }}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <PlayerSearch excludeIds={ids} onPick={addPlayer} disabled={ids.length >= MAX_COMPARE} />
        {noDataNames.length > 0 && (
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            {noDataNames.join(", ")} {noDataNames.length === 1 ? "has" : "have"} no data in this mode — still shown below, with{" "}
            {DASH} for the fields this mode can't fill in.
          </p>
        )}
      </div>

      {comparedPlayers.length < 2 ? (
        <div className="empty-state">
          <h3>Add at least 2 players to compare</h3>
          <p>Search above to add players — up to {MAX_COMPARE} at once.</p>
        </div>
      ) : (
        <>
          <ComparisonSummary comparedPlayers={comparedPlayers} derivedById={derivedById} />
          <div className="card">
            <div className="card-title">Comparison</div>
            {new Set(comparedPlayers.map((p) => p.position)).size > 1 && (
              <div className="banner info">Comparing players across different positions — identical values don't imply identical value to a squad.</div>
            )}
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Metric</th>
                    {comparedPlayers.map((p) => (
                      <th key={p.id}>
                        <span
                          className={availabilityTextClass(p.status)}
                          onClick={() => viewProfile(p.id)}
                          style={{ cursor: "pointer" }}
                          title="View profile"
                        >
                          {p.name}
                        </span>
                        <AvailabilityFlag status={p.status} news={p.news} chanceOfPlayingNextRound={p.chanceOfPlayingNextRound} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COLUMN_GROUP_ORDER.map((group) => (
                    <React.Fragment key={group}>
                      <tr>
                        <td
                          colSpan={comparedPlayers.length + 1}
                          style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, paddingTop: 12 }}
                        >
                          {group}
                        </td>
                      </tr>
                      {PLAYER_COLUMNS.filter((c) => c.group === group).map((col) => {
                        const higherIsBetter = col.higherIsBetter !== false;
                        const values = comparedPlayers.map((p) => col.getValue(p, derivedById.get(p.id)!));
                        const nonNull = values.filter((v): v is number => v !== null);
                        const min = nonNull.length > 0 ? Math.min(...nonNull) : 0;
                        const max = nonNull.length > 0 ? Math.max(...nonNull) : 0;
                        const canColor = nonNull.length >= 2;
                        const bestValue = higherIsBetter ? max : min;
                        return (
                          <tr key={col.key}>
                            <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{col.label}</td>
                            {values.map((v, i) => (
                              <td
                                key={comparedPlayers[i].id}
                                style={{
                                  color: v !== null && canColor ? relativeCellTextColor(v, min, max, higherIsBetter) : undefined,
                                  fontWeight: v !== null && canColor && v === bestValue && max !== min ? 700 : undefined,
                                }}
                              >
                                {col.format(v)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginTop: 22 }}>
            <div className="card-title">Percentile Radar Comparison</div>
            <div className="card-grid">
              {comparedPlayers.map((p) => {
                const isSmallSample = analysisMode !== "live" && (p.minutes === null || p.minutes < filters.minMinutes);
                const radarData = computeRadarData(p, resolvedPlayers, minMinutesThreshold);
                return (
                  <div className="card" key={p.id}>
                    <div className="card-title">
                      <span className={availabilityTextClass(p.status)}>{p.name}</span>
                      <AvailabilityFlag status={p.status} news={p.news} chanceOfPlayingNextRound={p.chanceOfPlayingNextRound} />
                      <span className="page-subtitle" style={{ marginLeft: 6 }}>
                        <PositionBadge position={p.position} />
                        {isSmallSample && " (below eligibility threshold)"}
                      </span>
                    </div>
                    <PlayerRadarChart data={isSmallSample ? radarData.map((d) => ({ ...d, percentile: null })) : radarData} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
