import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useAppState } from "../state/AppStateContext";
import { useFilteredPlayers } from "../state/useFilteredPlayers";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList } from "../metrics/resolvePlayerStats";
import { defensiveRewardPer90 } from "../metrics/defensiveReward";
import { ARCHETYPE_THRESHOLDS } from "../metrics/archetypes";
import { buildThematicTrends } from "../metrics/thematicTrends";
import { buildMultiPlayerTrend, playerTrendDataKey } from "../metrics/careerTrends";
import { MIN_QUALIFYING_SEASON_MINUTES } from "../metrics/historicAnalysis";
import { FiltersBar } from "../components/FiltersBar";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { TopList, type TopListRow } from "../components/TopList";
import { ScatterWithReference, type ScatterPoint } from "../components/charts/ScatterWithReference";
import { PlayerSearch } from "../components/PlayerSearch";
import { PLAYER_COLUMNS, columnByKey } from "../components/playerColumns";
import { fmtDecimal, DASH } from "../utils/format";
import type { Position } from "../types/normalized";

function topN(rows: TopListRow[], n: number): TopListRow[] {
  const eligible = rows.filter((r) => r.value !== null);
  eligible.sort((a, b) => ((a.value as number) < (b.value as number) ? 1 : -1));
  return eligible.slice(0, n);
}

const POSITIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

type Band = "Budget" | "Mid-priced" | "Premium";

function bandFor(price: number): Band {
  if (price >= ARCHETYPE_THRESHOLDS.premiumPriceMin) return "Premium";
  if (price >= ARCHETYPE_THRESHOLDS.midPriceMin) return "Mid-priced";
  return "Budget";
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
  const TREND_LINE_COLORS = ["#5aa9e6", "#e6a15a", "#8bd17c", "#e0708a", "#d8b34a"];
  const [trendPlayerIds, setTrendPlayerIds] = useState<number[]>([]);
  const [trendMetric, setTrendMetric] = useState<"totalPoints" | "pointsPer90" | "xG" | "xA" | "xGI" | "minutes">("totalPoints");
  const activeTrendPlayerIds = trendPlayerIds.length > 0 ? trendPlayerIds : playersWithHistory[0] ? [playersWithHistory[0].id] : [];
  const trendPlayersById = useMemo(() => new Map(playersWithHistory.map((p) => [p.id, p])), [playersWithHistory]);

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

  const multiPlayerTrend = useMemo(
    () => buildMultiPlayerTrend(activeTrendPlayerIds, allTimeSeasonsByPlayerId, trendMetric),
    [activeTrendPlayerIds, allTimeSeasonsByPlayerId, trendMetric],
  );
  const TREND_METRIC_LABELS: Record<typeof trendMetric, string> = {
    totalPoints: "Total Points",
    pointsPer90: "Points per 90",
    xG: "xG",
    xA: "xA",
    xGI: "xGI",
    minutes: "Minutes",
  };

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

  const topXG = topN(rows.map((r) => ({ player: r.player, value: r.player.xG })), 5);
  const topXA = topN(rows.map((r) => ({ player: r.player, value: r.player.xA })), 5);
  const topXGI = topN(rows.map((r) => ({ player: r.player, value: r.player.xGI })), 5);
  const topXGIPer90 = topN(rows.map((r) => ({ player: r.player, value: r.player.xGIPer90 })), 5);
  const goalsAboveXG = topN(rows.map((r) => ({ player: r.player, value: r.derived.goalsMinusXG })), 5);
  const goalsBelowXG = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.goalsMinusXG !== null ? -r.derived.goalsMinusXG : null })),
    5,
  );
  const assistsAboveXA = topN(rows.map((r) => ({ player: r.player, value: r.derived.assistsMinusXA })), 5);
  const assistsBelowXA = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.assistsMinusXA !== null ? -r.derived.assistsMinusXA : null })),
    5,
  );

  // ---------- Value (merged in from the old Value page) ----------

  const priceVsPoints: ScatterPoint[] = useMemo(
    () =>
      filtered.filter((p) => p.totalPoints !== null).map((p) => ({ id: p.id, label: p.name, x: p.price, y: p.totalPoints as number })),
    [filtered],
  );

  const topPointsPerM = topN(rows.map((r) => ({ player: r.player, value: r.derived.pointsPerMillion })), 5);
  const topXGPerM = topN(rows.map((r) => ({ player: r.player, value: r.derived.xGPerMillion })), 5);
  const topXAPerM = topN(rows.map((r) => ({ player: r.player, value: r.derived.xAPerMillion })), 5);
  const topXGIPerM = topN(rows.map((r) => ({ player: r.player, value: r.derived.xGIPerMillion })), 5);

  const bandTable = useMemo(() => {
    const bands: Band[] = ["Budget", "Mid-priced", "Premium"];
    return POSITIONS.map((position) => {
      const cells = bands.map((band) => {
        const group = filtered.filter((p) => p.position === position && bandFor(p.price) === band);
        if (group.length === 0) return { band, avg: null, n: 0 };
        const values = group.map((p) => getPlayerDerivedMetrics(p).pointsPerMillion).filter((v): v is number => v !== null);
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
        return { band, avg, n: group.length };
      });
      return { position, cells };
    });
  }, [filtered]);

  // ---------- Build Your Own Graph ----------

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
          <p className="page-subtitle">
            Expected-stats leaderboards, price efficiency, and actual-vs-expected output — all in one place. Small samples should be read
            with caution.
          </p>
        </div>
      </div>

      <AnalysisModeToggle />

      <FiltersBar />

      <h2 className="section-heading">Expected vs Actual</h2>
      <div className="card-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            ICT Index is a composite influence/creativity/threat score, not the same unit as Goals + Assists — this shows pattern and
            correlation, not an expected-vs-actual relationship (no reference line).
          </p>
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
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            The defensive equivalent of the xG/xA charts above: x-axis is the qualifying-action rate that earns Defensive Contribution
            points (CBIT for defenders, CBIRT for midfielders/forwards — capped at 2 points per match, so this rate doesn't convert to
            points linearly); y-axis is clean-sheet points/90 plus <em>total</em> bonus/90 — bonus isn't isolated to defensive actions
            specifically, since goals, assists, clean sheets and saves feed the same Bonus Points System, so treat it as a proxy, not an
            attribution. Dot colour is Expected Goals Conceded/90 — green means a tighter expected defence, red means leakier — scaled
            against the range actually present in this view, not a fixed absolute scale. Goalkeepers are excluded; the Defensive
            Contribution mechanic doesn't apply to them.
            {analysisMode !== "live" &&
              " Defensive Contribution is only tracked from the 2024/25 season on — seasons before that are excluded from the average rather than diluting it with an untracked zero."}
          </p>
        </div>
      </div>

      <div className="card-grid">
        <TopList title="Top xG" rows={topXG} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xA" rows={topXA} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xGI" rows={topXGI} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xGI/90" rows={topXGIPer90} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Goals Above xG" rows={goalsAboveXG} format={(v) => (v !== null ? `+${v.toFixed(2)}` : "\u2014")} onSelect={select} />
        <TopList title="Goals Below xG" rows={goalsBelowXG} format={(v) => (v !== null ? `\u2212${v.toFixed(2)}` : "\u2014")} onSelect={select} />
        <TopList title="Assists Above xA" rows={assistsAboveXA} format={(v) => (v !== null ? `+${v.toFixed(2)}` : "\u2014")} onSelect={select} />
        <TopList title="Assists Below xA" rows={assistsBelowXA} format={(v) => (v !== null ? `\u2212${v.toFixed(2)}` : "\u2014")} onSelect={select} />
      </div>

      <h2 className="section-heading">Value</h2>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">Price vs Points</div>
        <ScatterWithReference data={priceVsPoints} xLabel="Price (£m)" yLabel="Points" onPointClick={select} />
      </div>

      <div className="card-grid">
        <TopList title="Top Points/£m" rows={topPointsPerM} format={(v) => fmtDecimal(v, 1)} onSelect={select} />
        <TopList title="Top xG/£m" rows={topXGPerM} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xA/£m" rows={topXAPerM} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top xGI/£m" rows={topXGIPerM} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
      </div>

      <div className="card">
        <div className="card-title">Points/£m by Position &amp; Price Band</div>
        <p className="page-subtitle">
          Bands: Budget &lt; £{ARCHETYPE_THRESHOLDS.midPriceMin}m · Mid-priced £{ARCHETYPE_THRESHOLDS.midPriceMin}m–£
          {ARCHETYPE_THRESHOLDS.midPriceMax}m · Premium ≥ £{ARCHETYPE_THRESHOLDS.premiumPriceMin}m. Thresholds are centrally configurable
          (see README).
          {analysisMode !== "live" &&
            " These are today's price bands applied to historic prices — a player's older-season price may sit in a different band than it would have at the time."}
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Position</th>
                <th>Budget</th>
                <th>Mid-priced</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {bandTable.map((row) => (
                <tr key={row.position}>
                  <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{row.position}</td>
                  {row.cells.map((c) => (
                    <td key={c.band}>{c.avg !== null ? `${fmtDecimal(c.avg, 1)} (n=${c.n})` : "\u2014"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-heading">Build Your Own Graph</h2>
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
        <p className="page-subtitle" style={{ marginTop: 8 }}>
          Pick any two metrics from Player Explorer's full list. No reference line here — an arbitrary pair of metrics usually isn't an
          expected-vs-actual relationship, so one isn't drawn unless the axes genuinely represent that (like the charts above).
        </p>
      </div>

      {analysisMode !== "live" && noDataCount > 0 && (
        <p className="page-subtitle" style={{ marginTop: 10 }}>
          {noDataCount.toLocaleString("en-GB")} player(s) have no data for this mode — still shown above, with {DASH} for the metrics this
          mode can't fill in.
        </p>
      )}

      <h2 className="section-heading">Thematic Analysis</h2>
      <div className="banner info">
        Uses full multi-season career history directly — unaffected by the Last Completed Season / Historic Average / Current Season
        toggle above, and by Team Building's own 4-season recency window. A season only counts for a player if they played at least{" "}
        {MIN_QUALIFYING_SEASON_MINUTES} minutes that season, same bar as everywhere else historic averages are computed. Price
        tier uses each season's OWN price (not today's), consistent with how price tiers work elsewhere in this app. Position uses each
        player's CURRENT position — this app has no record of historical position changes, so a position-switcher's older seasons are
        grouped under where they play now. This intentionally doesn't re-run the full percentile-based archetype system (High-upside
        Attacker, Strong Underlying Attacker, etc.) against every past season — see metrics/thematicTrends.ts for why that's a
        materially bigger undertaking than this chart.
      </div>
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
          <div className="field">
            <label htmlFor="trend-metric">Metric</label>
            <select id="trend-metric" value={trendMetric} onChange={(e) => setTrendMetric(e.target.value as typeof trendMetric)}>
              {Object.entries(TREND_METRIC_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {multiPlayerTrend.length === 0 ? (
          <div className="empty-state">
            <h3>No season history to show</h3>
            <p>Either historic data hasn't loaded yet, or the selected player(s) have no completed FPL seasons on record.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={multiPlayerTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="seasonName" stroke="var(--text-muted)" fontSize={12} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", fontSize: 12 }} />
              {activeTrendPlayerIds.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {activeTrendPlayerIds.map((id, i) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={playerTrendDataKey(id)}
                  name={trendPlayersById.get(id)?.name ?? String(id)}
                  stroke={TREND_LINE_COLORS[i % TREND_LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="page-subtitle" style={{ marginTop: 8 }}>
          Every season on record, oldest first — no minutes threshold here, unlike Thematic Analysis above: a quiet or injury-hit season
          is real data worth seeing, not noise to filter out. xG/xA/xGI show as a gap for seasons before FPL tracked expected stats, not
          as zero. Compare up to {MAX_TREND_PLAYERS} players at once.
        </p>
      </div>
    </div>
  );
}
