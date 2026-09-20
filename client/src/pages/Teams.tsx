import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { TeamBadge } from "../components/primitives";
import { useSortSpec, compareSortValues } from "../state/useSortSpec";
import { relativeCellTint } from "../utils/colorScale";
import { fmtDecimal } from "../utils/format";

interface TeamAggregate {
  teamId: number;
  name: string;
  shortName: string;
  points: number | null;
  goals: number | null;
  assists: number | null;
  xG: number | null;
  xA: number | null;
  xGI: number | null;
  cleanSheets: number | null;
}

/** Every column here is "higher is better" — team point/goal/xG/clean-sheet totals, no direction flipping needed. */
const TEAM_TABLE_COLUMNS: { key: keyof Omit<TeamAggregate, "teamId" | "name" | "shortName">; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "xG", label: "xG" },
  { key: "xA", label: "xA" },
  { key: "xGI", label: "xGI" },
  { key: "cleanSheets", label: "Clean Sheets" },
];

function getTeamSortValue(team: TeamAggregate, key: string): number | string | null {
  if (key === "name") return team.name;
  return team[key as keyof TeamAggregate] as number | null;
}

export function Teams() {
  const { players, teams, historicProfiles, currentSeasonHasStarted } = useAppState();
  const navigate = useNavigate();
  const [comparativeColouring, setComparativeColouring] = useState(true);
  // This page's own analysis-mode — deliberately not shared with any
  // other page (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const { sort, handleHeaderClick } = useSortSpec([{ key: "points", direction: "desc" }]);

  const { resolved: resolvedPlayers, noDataCount } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  const aggregates: TeamAggregate[] = useMemo(() => {
    const built = teams.map((team) => {
      const squad = resolvedPlayers.filter((p) => p.teamId === team.id);
      const sum = (values: (number | null)[]): number | null => {
        const nonNull = values.filter((v): v is number => v !== null);
        if (nonNull.length === 0) return null;
        return nonNull.reduce((a, b) => a + b, 0);
      };
      return {
        teamId: team.id,
        name: team.name,
        shortName: team.shortName,
        points: sum(squad.map((p) => p.totalPoints)),
        goals: sum(squad.map((p) => p.goals)),
        assists: sum(squad.map((p) => p.assists)),
        xG: sum(squad.map((p) => p.xG)),
        xA: sum(squad.map((p) => p.xA)),
        xGI: sum(squad.map((p) => p.xGI)),
        cleanSheets: sum(squad.map((p) => p.cleanSheets)),
      };
    });
    built.sort((a, b) => {
      for (const s of sort) {
        const cmp = compareSortValues(getTeamSortValue(a, s.key), getTeamSortValue(b, s.key), s.direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return built;
  }, [resolvedPlayers, teams, sort]);

  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of TEAM_TABLE_COLUMNS) {
      const values = aggregates.map((t) => t[c.key]).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [aggregates]);

  function teamCellTint(team: TeamAggregate, key: string): string | undefined {
    if (!comparativeColouring) return undefined;
    const range = columnRanges.get(key);
    const v = team[key as keyof TeamAggregate];
    if (!range || typeof v !== "number") return undefined;
    return relativeCellTint(v, range.min, range.max, true);
  }

  /** Jumps to Player Explorer pre-filtered to this club, so its players are immediately sortable/rankable by any column there — a discoverability shortcut into functionality that already exists, not a new ranking system of its own. Handed off via a URL query param, not shared state — Player Explorer reads `?team=` once on mount to seed its own independent filters (see PlayerExplorer.tsx), never kept in sync afterwards. */
  function goToPlayerRankings(teamId: number) {
    navigate(`/players?team=${teamId}`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Teams</h1>
        </div>
      </div>

      <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={comparativeColouring} onChange={(e) => setComparativeColouring(e.target.checked)} />
          Comparative Colouring
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", cursor: "pointer" }} onClick={(e) => handleHeaderClick("name", e.shiftKey)} title="Click to sort · Shift-click to add secondary sort">
                Team
                {sort.find((s) => s.key === "name") && (
                  <span className="sort-indicator">{sort.find((s) => s.key === "name")!.direction === "asc" ? "\u2191" : "\u2193"}</span>
                )}
              </th>
              {TEAM_TABLE_COLUMNS.map((c) => {
                const sortEntry = sort.find((s) => s.key === c.key);
                return (
                  <th key={c.key} onClick={(e) => handleHeaderClick(c.key, e.shiftKey)} title="Click to sort · Shift-click to add secondary sort">
                    {c.label}
                    {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {aggregates.map((t) => (
              <tr key={t.teamId} onClick={() => navigate(`/teams/${t.teamId}`)}>
                <td style={{ textAlign: "left", fontFamily: "var(--font-body)", fontWeight: 600 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TeamBadge teamId={t.teamId} shortName={t.shortName} />
                    {t.name}
                    <button
                      type="button"
                      className="chip"
                      style={{ fontWeight: 400, fontSize: 10.5, padding: "2px 7px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        goToPlayerRankings(t.teamId);
                      }}
                      title={`See ${t.name}'s players, sortable by any metric, in Player Explorer`}
                    >
                      Player Rankings
                    </button>
                  </span>
                </td>
                {TEAM_TABLE_COLUMNS.map((c) => (
                  <td key={c.key} style={{ backgroundColor: teamCellTint(t, c.key) }}>
                    {fmtDecimal(t[c.key], 2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="banner info" style={{ marginTop: 10 }}>
        <div>
          Current-squad aggregate — player totals are attributed to their current FPL club, not the club they were at when the points
          were scored. A player transferred mid-season (or since) contributes their full total to their new club here.
          {analysisMode !== "live" &&
            ` In this mode, "totals" means each player's ${analysisMode === "lastSeason" ? "last completed season" : "historic average"}, not the live season.`}
        </div>
        {analysisMode !== "live" && noDataCount > 0 && (
          <div style={{ marginTop: 8 }}>
            {noDataCount.toLocaleString("en-GB")} player(s) have no data for this mode — excluded from these club totals specifically (a
            missing figure would otherwise silently understate a club's sum), though they still appear everywhere players are listed
            individually.
          </div>
        )}
      </div>
    </div>
  );
}
