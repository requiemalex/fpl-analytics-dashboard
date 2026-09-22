import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStats, resolvePlayerStatsList, hasDataForMode, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { computeRadarData } from "../metrics/radarStats";
import { buildMultiSeriesTrend, playerMetricTrendDataKey, type TrendMetricKey } from "../metrics/careerTrends";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { PercentileRadarChart } from "../components/PlayerRadarChart";
import { PlayerSearch } from "../components/PlayerSearch";
import { PositionBadge, AvailabilityFlag, availabilityTextClass } from "../components/primitives";
import { PLAYER_COLUMNS, isStaticColumn, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
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
  const { players, historicProfiles, currentSeasonHasStarted, allTimeSeasonsByPlayerId, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const [ids, setIds] = useComparisonIds();
  const [, setSearchParams] = useSearchParams();
  // This page's own analysis-mode — deliberately not shared with any
  // other page (see state/scoutingFilters.ts). No Min Minutes control of
  // its own, so `filters` below is a fixed, never-mutated default —
  // purely to satisfy effectiveMinMinutes' signature, not a hidden knob.
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const filters = DEFAULT_FILTERS;

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

  // Each computeRadarData call is 6 full-population percentile scans — was
  // previously recomputed inline inside the render-time .map() below, i.e.
  // on every render (up to MAX_COMPARE times each) rather than only when a
  // compared player, the population, or the threshold actually changes.
  const radarDataByPlayerId = useMemo(
    () => new Map(comparedPlayers.map((p) => [p.id, computeRadarData(p, resolvedPlayers, minMinutesThreshold)])),
    [comparedPlayers, resolvedPlayers, minMinutesThreshold],
  );

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

  // ---------- Player Trends (moved here from Underlying Numbers — full
  // career history, deliberately independent of the comparison above:
  // its own player selection, own player cap, own search box. Uses
  // allTimeSeasonsByPlayerId directly rather than the resolved/live
  // players this page's own comparison works from, since a multi-season
  // trend can't be expressed through a single analysis-mode toggle. ----------

  const playersWithHistory = useMemo(
    () => players.filter((p) => (allTimeSeasonsByPlayerId.get(p.id)?.length ?? 0) > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [players, allTimeSeasonsByPlayerId],
  );
  const MAX_TREND_PLAYERS = 5;
  const MAX_TREND_METRICS = 3;
  const TREND_LINE_COLORS = ["#5aa9e6", "#e6a15a", "#8bd17c", "#e0708a", "#d8b34a"];
  /** One dash pattern per metric slot — solid for the first metric selected, then increasingly broken. Combined with colour-per-player below, a line's identity (which player, which metric) is fully readable from its style alone, not just the legend. */
  const TREND_METRIC_DASH_PATTERNS = ["0", "6 4", "2 3"];
  const TREND_METRIC_LABELS: Record<TrendMetricKey, string> = {
    totalPoints: "Total Points",
    goals: "Goals",
    assists: "Assists",
    xG: "xG",
    xA: "xA",
    xGI: "xGI",
    minutes: "Minutes",
  };
  const [trendPlayerIds, setTrendPlayerIds] = useState<number[]>([]);
  const [trendMetrics, setTrendMetrics] = useState<TrendMetricKey[]>(["totalPoints"]);
  const [normalizeTrend, setNormalizeTrend] = useState(true);
  // No default player — starts empty, unlike the metric selection below
  // (which always needs at least one, since a chart with zero metrics has
  // nothing to plot). Add a player explicitly via the search below.
  const activeTrendPlayerIds = trendPlayerIds;
  const activeTrendMetrics = trendMetrics.length > 0 ? trendMetrics : (["totalPoints"] as TrendMetricKey[]);
  const trendPlayersById = useMemo(() => new Map(playersWithHistory.map((p) => [p.id, p])), [playersWithHistory]);
  const trendLineCount = activeTrendPlayerIds.length * activeTrendMetrics.length;

  function addTrendPlayer(id: number) {
    if (trendPlayerIds.length >= MAX_TREND_PLAYERS || activeTrendPlayerIds.includes(id)) return;
    setTrendPlayerIds([...activeTrendPlayerIds, id]);
  }
  function removeTrendPlayer(id: number) {
    setTrendPlayerIds(activeTrendPlayerIds.filter((x) => x !== id));
  }
  function toggleTrendMetric(metric: TrendMetricKey) {
    setTrendMetrics((prev) => {
      if (prev.includes(metric)) {
        // At least one metric stays selected, same reasoning as removeTrendPlayer.
        if (prev.length <= 1) return prev;
        return prev.filter((m) => m !== metric);
      }
      if (prev.length >= MAX_TREND_METRICS) return prev;
      return [...prev, metric];
    });
  }

  const multiSeriesTrend = useMemo(
    () => buildMultiSeriesTrend(activeTrendPlayerIds, activeTrendMetrics, allTimeSeasonsByPlayerId, normalizeTrend),
    [activeTrendPlayerIds, activeTrendMetrics, allTimeSeasonsByPlayerId, normalizeTrend],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Player Comparison</h1>
        </div>
      </div>

      <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

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
                            <td
                              className={isStaticColumn(col) ? "col-static" : undefined}
                              style={{ textAlign: "left", fontFamily: "var(--font-body)" }}
                              title={isStaticColumn(col) ? "Always today's live figure, regardless of the toggle above" : undefined}
                            >
                              {col.label}
                            </td>
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
                const radarData = radarDataByPlayerId.get(p.id) ?? [];
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
                    <PercentileRadarChart data={isSmallSample ? radarData.map((d) => ({ ...d, percentile: null })) : radarData} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <h2 className="section-heading">Player Trends</h2>
      <div className="card">
        <div className="card-title">
          Players ({activeTrendPlayerIds.length}/{MAX_TREND_PLAYERS})
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {activeTrendPlayerIds.map((id) => {
            const p = trendPlayersById.get(id);
            if (!p) return null;
            return (
              <span key={id} className="chip" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {p.name}
                <button
                  type="button"
                  onClick={() => removeTrendPlayer(id)}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <div className="filters-bar" style={{ marginBottom: 12 }}>
          <PlayerSearch
            excludeIds={activeTrendPlayerIds}
            onPick={addTrendPlayer}
            disabled={activeTrendPlayerIds.length >= MAX_TREND_PLAYERS}
            candidates={playersWithHistory}
            label="Add a player to compare"
          />
        </div>

        <div className="card-title" style={{ marginTop: 4 }}>
          Metrics ({activeTrendMetrics.length}/{MAX_TREND_METRICS})
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {(Object.keys(TREND_METRIC_LABELS) as TrendMetricKey[]).map((metric) => (
            <button
              key={metric}
              type="button"
              className={`chip${activeTrendMetrics.includes(metric) ? " active" : ""}`}
              onClick={() => toggleTrendMetric(metric)}
              disabled={!activeTrendMetrics.includes(metric) && activeTrendMetrics.length >= MAX_TREND_METRICS}
              title={activeTrendMetrics.length <= 1 && activeTrendMetrics.includes(metric) ? "At least one metric stays selected" : undefined}
            >
              {TREND_METRIC_LABELS[metric]}
            </button>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)", marginLeft: 8 }}>
            <input type="checkbox" checked={normalizeTrend} onChange={(e) => setNormalizeTrend(e.target.checked)} />
            Normalise (0–100)
          </label>
        </div>
        {activeTrendMetrics.length > 1 && (
          <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
            Comparing metrics on different scales (e.g. Minutes against xG) reads as flat lines near zero unless Normalise is on — each
            metric is then independently scaled to 0–100 across the values shown, so shape and timing are comparable even though the
            numbers are no longer the real stat.
          </p>
        )}

        {activeTrendPlayerIds.length === 0 ? (
          <div className="empty-state">
            <h3>No players selected</h3>
            <p>Search for a player above to add them to the chart.</p>
          </div>
        ) : multiSeriesTrend.length === 0 ? (
          <div className="empty-state">
            <h3>No season history to show</h3>
            <p>Either historic data hasn't loaded yet, or the selected player(s) have no completed FPL seasons on record.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={multiSeriesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="seasonName" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} domain={normalizeTrend ? [0, 100] : ["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", fontSize: 12 }} />
              {trendLineCount > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {activeTrendPlayerIds.map((id, pi) =>
                activeTrendMetrics.map((metric, mi) => (
                  <Line
                    key={playerMetricTrendDataKey(id, metric)}
                    type="monotone"
                    dataKey={playerMetricTrendDataKey(id, metric)}
                    name={
                      activeTrendPlayerIds.length > 1 && activeTrendMetrics.length > 1
                        ? `${trendPlayersById.get(id)?.name ?? id} — ${TREND_METRIC_LABELS[metric]}`
                        : activeTrendMetrics.length > 1
                          ? TREND_METRIC_LABELS[metric]
                          : (trendPlayersById.get(id)?.name ?? String(id))
                    }
                    stroke={TREND_LINE_COLORS[pi % TREND_LINE_COLORS.length]}
                    strokeDasharray={TREND_METRIC_DASH_PATTERNS[mi % TREND_METRIC_DASH_PATTERNS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )),
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
