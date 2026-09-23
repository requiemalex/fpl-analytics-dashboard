import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { computeTeamAggregates, clubSeasonsForMode, type TeamAggregate } from "../metrics/teamStats";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { TeamBadge } from "../components/primitives";
import { teamColumnByKey, type TeamColumn } from "../components/teamColumns";
import { useSortSpec, compareSortValues } from "../state/useSortSpec";
import { relativeCellTint } from "../utils/colorScale";

/** A league-table-style view of each club in the selected season(s) — every column a club figure (see <club_not_squad>, metrics/teamStats.ts). */
const TEAM_TABLE_COLUMN_KEYS = ["leaguePosition", "leaguePoints", "goalsFor", "goalsAgainst", "cleanSheets", "xG", "xGC", "xA", "points"];
const TEAM_TABLE_COLUMNS: TeamColumn[] = TEAM_TABLE_COLUMN_KEYS.map((k) => teamColumnByKey(k)).filter((c): c is TeamColumn => c !== undefined);

function getTeamSortValue(team: TeamAggregate, key: string): number | string | null {
  if (key === "name") return team.name;
  return teamColumnByKey(key)?.getValue(team) ?? null;
}

/** "2025/26", "2026/27", or "2022/23–2025/26" for a Historic Average window. */
function seasonLabel(seasons: string[]): string {
  if (seasons.length === 0) return "";
  if (seasons.length === 1) return seasons[0];
  return `${seasons[seasons.length - 1]}–${seasons[0]}`;
}

export function Teams() {
  const { teams, clubSeasons, historicReferenceSeason, historicStatus, currentSeasonHasStarted, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  // This page's own analysis-mode — deliberately not shared with any
  // other page (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const { sort, handleHeaderClick } = useSortSpec([{ key: "leaguePosition", direction: "asc" }]);

  const aggregates: TeamAggregate[] = useMemo(() => {
    const built = computeTeamAggregates(teams, analysisMode, { clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted });
    built.sort((a, b) => {
      for (const s of sort) {
        const cmp = compareSortValues(getTeamSortValue(a, s.key), getTeamSortValue(b, s.key), s.direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return built;
  }, [teams, analysisMode, clubSeasons, historicReferenceSeason, currentSeasonHasStarted, sort]);

  const seasons = clubSeasonsForMode(analysisMode, historicReferenceSeason);

  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of TEAM_TABLE_COLUMNS) {
      const values = aggregates.map((t) => c.getValue(t)).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [aggregates]);

  function teamCellTint(team: TeamAggregate, column: TeamColumn): string | undefined {
    const range = columnRanges.get(column.key);
    const v = column.getValue(team);
    if (!range || v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, column.higherIsBetter ?? true);
  }

  /** Jumps to Player Explorer pre-filtered to this club, so its players are immediately sortable/rankable by any column there — a discoverability shortcut into functionality that already exists, not a new ranking system of its own. Handed off via a URL query param, not shared state — Player Explorer reads `?team=` once on mount to seed its own independent filters (see PlayerExplorer.tsx), never kept in sync afterwards. */
  function goToPlayerRankings(teamId: number) {
    navigate(`/players?team=${teamId}`);
  }

  /** Opens the team profile overlay (see TeamDetailOverlay.tsx) — same `?teamProfile=` param TeamBadge itself sets on click, kept here too so clicking anywhere else on the row does the same thing. */
  function openTeamProfile(teamId: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("teamProfile", String(teamId));
      return next;
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Teams</h1>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />
        {seasons.length > 0 && <span className="value-muted" style={{ fontSize: 12.5 }}>{seasonLabel(seasons)}</span>}
      </div>

      {historicStatus === "loading" && clubSeasons.length === 0 && <p className="page-subtitle">Loading club history…</p>}

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
              <tr key={t.teamId} onClick={() => openTeamProfile(t.teamId)}>
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
                  <td key={c.key} style={{ backgroundColor: teamCellTint(t, c) }}>
                    {c.format(c.getValue(t))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
