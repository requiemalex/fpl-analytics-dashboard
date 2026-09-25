import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { computeTeamAggregates, clubSeasonsForMode, type TeamAggregate } from "../metrics/teamStats";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { TeamBadge } from "../components/primitives";
import { TEAM_COLUMNS, teamColumnByKey, type TeamColumn, type TeamColumnGroup } from "../components/teamColumns";
import { ColumnFilterControl } from "../components/ColumnFilterControl";
import { IconChipButton, ResetIcon, ColumnsIcon, FilterIcon, DownloadIcon } from "../components/IconToolbar";
import { useColumnCustomization } from "../state/useColumnCustomization";
import { useColumnFilters, isColumnFilterActive } from "../state/useColumnFilters";
import { useSortSpec, compareSortValues, sortWithoutHiddenColumn, type SortSpec } from "../state/useSortSpec";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { relativeCellTint } from "../utils/colorScale";
import { downloadCsv } from "../utils/csvExport";
import { matchesTeamSearch } from "../utils/playerSearch";

/** A league-table-style view of each club in the selected season(s) — every column a club figure (see <club_not_squad>, metrics/teamStats.ts). */
const GROUPS: TeamColumnGroup[] = ["RESULTS", "OUTPUT", "UNDERLYING PERFORMANCE"];
/** The league table this page has always opened on. Every other TEAM_COLUMNS metric (the Dashboard's full team catalogue) is in the Columns picker, off by default. */
const TEAM_EXPLORER_DEFAULT_VISIBLE_COLUMNS = ["leaguePosition", "leaguePoints", "goalsFor", "goalsAgainst", "cleanSheets", "xG", "xGC", "xA", "points"];
const TEAM_EXPLORER_DEFAULT_SORT: SortSpec[] = [{ key: "leaguePosition", direction: "asc" }];

/**
 * Team headers are longer than Player Explorer's ("Goals Against", "Def.
 * Contributions") and wrap between words when their column is narrow, so a
 * column's floor is its longest word — uppercase 11px letter-spaced text,
 * about 8px a character — plus the header's padding (10px left, 26px right
 * for the filter icon) and the sort arrow, which can't wrap away from it.
 */
const TEAM_MIN_COLUMN_WIDTHS: Record<string, number> = Object.fromEntries(
  TEAM_COLUMNS.map((c) => [c.key, 36 + 14 + 8 * Math.max(...c.label.split(/\s+/).map((w) => w.length))]),
);

/** Space between the Team column's widest content and the divider. */
const TEAM_COLUMN_GAP = 14;

function getTeamValue(team: TeamAggregate, key: string): number | string | null {
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
  // This page's own analysis mode, search and column filters — deliberately
  // not shared with any other page (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const [search, setSearch] = useState("");
  const columnFiltersState = useColumnFilters();
  const { sort, setSort, handleHeaderClick } = useSortSpec(TEAM_EXPLORER_DEFAULT_SORT);

  const [showColumnPopover, setShowColumnPopover] = useState(false);
  const {
    visibleColumns,
    columnWidths,
    dragOverKey,
    setDragOverKey,
    resizingKey,
    toggleColumn,
    resetColumns,
    reorderColumn,
    startResize,
    fitToBox,
  } = useColumnCustomization(TEAM_EXPLORER_DEFAULT_VISIBLE_COLUMNS, TEAM_MIN_COLUMN_WIDTHS, () => handleFitToBox());
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyColRef = useRef<HTMLTableCellElement>(null);

  // A filter or sort on a column the user hides goes with it — either would
  // otherwise keep shaping the table with nothing on screen to say why.
  function handleToggleColumn(key: string) {
    if (visibleColumns.includes(key)) {
      columnFiltersState.clearFilter(key);
      setSort((prev) => sortWithoutHiddenColumn(prev, key, TEAM_EXPLORER_DEFAULT_SORT));
    }
    toggleColumn(key);
  }

  // The Columns picker closes on Escape or a click anywhere outside it.
  useEscapeLayer(showColumnPopover, () => setShowColumnPopover(false));
  useEffect(() => {
    if (!showColumnPopover) return;
    function onMouseDown(e: MouseEvent) {
      if (!columnPickerRef.current?.contains(e.target as Node)) setShowColumnPopover(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showColumnPopover]);

  const aggregates: TeamAggregate[] = useMemo(
    () => computeTeamAggregates(teams, analysisMode, { clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted }),
    [teams, analysisMode, clubSeasons, historicReferenceSeason, currentSeasonHasStarted],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim();
    return aggregates.filter(
      (t) =>
        (!query || matchesTeamSearch(t, query)) &&
        columnFiltersState.passesAllFilters(
          (key) => getTeamValue(t, key),
          (key) => teamColumnByKey(key)?.decimals,
        ),
    );
  }, [aggregates, search, columnFiltersState.columnFilters]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      for (const s of sort) {
        const cmp = compareSortValues(getTeamValue(a, s.key), getTeamValue(b, s.key), s.direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return arr;
  }, [filteredRows, sort]);

  const columnsInOrder = useMemo(
    () => visibleColumns.map((key) => teamColumnByKey(key)).filter((c): c is TeamColumn => c !== undefined),
    [visibleColumns],
  );

  // Per-column min/max across the teams currently shown — "how does this
  // compare to what you're looking at", same scoping as Player Explorer.
  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of columnsInOrder) {
      const values = filteredRows.map((t) => c.getValue(t)).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [columnsInOrder, filteredRows]);

  function teamCellTint(team: TeamAggregate, column: TeamColumn): string | undefined {
    const range = columnRanges.get(column.key);
    const v = column.getValue(team);
    if (!range || v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, column.higherIsBetter ?? true);
  }

  /** Measures the sticky Team column, then shares what's left among the metric columns — so the Team column sits at its own width, not stretched by the table's leftover space. */
  function handleFitToBox() {
    fitOnce();
    // Measure again once the new widths have laid out (see PlayerExplorer's handleFitToBox).
    requestAnimationFrame(() => requestAnimationFrame(fitOnce));
  }
  function fitOnce() {
    const container = tableWrapRef.current;
    const stickyCol = stickyColRef.current;
    if (!container || !stickyCol) return;
    fitToBox(container.clientWidth - stickyCol.getBoundingClientRect().width - 4);
  }

  // Re-fit on first load, when the table empties or fills again (the Team
  // column follows the names in it), when a column is shown or hidden, and
  // on window resize — keyed on the column count so a drag-reorder keeps
  // any hand-set widths (same reasoning as Player Explorer).
  useEffect(() => {
    handleFitToBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows.length > 0, visibleColumns.length]);

  useEffect(() => {
    function onResize() {
      handleFitToBox();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seasons = clubSeasonsForMode(analysisMode, historicReferenceSeason);

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

  // Exactly what's on screen — same rows, same columns in the same order,
  // same formatted values (— for unavailable).
  function handleExportCsv() {
    const headers = ["Team", ...columnsInOrder.map((c) => c.label)];
    const rows = sortedRows.map((t) => [t.name, ...columnsInOrder.map((c) => c.format(c.getValue(t)))]);
    downloadCsv(`team-explorer-${analysisMode}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  const nameSort = sort.find((s) => s.key === "name");

  return (
    <div className="page-fill">
      <div className="page-header">
        <div>
          <h1>Team Explorer</h1>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />
        {seasons.length > 0 && <span className="value-muted" style={{ fontSize: 12.5 }}>{seasonLabel(seasons)}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div className="icon-toolbar">
          <IconChipButton
            icon={<ResetIcon />}
            label="Restore the default columns, order, and natural widths, and clear every filter"
            onClick={() => {
              resetColumns();
              setSearch("");
              columnFiltersState.resetAllFilters();
            }}
          />
          <div style={{ position: "relative" }} ref={columnPickerRef}>
            <IconChipButton
              icon={<ColumnsIcon />}
              label={`Columns (${visibleColumns.length} shown)`}
              badge={visibleColumns.length}
              onClick={() => setShowColumnPopover((v) => !v)}
            />
            {showColumnPopover && (
              <div className="popover" style={{ left: 0, right: "auto" }}>
                {GROUPS.map((group) => (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>
                      {group}
                    </div>
                    {TEAM_COLUMNS.filter((c) => c.group === group).map((c) => (
                      <label key={c.key}>
                        <input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => handleToggleColumn(c.key)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <IconChipButton
            icon={<FilterIcon />}
            label="Clear every filter — the search box and every column filter"
            onClick={() => {
              setSearch("");
              columnFiltersState.resetAllFilters();
            }}
          />
          <IconChipButton icon={<DownloadIcon />} label="Export the visible columns and current rows to a CSV file" onClick={handleExportCsv} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="text" placeholder="Team name…" aria-label="Search teams" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {historicStatus === "loading" && clubSeasons.length === 0 && <p className="page-subtitle">Loading club history…</p>}

      <div className="page-fill-body">
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="data-table resizable-columns wrap-headers">
            <thead>
              <tr>
                <th
                  className="sticky-col"
                  ref={stickyColRef}
                  onClick={(e) => handleHeaderClick("name", e.shiftKey)}
                  title="Click to sort · Shift-click to add secondary sort"
                  // 1px means "as narrow as its content": without it the column takes a share of the table's spare width on the first layout, and fitOnce then measures (and keeps) that inflated width.
                  style={{ width: 1, paddingRight: TEAM_COLUMN_GAP }}
                >
                  Team
                  {nameSort && <span className="sort-indicator">{nameSort.direction === "asc" ? "↑" : "↓"}</span>}
                </th>
                {columnsInOrder.map((c, idx) => {
                  const sortEntry = sort.find((s) => s.key === c.key);
                  const width = columnWidths[c.key];
                  return (
                    <th
                      key={c.key}
                      draggable
                      className={idx === 0 ? "column-group-divider" : undefined}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.key)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverKey !== c.key) setDragOverKey(c.key);
                      }}
                      onDragLeave={() => setDragOverKey((k) => (k === c.key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverKey(null);
                        const draggedKey = e.dataTransfer.getData("text/plain");
                        if (draggedKey && draggedKey !== c.key) reorderColumn(draggedKey, c.key);
                      }}
                      onClick={(e) => handleHeaderClick(c.key, e.shiftKey)}
                      title="Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                      style={{
                        position: "relative",
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        cursor: "grab",
                        outline: dragOverKey === c.key ? "2px dashed var(--accent-focus)" : undefined,
                        outlineOffset: dragOverKey === c.key ? -2 : undefined,
                      }}
                    >
                      {c.label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "↑" : "↓"}</span>}
                      <ColumnFilterControl
                        isOpen={columnFiltersState.openFilterKey === c.key}
                        isActive={isColumnFilterActive(columnFiltersState.columnFilters[c.key])}
                        filterDraft={columnFiltersState.filterDraft}
                        onOpen={() => columnFiltersState.openFilter(c.key)}
                        onCancel={columnFiltersState.cancelFilter}
                        onConfirm={columnFiltersState.confirmFilter}
                        onDraftChange={columnFiltersState.setFilterDraft}
                      />
                      <span
                        className={`column-resize-handle${resizingKey === c.key ? " resizing" : ""}`}
                        draggable={false}
                        onPointerDown={(e) => startResize(e, c.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* The header stays when nothing matches, so every column's ▾ is still there to change or clear its filter. */}
              {sortedRows.length === 0 && aggregates.length > 0 && (
                <tr className="empty-row">
                  <td colSpan={1 + columnsInOrder.length}>
                    <div className="empty-state">
                      <h3>No teams match your filters</h3>
                      <p>Try clearing the search or a column filter. This is a filter result, not an API error.</p>
                    </div>
                  </td>
                </tr>
              )}
              {sortedRows.map((t) => (
                <tr key={t.teamId} onClick={() => openTeamProfile(t.teamId)}>
                  <td className="sticky-col" style={{ paddingRight: TEAM_COLUMN_GAP }}>
                    <div className="player-name-cell">
                      <span className="name">{t.name}</span>
                      <span className="meta">
                        <TeamBadge teamId={t.teamId} shortName={t.shortName} />
                        <button
                          type="button"
                          className="chip"
                          style={{ fontSize: 10, padding: "1px 7px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            goToPlayerRankings(t.teamId);
                          }}
                          title={`See ${t.name}'s players, sortable by any metric, in Player Explorer`}
                        >
                          Player Rankings
                        </button>
                      </span>
                    </div>
                  </td>
                  {columnsInOrder.map((c, idx) => {
                    const width = columnWidths[c.key];
                    return (
                      <td
                        key={c.key}
                        className={idx === 0 ? "column-group-divider" : undefined}
                        style={{
                          ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis" } : {}),
                          backgroundColor: teamCellTint(t, c),
                        }}
                      >
                        {c.format(c.getValue(t))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="count-pill" style={{ marginTop: 10 }}>
        {sortedRows.length}/{aggregates.length} Teams
      </div>
    </div>
  );
}
