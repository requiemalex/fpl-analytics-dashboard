import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { useSortSpec, compareSortValues, sortWithinColumns, sortWithoutHiddenColumn, type SortSpec } from "../state/useSortSpec";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { relativeCellTint } from "../utils/colorScale";
import { downloadCsv } from "../utils/csvExport";
import { matchesTeamSearch } from "../utils/playerSearch";
import { MenuGroupHeading } from "../components/MenuControls";
import { CrossoverGroupHeading, SourceStaleMarker, SourceToggle } from "../components/SourceToggle";
import { FPL_SOURCE, useExternalStats, type ColumnSourceChoice } from "../extensions/externalStats";

/** A league-table-style view of each club in the selected season(s) — every column a club figure (see <club_not_squad>, metrics/teamStats.ts). */
const GROUPS: TeamColumnGroup[] = ["RESULTS", "OUTPUT", "UNDERLYING PERFORMANCE"];
/** The league table this page has always opened on. Every other TEAM_COLUMNS metric (the Dashboard's full team catalogue) is in the Columns picker, off by default. */
const TEAM_EXPLORER_DEFAULT_VISIBLE_COLUMNS = ["leaguePosition", "leaguePoints", "goalsFor", "goalsAgainst", "cleanSheets", "xG", "xGC", "xA", "points"];
const TEAM_EXPLORER_DEFAULT_SORT: SortSpec[] = [{ key: "leaguePosition", direction: "asc" }];
/** Every sortable key on screen straight after Reset: the club name and the default columns. */
const TEAM_EXPLORER_KEYS_AFTER_RESET = new Set<string>(["name", ...TEAM_EXPLORER_DEFAULT_VISIBLE_COLUMNS]);

/**
 * Team headers are longer than Player Explorer's ("Goals Against", "Def.
 * Contributions") and wrap between words when their column is narrow, so a
 * column's floor is its longest word — uppercase 11px letter-spaced text,
 * about 8px a character — plus the header's padding (10px left, 26px right
 * for the filter icon) and the sort arrow, which can't wrap away from it.
 */
const minColumnWidth = (c: TeamColumn) => 36 + 14 + 8 * Math.max(...c.label.split(/\s+/).map((w) => w.length));
const TEAM_MIN_COLUMN_WIDTHS: Record<string, number> = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, minColumnWidth(c)]));
/** Room for a header's source toggle (extensions/externalStats.ts). */
const SOURCE_TOGGLE_WIDTH = 16;

/** "2025/26", "2026/27", or "2022/23–2025/26" for a Historic Average window. */
function seasonLabel(seasons: string[]): string {
  if (seasons.length === 0) return "";
  if (seasons.length === 1) return seasons[0];
  return `${seasons[seasons.length - 1]}–${seasons[0]}`;
}

export function Teams() {
  const { teams, clubSeasons, historicReferenceSeason, historicStatus, currentSeasonHasStarted, historicFetchSkippedPlayerIds, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const [, setSearchParams] = useSearchParams();
  // This page's own analysis mode, search and column filters — deliberately
  // not shared with any other page (see state/scoutingFilters.ts).
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const [search, setSearch] = useState("");
  const columnFiltersState = useColumnFilters();
  const { sort, setSort, handleHeaderClick } = useSortSpec(TEAM_EXPLORER_DEFAULT_SORT);

  // A second data source (Understat), when one is mounted — same as Player
  // Explorer: its own club columns, and its version of a figure FPL also has,
  // per column by the header's source toggle (FPL by default). Every column
  // lookup goes through lookupColumn.
  const ext = useExternalStats();
  useEffect(() => {
    ext?.request();
  }, [ext]);
  const extColumns = useMemo(() => ext?.teamColumns(analysisMode) ?? null, [ext, analysisMode]);
  const extOnlyByKey = useMemo(() => new Map((extColumns?.groups ?? []).flatMap((g) => g.columns).map((c) => [c.key, c])), [extColumns]);
  /** FPL columns the second source also has (the ⇄ ones): listed under their own picker heading while it's mounted. */
  const crossoverKeys = useMemo(() => new Set(ext && extColumns ? Object.keys(extColumns.alternates) : []), [ext, extColumns]);
  const [sourceChoice, setSourceChoice] = useState<ColumnSourceChoice>({});
  const lookupColumn = useCallback(
    (key: string): TeamColumn | undefined => {
      if (ext && extColumns && sourceChoice[key] === ext.id && extColumns.alternates[key]) return extColumns.alternates[key];
      return teamColumnByKey(key) ?? extOnlyByKey.get(key);
    },
    [ext, extColumns, sourceChoice, extOnlyByKey],
  );
  // If the second source goes away mid-session, a column switched to it
  // falls back to FPL; the filter set on the other source's figures goes
  // with it, and the choice resets (audit 2026-10-18 L16).
  const { clearFilter } = columnFiltersState;
  useEffect(() => {
    const lost = Object.entries(sourceChoice)
      .filter(([key, source]) => source !== FPL_SOURCE && !(ext && extColumns && source === ext.id && extColumns.alternates[key]))
      .map(([key]) => key);
    if (lost.length === 0) return;
    for (const key of lost) clearFilter(key);
    setSourceChoice((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !lost.includes(key))));
  }, [ext, extColumns, sourceChoice, clearFilter]);
  const getTeamValue = useCallback(
    (team: TeamAggregate, key: string): number | string | null => (key === "name" ? team.name : (lookupColumn(key)?.getValue(team) ?? null)),
    [lookupColumn],
  );
  const minColumnWidths = useMemo(() => {
    const widths: Record<string, number> = { ...TEAM_MIN_COLUMN_WIDTHS };
    for (const c of extOnlyByKey.values()) widths[c.key] = minColumnWidth(c);
    for (const key of Object.keys(extColumns?.alternates ?? {})) widths[key] = (widths[key] ?? 0) + SOURCE_TOGGLE_WIDTH;
    return widths;
  }, [extOnlyByKey, extColumns]);

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
  } = useColumnCustomization(TEAM_EXPLORER_DEFAULT_VISIBLE_COLUMNS, minColumnWidths, () => handleFitToBox());
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
    () => computeTeamAggregates(teams, analysisMode, { clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted, livePlayerSumsPartial: historicFetchSkippedPlayerIds.length > 0 }),
    [teams, analysisMode, clubSeasons, historicReferenceSeason, currentSeasonHasStarted, historicFetchSkippedPlayerIds],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim();
    return aggregates.filter(
      (t) =>
        (!query || matchesTeamSearch(t, query)) &&
        columnFiltersState.passesAllFilters(
          (key) => getTeamValue(t, key),
          (key) => lookupColumn(key)?.decimals,
        ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregates, search, columnFiltersState.columnFilters, lookupColumn]);

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
  }, [filteredRows, sort, getTeamValue]);

  const columnsInOrder = useMemo(
    () => visibleColumns.map((key) => lookupColumn(key)).filter((c): c is TeamColumn => c !== undefined),
    [visibleColumns, lookupColumn],
  );

  function toggleColumnSource(key: string) {
    if (!ext) return;
    // A filter set on one source's figures doesn't carry over to the other's.
    columnFiltersState.clearFilter(key);
    setSourceChoice((prev) => ({ ...prev, [key]: prev[key] === ext.id ? FPL_SOURCE : ext.id }));
  }

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
    const headers = ["Team", ...columnsInOrder.map((c) => (ext && c.sourceId === ext.id ? `${c.label} (${ext.label})` : c.label))];
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
        <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} clubFigures />
        {seasons.length > 0 && <span className="value-muted" style={{ fontSize: 12.5 }}>{seasonLabel(seasons)}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div className="icon-toolbar">
          <IconChipButton
            icon={<ResetIcon />}
            label="Restore the default columns, order, and natural widths, and clear every filter"
            onClick={() => {
              resetColumns();
              setSort((prev) => sortWithinColumns(prev, TEAM_EXPLORER_KEYS_AFTER_RESET, TEAM_EXPLORER_DEFAULT_SORT));
              setSourceChoice({});
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
                {/* Three kinds of heading, by source: green FPL only, the crossover colour for figures both sources have (⇄ on the header), then the second source's own. */}
                {GROUPS.map((group) => (
                  <div key={group}>
                    <MenuGroupHeading group={group} className="col-source-fpl" />
                    {TEAM_COLUMNS.filter((c) => c.group === group && !crossoverKeys.has(c.key)).map((c) => (
                      <label key={c.key}>
                        <input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => handleToggleColumn(c.key)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                ))}
                {ext && crossoverKeys.size > 0 && (
                  <div>
                    <CrossoverGroupHeading externalLabel={ext.label} />
                    {TEAM_COLUMNS.filter((c) => crossoverKeys.has(c.key)).map((c) => (
                      <label key={c.key}>
                        <input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => handleToggleColumn(c.key)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
                {ext &&
                  extColumns?.groups.map((group) => (
                    <div key={group.heading}>
                      <MenuGroupHeading group={group.heading} icon={ext.icon} className={ext.className} />
                      {group.columns.map((c) => (
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
            label="Clear every filter: the search box and every column filter"
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
                  style={{ width: 1 }}
                >
                  Team
                  {nameSort && <span className="sort-indicator">{nameSort.direction === "asc" ? "↑" : "↓"}</span>}
                </th>
                {columnsInOrder.map((c, idx) => {
                  const sortEntry = sort.find((s) => s.key === c.key);
                  const width = columnWidths[c.key];
                  // The colour index: FPL club figures (they all follow the Data View) are green, a second source's its own colour (violet for Understat).
                  const fromExt = ext !== null && c.sourceId === ext.id;
                  const canSwitchSource = ext !== null && !!extColumns?.alternates[c.key];
                  const className = [fromExt ? ext?.className : "col-source-fpl", idx === 0 && "column-group-divider"].filter(Boolean).join(" ") || undefined;
                  return (
                    <th
                      key={c.key}
                      draggable
                      className={className}
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
                      {canSwitchSource && ext && <SourceToggle showingExternal={fromExt} externalLabel={ext.label} onToggle={() => toggleColumnSource(c.key)} />}
                      {fromExt && ext?.staleNote && <SourceStaleMarker note={ext.staleNote} />}
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
                  <td className="sticky-col">
                    <div className="player-name-cell">
                      <span className="name">{t.name}</span>
                      <span className="meta">
                        <TeamBadge teamId={t.teamId} shortName={t.shortName} />
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
