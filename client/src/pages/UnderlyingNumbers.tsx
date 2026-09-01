import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAppState } from "../state/AppStateContext";
import { useFilteredPlayers } from "../state/useFilteredPlayers";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList } from "../metrics/resolvePlayerStats";
import { defensiveRewardPer90 } from "../metrics/defensiveReward";
import { buildThematicTrends } from "../metrics/thematicTrends";
import {
  buildMultiSeriesTrend,
  playerMetricTrendDataKey,
  type TrendMetricKey,
} from "../metrics/careerTrends";
import { FiltersBar } from "../components/FiltersBar";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { TopList, type TopListRow } from "../components/TopList";
import { ScatterWithReference, type ScatterPoint } from "../components/charts/ScatterWithReference";
import { PlayerSearch } from "../components/PlayerSearch";
import { PLAYER_COLUMNS, columnByKey } from "../components/playerColumns";
import { fmtDecimal, DASH } from "../utils/format";

function topN(rows: TopListRow[], n: number): TopListRow[] {
  const eligible = rows.filter((r) => r.value !== null);
  eligible.sort((a, b) => ((a.value as number) < (b.value as number) ? 1 : -1));
  return eligible.slice(0, n);
}

export function UnderlyingNumbers() {
  const { players, teamsById, filters, analysisMode, historicProfiles, currentSeasonHasStarted, allTimeSeasonsByPlayerId } = useAppState();
  const { resolved: resolvedPlayers, noDataCount } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );
  const filtered = useFilteredPlayers(resolvedPlayers, filters, analysisMode, teamsById, historicProfiles);
  const [, setSearchParams] = useSearchParams();

  function select(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  const rows = useMemo(() => filtered.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) })), [filtered]);

  // ---------- Thematic Analysis & Player Trends (full career history — deliberately outside the Last Completed/Historic Average/Current Season plumbing the rest of this page uses; see each section's own note) ----------

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const thematicTrends = useMemo(() => buildThematicTrends(allTimeSeasonsByPlayerId, playersById), [allTimeSeasonsByPlayerId, playersById]);

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
    pointsPer90: "Points per 90",
    goals: "Goals",
    assists: "Assists",
    xG: "xG",
    xA: "xA",
    xGI: "xGI",
    minutes: "Minutes",
  };
  const [trendPlayerIds, setTrendPlayerIds] = useState<number[]>([]);
  const [trendMetrics, setTrendMetrics] = useState<TrendMetricKey[]>(["totalPoints"]);
  const [normalizeTrend, setNormalizeTrend] = useState(false);
  const activeTrendPlayerIds = trendPlayerIds.length > 0 ? trendPlayerIds : playersWithHistory[0] ? [playersWithHistory[0].id] : [];
  const activeTrendMetrics = trendMetrics.length > 0 ? trendMetrics : (["totalPoints"] as TrendMetricKey[]);
  const trendPlayersById = useMemo(() => new Map(playersWithHistory.map((p) => [p.id, p])), [playersWithHistory]);
  const trendLineCount = activeTrendPlayerIds.length * activeTrendMetrics.length;

  function addTrendPlayer(id: number) {
    if (trendPlayerIds.length >= MAX_TREND_PLAYERS || activeTrendPlayerIds.includes(id)) return;
    setTrendPlayerIds([...activeTrendPlayerIds, id]);
  }
  function removeTrendPlayer(id: number) {
    // At least one player stays shown, matching this chart's original
    // single-player behaviour — there was never an empty state for it.
    if (activeTrendPlayerIds.length <= 1) return;
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

  // ---------- Expected vs Actual ----------

  const xgVsGoals: ScatterPoint[] = useMemo(
    () =>
      filtered
        .filter((p) => p.xG !== null && p.goals !== null)
        .map((p) => ({ id: p.id, label: p.name, x: p.xG as number, y: p.goals as number })),
    [filtered],
  );
  const xaVsAssists: ScatterPoint[] = useMemo(
    () =>
      filtered
        .filter((p) => p.xA !== null && p.assists !== null)
        .map((p) => ({ id: p.id, label: p.name, x: p.xA as number, y: p.assists as number })),
    [filtered],
  );

  // xGI and Goals+Assists are the same underlying concept (expected vs
  // actual goal involvements), so a 45° reference line is meaningful here
  // exactly as it is for the xG/xA charts above.
  const xgiVsGA: ScatterPoint[] = useMemo(
    () =>
      filtered
        .filter((p) => p.xGI !== null && p.goals !== null && p.assists !== null)
        .map((p) => ({ id: p.id, label: p.name, x: p.xGI as number, y: (p.goals as number) + (p.assists as number) })),
    [filtered],
  );

  // ICT Index is a composite influence/creativity/threat score on its own
  // scale — NOT the same unit as Goals+Assists, so this chart shows
  // correlation/pattern only. No reference line: a 45° "expected output"
  // line would be meaningless when the axes aren't commensurate.
  const ictVsGA: ScatterPoint[] = useMemo(
    () =>
      filtered
        .filter((p) => p.ictIndex !== null && p.goals !== null && p.assists !== null)
        .map((p) => ({ id: p.id, label: p.name, x: p.ictIndex as number, y: (p.goals as number) + (p.assists as number) })),
    [filtered],
  );

  // Defensive "expected vs actual", the equivalent of the xG/Goals charts
  // for defensive output. X = defensive contribution rate (the input:
  // qualifying CBIT/CBIRT actions/90). Y = clean-sheet points/90 +
  // bonus/90 (the actual reward, see metrics/defensiveReward.ts for the
  // caveats). Dot colour = xGC/90 (green = low/tight defence, red =
  // high/leaky defence) as a third, deliberately-not-merged dimension —
  // see the card's own caption below. Goalkeepers are excluded: the
  // DefCon mechanic doesn't apply to them.
  const defensiveReward: ScatterPoint[] = useMemo(() => {
    const points: ScatterPoint[] = [];
    for (const p of filtered) {
      if (p.position === "GKP") continue;
      if (p.defensiveContributionsPer90 === null) continue;
      const y = defensiveRewardPer90(p);
      if (y === null) continue;
      points.push({ id: p.id, label: p.name, x: p.defensiveContributionsPer90, y, z: p.xGCPer90 ?? undefined });
    }
    return points;
  }, [filtered]);

  // Bundled into one memo, keyed on `rows`, so these leaderboards aren't
  // rebuilt (each a filter+sort+slice over the full row list) on every
  // unrelated render. xGI, Goals Above xG, and Goals Below xG are
  // deliberately NOT duplicated here — they're already on the Dashboard
  // (Top 5 — xGI / Goals Above xG / xG Above Goals), and repeating the
  // same leaderboard in two places just to see it again isn't the point
  // of this page.
  const { topXG, topXA, topXGIPer90, assistsAboveXA, assistsBelowXA } = useMemo(
    () => ({
      topXG: topN(rows.map((r) => ({ player: r.player, value: r.player.xG })), 5),
      topXA: topN(rows.map((r) => ({ player: r.player, value: r.player.xA })), 5),
      topXGIPer90: topN(rows.map((r) => ({ player: r.player, value: r.player.xGIPer90 })), 5),
      assistsAboveXA: topN(rows.map((r) => ({ player: r.player, value: r.derived.assistsMinusXA })), 5),
      assistsBelowXA: topN(
        rows.map((r) => ({ player: r.player, value: r.derived.assistsMinusXA !== null ? -r.derived.assistsMinusXA : null })),
        5,
      ),
    }),
    [rows],
  );

  // ---------- Value (merged in from the old Value page) ----------

  const priceVsPoints: ScatterPoint[] = useMemo(
    () =>
      filtered.filter((p) => p.totalPoints !== null).map((p) => ({ id: p.id, label: p.name, x: p.price, y: p.totalPoints as number })),
    [filtered],
  );

  // Points/£m and xGI/£m are already on the Dashboard (Top 5 — Value and
  // Top 5 — xGI/£m) — same reasoning as above, not repeated here.
  const { topXGPerM, topXAPerM } = useMemo(
    () => ({
      topXGPerM: topN(rows.map((r) => ({ player: r.player, value: r.derived.xGPerMillion })), 5),
      topXAPerM: topN(rows.map((r) => ({ player: r.player, value: r.derived.xAPerMillion })), 5),
    }),
    [rows],
  );

  // ---------- User Analysis ----------

  const [xMetricKey, setXMetricKey] = useState("xGI");
  const [yMetricKey, setYMetricKey] = useState("totalPoints");
  const xColumn = columnByKey(xMetricKey)!;
  const yColumn = columnByKey(yMetricKey)!;

  const customGraphData: ScatterPoint[] = useMemo(() => {
    const points: ScatterPoint[] = [];
    for (const p of filtered) {
      const derived = getPlayerDerivedMetrics(p);
      const x = xColumn.getValue(p, derived);
      const y = yColumn.getValue(p, derived);
      if (x === null || y === null) continue;
      points.push({ id: p.id, label: p.name, x, y });
    }
    return points;
  }, [filtered, xColumn, yColumn]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Underlying Numbers</h1>
        </div>
      </div>

      <AnalysisModeToggle />

      <FiltersBar />

      <h2 className="section-heading">Expected vs Actual</h2>
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
        <div className="card">
          <div className="card-title">xG vs Goals (dashed line = expected output)</div>
          <ScatterWithReference data={xgVsGoals} xLabel="xG" yLabel="Goals" showReferenceLine onPointClick={select} />
        </div>
        <div className="card">
          <div className="card-title">xA vs Assists (dashed line = expected output)</div>
          <ScatterWithReference data={xaVsAssists} xLabel="xA" yLabel="Assists" showReferenceLine onPointClick={select} />
        </div>
        <div className="card">
          <div className="card-title">xGI vs Goals + Assists (dashed line = expected output)</div>
          <ScatterWithReference data={xgiVsGA} xLabel="xGI" yLabel="Goals + Assists" showReferenceLine onPointClick={select} />
        </div>
        <div className="card">
          <div className="card-title">ICT Index vs Goals + Assists</div>
          <ScatterWithReference data={ictVsGA} xLabel="ICT Index" yLabel="Goals + Assists" onPointClick={select} />
        </div>
        <div className="card">
          <div className="card-title">Defensive Contribution/90 vs Defensive Reward/90</div>
          <ScatterWithReference
            data={defensiveReward}
            xLabel="Def. Contribution/90"
            yLabel="CS Points/90 + Bonus/90"
            zLabel="xGC/90"
            colorScale={{
              lowColor: [63, 191, 127],
              highColor: [224, 101, 74],
              lowLabel: "Low xGC/90 (tight)",
              highLabel: "High xGC/90 (leaky)",
            }}
            onPointClick={select}
          />
        </div>
      </div>

      <div className="card-grid">
        <TopList title="Top xG" rows={topXG} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xA" rows={topXA} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xGI/90" rows={topXGIPer90} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Assists Above xA" rows={assistsAboveXA} format={(v) => (v !== null ? `+${v.toFixed(2)}` : DASH)} onSelect={select} />
        <TopList title="Assists Below xA" rows={assistsBelowXA} format={(v) => (v !== null ? `−${v.toFixed(2)}` : DASH)} onSelect={select} />
      </div>

      <h2 className="section-heading">Value</h2>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">Price vs Points</div>
        <ScatterWithReference
          data={priceVsPoints}
          xLabel="Price (£m)"
          yLabel="Points"
          onPointClick={select}
          xTickStep={0.5}
          xTickFormatter={(v) => v.toFixed(1)}
        />
      </div>

      <div className="card-grid">
        <TopList title="Top xG/£m" rows={topXGPerM} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xA/£m" rows={topXAPerM} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
      </div>

      <h2 className="section-heading">User Analysis</h2>
      <div className="card">
        <div className="filters-bar" style={{ marginBottom: 12 }}>
          <div className="field">
            <label htmlFor="custom-x">X axis</label>
            <select id="custom-x" value={xMetricKey} onChange={(e) => setXMetricKey(e.target.value)}>
              {PLAYER_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="custom-y">Y axis</label>
            <select id="custom-y" value={yMetricKey} onChange={(e) => setYMetricKey(e.target.value)}>
              {PLAYER_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ScatterWithReference data={customGraphData} xLabel={xColumn.label} yLabel={yColumn.label} onPointClick={select} />
      </div>

      {analysisMode !== "live" && noDataCount > 0 && (
        <p className="page-subtitle" style={{ marginTop: 10 }}>
          {noDataCount.toLocaleString("en-GB")} player(s) have no data for this mode — still shown above, with {DASH} for the metrics this
          mode can't fill in.
        </p>
      )}

      <h2 className="section-heading">Thematic Analysis</h2>
      <div className="card-grid">
        <div className="card">
          <div className="card-title">Average Points by Position</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={thematicTrends.byPosition}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="seasonName" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="avgPointsByPosition.GKP" name="GKP" stroke="#8aa4c4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="avgPointsByPosition.DEF" name="DEF" stroke="#5aa9e6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="avgPointsByPosition.MID" name="MID" stroke="#8bd17c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="avgPointsByPosition.FWD" name="FWD" stroke="#e6a15a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">Average Points by Price Tier</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={thematicTrends.byPriceTier}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="seasonName" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="avgPointsByTier.Budget" name="Budget" stroke="#8bd17c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="avgPointsByTier.Mid-priced" name="Mid-priced" stroke="#d8b34a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="avgPointsByTier.Premium" name="Premium" stroke="#e0708a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

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
                  disabled={activeTrendPlayerIds.length <= 1}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                  title={activeTrendPlayerIds.length <= 1 ? "At least one player stays shown" : "Remove"}
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

        {multiSeriesTrend.length === 0 ? (
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
