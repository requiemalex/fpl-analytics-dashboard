import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList } from "../metrics/resolvePlayerStats";
import { effectiveMinMinutes } from "../state/useFilteredPlayers";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { TopList, type TopListRow } from "../components/TopList";
import { TeamTopList, type TeamTopListRow } from "../components/TeamTopList";
import { fmtDate, fmtDecimal, fmtTimeAgo } from "../utils/format";
import type { NormalizedTeam } from "../types/normalized";

function topN(rows: TopListRow[], n: number, ascending = false): TopListRow[] {
  const eligible = rows.filter((r) => r.value !== null);
  eligible.sort((a, b) => ((a.value as number) < (b.value as number) ? 1 : -1));
  const sorted = ascending ? eligible.slice().reverse() : eligible;
  return sorted.slice(0, n);
}

interface TeamAggregate {
  teamId: number;
  name: string;
  shortName: string;
  points: number;
  xGI: number | null;
  cleanSheets: number;
}

function topTeamsBy(aggregates: TeamAggregate[], selector: (t: TeamAggregate) => number | null, n = 5): TeamTopListRow[] {
  return aggregates
    .map((t) => ({ teamId: t.teamId, name: t.name, shortName: t.shortName, value: selector(t) }))
    .filter((r) => r.value !== null)
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, n);
}

export function Dashboard() {
  const { players, teams, gameweekState, lastUpdated, filters, analysisMode, historicProfiles, historicStatus, currentSeasonHasStarted } = useAppState();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { resolved: resolvedPlayers, omittedCount } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  const eligible = useMemo(
    () => resolvedPlayers.filter((p) => p.minutes >= effectiveMinMinutes(filters, analysisMode)),
    [resolvedPlayers, filters, analysisMode],
  );

  const rows = useMemo(() => eligible.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) })), [eligible]);

  const topPoints = topN(
    rows.map((r) => ({ player: r.player, value: r.player.totalPoints })),
    5,
  );
  const topXGI = topN(
    rows.map((r) => ({ player: r.player, value: r.player.xGI })),
    5,
  );
  const topValue = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.pointsPerMillion })),
    5,
  );
  const topGoalsAboveXG = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.goalsMinusXG })),
    5,
  );
  const topXGAboveGoals = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.goalsMinusXG !== null ? -r.derived.goalsMinusXG : null })),
    5,
  );
  const topXGIPerMillion = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.xGIPerMillion })),
    5,
  );
  const topGAAboveXGI = topN(
    rows.map((r) => ({ player: r.player, value: r.derived.goalInvolvementsMinusXGI })),
    5,
  );

  // Team snapshot — same aggregation basis as the Teams page (every
  // resolved player attributed to their current club, not minutes-
  // filtered), so these numbers match what you'd see if you clicked
  // through to Teams rather than looking like a second, different total.
  const teamAggregates: TeamAggregate[] = useMemo(() => {
    return teams.map((team: NormalizedTeam) => {
      const squad = resolvedPlayers.filter((p) => p.teamId === team.id);
      const xGIValues = squad.map((p) => p.xGI).filter((v): v is number => v !== null);
      return {
        teamId: team.id,
        name: team.name,
        shortName: team.shortName,
        points: squad.reduce((a, p) => a + p.totalPoints, 0),
        xGI: xGIValues.length > 0 ? xGIValues.reduce((a, b) => a + b, 0) : null,
        cleanSheets: squad.reduce((a, p) => a + p.cleanSheets, 0),
      };
    });
  }, [resolvedPlayers, teams]);

  const topTeamPoints = topTeamsBy(teamAggregates, (t) => t.points);
  const topTeamXGI = topTeamsBy(teamAggregates, (t) => t.xGI);
  const topTeamCleanSheets = topTeamsBy(teamAggregates, (t) => t.cleanSheets);

  function select(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  function selectTeam(teamId: number) {
    navigate(`/teams/${teamId}`);
  }

  const gwLabel =
    gameweekState?.kind === "current"
      ? `${gameweekState.event.name} · deadline ${fmtDate(gameweekState.event.deadlineTime)}`
      : gameweekState?.kind === "last-completed"
        ? `Last completed: ${gameweekState.event.name}`
        : "Pre-season / No active gameweek";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Scouting overview — pick a season view below.</p>
        </div>
      </div>

      <AnalysisModeToggle />

      <div className="card-grid">
        <div className="card">
          <div className="card-title">Gameweek Status</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{gwLabel}</div>
        </div>
        <div className="card">
          <div className="card-title">Players Tracked</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)" }}>{resolvedPlayers.length.toLocaleString("en-GB")}</div>
          <div className="page-subtitle" style={{ margin: 0 }}>
            across {teams.length} clubs
            {analysisMode !== "live" && omittedCount > 0 && ` · ${omittedCount.toLocaleString("en-GB")} without data for this mode`}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Data Last Updated</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtTimeAgo(lastUpdated)}</div>
          <div className="page-subtitle" style={{ margin: 0 }}>
            Eligibility threshold: {analysisMode === "live" ? "none (bypassed for Current Season)" : `${filters.minMinutes} min`}
          </div>
        </div>
      </div>

      {eligible.length === 0 && analysisMode !== "live" && historicStatus === "loading" && (
        <div className="empty-state">
          <h3>Building the historic dataset…</h3>
          <p>This runs once per session and can take up to a minute — it'll be quick after that.</p>
        </div>
      )}

      <div className="stat-group-title player">Player Summary Statistics</div>
      <div className="card-grid">
        <TopList title="Top 5 — Points" rows={topPoints} format={(v) => fmtDecimal(v, 0)} onSelect={select} />
        <TopList title="Top 5 — xGI" rows={topXGI} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList title="Top 5 — Value (Points/£m)" rows={topValue} format={(v) => fmtDecimal(v, 1)} onSelect={select} />
        <TopList title="Top 5 — Goals Above xG" rows={topGoalsAboveXG} format={(v) => (v !== null ? `+${v.toFixed(2)}` : "\u2014")} onSelect={select} />
        <TopList title="Top 5 — xG Above Goals" rows={topXGAboveGoals} format={(v) => (v !== null ? `+${v.toFixed(2)}` : "\u2014")} onSelect={select} />
        <TopList title="Top 5 — xGI/£m" rows={topXGIPerMillion} format={(v) => fmtDecimal(v, 2)} onSelect={select} />
        <TopList
          title="Top 5 — Goals + Assists Above xGI"
          rows={topGAAboveXGI}
          format={(v) => (v !== null ? `+${v.toFixed(2)}` : "\u2014")}
          onSelect={select}
        />
      </div>

      <div className="stat-group-title team">Team Summary Statistics</div>
      <p className="page-subtitle" style={{ marginTop: -6, marginBottom: 8 }}>
        Same current-squad attribution as the Teams page.
      </p>
      <div className="card-grid">
        <TeamTopList title="Top 5 — Team Points" rows={topTeamPoints} format={(v) => fmtDecimal(v, 0)} onSelect={selectTeam} />
        <TeamTopList title="Top 5 — Team xGI" rows={topTeamXGI} format={(v) => fmtDecimal(v, 2)} onSelect={selectTeam} />
        <TeamTopList title="Top 5 — Team Clean Sheets" rows={topTeamCleanSheets} format={(v) => fmtDecimal(v, 0)} onSelect={selectTeam} />
      </div>
    </div>
  );
}
