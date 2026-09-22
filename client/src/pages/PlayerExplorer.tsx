import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useFilteredPlayers } from "../state/useFilteredPlayers";
import { useColumnCustomization } from "../state/useColumnCustomization";
import { useSortSpec, compareSortValues } from "../state/useSortSpec";
import { useColumnFilters, isColumnFilterActive } from "../state/useColumnFilters";
import { ColumnFilterControl } from "../components/ColumnFilterControl";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures, formatFixturesForCsv, type UpcomingFixture } from "../metrics/fixtureTicker";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";
import { PositionBadge, TeamBadge, SignedNum, AvailabilityFlag, availabilityTextClass, FixtureChips } from "../components/primitives";
import { PLAYER_COLUMNS, columnByKey, isStaticColumn, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { IconChipButton, ResetIcon, ColumnsIcon, FilterIcon, DownloadIcon } from "../components/IconToolbar";
import { fmtSigned, fmtPercent, fmtPrice, DASH } from "../utils/format";
import { relativeCellTint } from "../utils/colorScale";
import { downloadCsv } from "../utils/csvExport";
import type { NormalizedPlayer, Position } from "../types/normalized";

const GROUPS: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];
/** Not a PLAYER_COLUMNS entry (renders fixture chips, not a number), so it shares the reorder/resize/Fit-to-Box engine as a special key, scoped to this page's own default list rather than the shared DEFAULT_VISIBLE_COLUMNS Team Building also uses. Deselected by default. Always the player's live team's upcoming fixtures, regardless of analysis mode — moving between seasons' fixtures wouldn't mean anything, same reasoning as price/ownership staying live. */
const FIXTURES_COLUMN_KEY = "fixtures";
/**
 * Team and Position used to be dropdown criteria in the bar above the table
 * (FiltersBar) plus part of the Player column's meta line — both replaced by
 * these two sortable/filterable table columns instead (see the Add Tile
 * modal / other pages for where Team/Position dropdown criteria still make
 * sense; this page just doesn't need both a dropdown AND a column doing the
 * same job). Not PLAYER_COLUMNS entries (categorical, not numeric — a
 * min/max comparative tint would be meaningless for a team name or
 * position), so like Fixtures they're handled as special string keys, but
 * — unlike Fixtures — ARE sortable and filterable (via a "show only"
 * dropdown rather than the numeric lte/gte/eq inputs; see
 * ColumnFilterControl's categoryOptions). Always the player's live
 * team/position, never a per-analysis-mode figure — same red "always live"
 * header styling as Ownership/Price (isStaticColumn), on by default.
 */
const TEAM_COLUMN_KEY = "team";
const POSITION_COLUMN_KEY = "position";
/** Team/Position's own key type — narrower than SpecialColumnKey below, so IDENTITY_COLUMNS (which never contains "fixtures") type-narrows fully after excluding just these two. */
type IdentityColumnKey = typeof TEAM_COLUMN_KEY | typeof POSITION_COLUMN_KEY;
/** The broader union — every special string key across the whole page — used only by columnLabel/cellValue, which handle all three and are shared by both the identity block and the flexible columns. */
type SpecialColumnKey = typeof FIXTURES_COLUMN_KEY | IdentityColumnKey;
const POSITION_OPTIONS: Position[] = ["GKP", "DEF", "MID", "FWD"];

/**
 * Ownership, Price, Team, Position — a fixed, non-toggleable, non-reorderable
 * block that always renders immediately after the sticky Player column, in
 * this exact order, separated from the user-configurable columns by a grey
 * divider (see the `column-group-divider` class below). Ownership and Price
 * are real PLAYER_COLUMNS entries (columnByKey below is a lookup, not a
 * redefinition); Team/Position are the same special string keys used
 * elsewhere on this page. Excluded from `EXPLORER_DEFAULT_VISIBLE_COLUMNS`,
 * the column picker popover, and the reorder/toggle machinery entirely —
 * still sortable (click header), filterable (numeric for Ownership/Price,
 * category dropdown for Team/Position), and individually resizable, just
 * never removable or draggable out of place.
 */
const IDENTITY_COLUMNS: (PlayerColumn | IdentityColumnKey)[] = [columnByKey("ownership")!, columnByKey("price")!, TEAM_COLUMN_KEY, POSITION_COLUMN_KEY];
const FIXED_COLUMN_KEYS = new Set<string>(["ownership", "price", TEAM_COLUMN_KEY, POSITION_COLUMN_KEY]);

/** This page's own default visible-column order for the user-configurable columns only — deliberately NOT the shared DEFAULT_VISIBLE_COLUMNS (Team Building also uses that one; changing it would silently change Team Building's defaults too). Ownership/Price/Team/Position are never part of this list — see IDENTITY_COLUMNS above. */
const EXPLORER_DEFAULT_VISIBLE_COLUMNS = ["totalPoints", "pointsPerGame", "goals", "assists", "pointsPerMillion", "xG", "xA", "xGI", "minutes"];

export function PlayerExplorer() {
  const { players, teamsById, fixtures, advancedFieldAvailability, historicProfiles, historicStatus, currentSeasonHasStarted, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);

  // This page's own analysis-mode + filter state — deliberately not
  // shared with any other page (see state/scoutingFilters.ts). `?team=`
  // is a one-time seed from Teams.tsx's "View Players" hand-off (read
  // once at mount only, never kept in sync afterwards) — the only
  // cross-page link left, carried via the URL rather than shared state.
  const [searchParams, setSearchParams] = useSearchParams();
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const [filters, setFilters] = useState<GlobalScoutingFilters>(() => {
    const teamParam = searchParams.get("team");
    return teamParam ? { ...DEFAULT_FILTERS, teamId: Number(teamParam) } : DEFAULT_FILTERS;
  });
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const { resolved: resolvedPlayers } = useMemo(
    () => resolvePlayerStatsList(players, analysisMode, historicProfiles, currentSeasonHasStarted),
    [players, analysisMode, historicProfiles, currentSeasonHasStarted],
  );

  // Same reasoning as Team Building's own fixturesByTeamId — cheap (20
  // clubs) but still memoized so it doesn't get a fresh Map identity (and
  // silently defeat comparisons/CSV export downstream) on every render.
  const fixturesByTeamId = useMemo(() => {
    const map = new Map<number, UpcomingFixture[]>();
    for (const team of teamsById.values()) {
      map.set(team.id, getUpcomingFixtures(team.id, fixtures, teamsById));
    }
    return map;
  }, [teamsById, fixtures]);

  const filtered = useFilteredPlayers(resolvedPlayers, filters, analysisMode);

  const [showColumnPopover, setShowColumnPopover] = useState(false);
  const { sort, handleHeaderClick } = useSortSpec([{ key: "totalPoints", direction: "desc" }]);

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
  } = useColumnCustomization(EXPLORER_DEFAULT_VISIBLE_COLUMNS);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyColRef = useRef<HTMLTableCellElement>(null);
  /** The last (Position) identity column's cell — combined with stickyColRef, gives the fixed identity block's total rendered width (Player column's right edge to Position column's right edge), so handleFitToBox can hand the flexible engine only the width that's actually left over for it. */
  const identityEndRef = useRef<HTMLTableCellElement>(null);

  const rows = useMemo(
    () =>
      filtered.map((p) => ({
        player: p,
        derived: getPlayerDerivedMetrics(p),
      })),
    [filtered],
  );

  const columnFiltersState = useColumnFilters();

  // "name" is handled separately since it isn't a PLAYER_COLUMNS entry
  // (there's nothing to derive — the player's name IS the value) — used
  // by both sorting and the Excel-style column filter below, so the two
  // can never resolve a column's value differently.
  function getRowValue(row: { player: NormalizedPlayer; derived: PlayerDerivedMetrics }, key: string): number | string | null {
    if (key === "name") return row.player.name;
    if (key === TEAM_COLUMN_KEY) return row.player.teamShortName;
    if (key === POSITION_COLUMN_KEY) return row.player.position;
    const col = columnByKey(key);
    return col ? col.getValue(row.player, row.derived) : null;
  }

  // Every team currently in the pool, alphabetical by short name — the
  // Team column's "show only" filter dropdown options. Built from `teams`
  // rather than `rows` so the option list doesn't shrink as other filters
  // narrow the visible rows (same convention as the old Team criteria
  // dropdown, which always listed every team regardless of what else was
  // filtered).
  const teamCategoryOptions = useMemo(
    () =>
      Array.from(teamsById.values())
        .map((t) => t.shortName)
        .sort((a, b) => a.localeCompare(b)),
    [teamsById],
  );

  const filteredRows = useMemo(
    () => rows.filter((r) => columnFiltersState.passesAllFilters((key) => getRowValue(r, key))),
    [rows, columnFiltersState.columnFilters],
  );

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      for (const s of sort) {
        const cmp = compareSortValues(getRowValue(a, s.key), getRowValue(b, s.key), s.direction, "belowZero");
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return arr;
  }, [filteredRows, sort]);

  /** Measures the sticky Player column and the fixed identity block (Ownership/Price/Team/Position) actually rendered, then hands only what's left over to the shared engine for the user-configurable columns. */
  function handleFitToBox() {
    const container = tableWrapRef.current;
    if (!container) return;
    const stickyWidth = stickyColRef.current?.getBoundingClientRect().width ?? 170;
    const identityWidth =
      identityEndRef.current && stickyColRef.current
        ? identityEndRef.current.getBoundingClientRect().right - stickyColRef.current.getBoundingClientRect().right
        : 0;
    fitToBox(container.clientWidth - stickyWidth - identityWidth - 4);
  }

  // Column widths auto-fit the table's available width — on first load
  // (once there are rows to measure against), whenever the set of visible
  // columns changes (so toggling a column on/off never leaves the table
  // overflowing or oddly narrow), and on window resize. Deliberately keyed
  // on visibleColumns.length rather than the array itself: a plain reorder
  // (drag-and-drop) doesn't change the column count, so it shouldn't
  // re-trigger this and wipe out a manual per-column resize.
  useEffect(() => {
    if (sortedRows.length === 0) return;
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

  // The user-configurable columns — a real PLAYER_COLUMNS entry, or the
  // special Fixtures key (renders fixture chips, not a number). Team/Position
  // never appear here — they're part of the fixed IDENTITY_COLUMNS block
  // above, never toggled into `visibleColumns` at all (see toggleColumn's
  // call sites: only Fixtures and the PLAYER_COLUMNS checkboxes call it).
  const columnsInOrder = useMemo(
    () =>
      visibleColumns
        .map((key) => (key === FIXTURES_COLUMN_KEY ? key : columnByKey(key)))
        .filter((c): c is PlayerColumn | typeof FIXTURES_COLUMN_KEY => !!c),
    [visibleColumns],
  );

  // Per-column min/max across the rows currently shown (post-filter,
  // post-sort) — same scoping as Team Building's tint: "how does this
  // compare to what you're looking at right now", not an absolute scale.
  // Covers IDENTITY_COLUMNS too (Ownership/Price keep their comparative
  // tint even though they're now a fixed block) — special columns are
  // skipped either way: Fixtures already has its own per-chip FDR colour,
  // and Team/Position are categorical (a min/max comparative tint would be
  // meaningless for a team name or position) — a second tint layered on
  // top would just be noise either way.
  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of [...IDENTITY_COLUMNS, ...columnsInOrder]) {
      if (typeof c === "string") continue;
      const values = sortedRows.map((r) => c.getValue(r.player, r.derived)).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [columnsInOrder, sortedRows]);

  function columnTint(player: NormalizedPlayer, derived: PlayerDerivedMetrics, c: PlayerColumn): string | undefined {
    const range = columnRanges.get(c.key);
    const v = c.getValue(player, derived);
    if (!range || v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
  }

  /** Shared by the table header and the CSV export, so the two can never label a column differently. */
  function columnLabel(c: PlayerColumn | SpecialColumnKey): string {
    if (c === FIXTURES_COLUMN_KEY) return "Next 5 Fixtures";
    if (c === TEAM_COLUMN_KEY) return "Team";
    if (c === POSITION_COLUMN_KEY) return "Position";
    return c.label;
  }

  /** Shared by the CSV export for both the fixed identity block and the flexible columns. */
  function cellValue(c: PlayerColumn | SpecialColumnKey, player: NormalizedPlayer, derived: PlayerDerivedMetrics): string {
    if (c === FIXTURES_COLUMN_KEY) return formatFixturesForCsv(fixturesByTeamId.get(player.teamId) ?? []);
    if (c === TEAM_COLUMN_KEY) return player.teamShortName;
    if (c === POSITION_COLUMN_KEY) return player.position;
    const value = c.getValue(player, derived);
    if (c.key === "goalsMinusXG" || c.key === "assistsMinusXA") return value !== null ? fmtSigned(value, 2) : DASH;
    return c.format(value);
  }

  // Matches exactly what's on screen — same rows (filtered/sorted), same
  // columns in the same order (Player's name, then the fixed Ownership/
  // Price/Team/Position block, then the user-configurable columns), same
  // formatted values (— for unavailable) — so the export is never a
  // surprise relative to the table it was taken from.
  function handleExportCsv() {
    const headers = ["Player", ...IDENTITY_COLUMNS.map(columnLabel), ...columnsInOrder.map(columnLabel)];
    const rows = sortedRows.map(({ player, derived }) => {
      const identityCells = IDENTITY_COLUMNS.map((c) => cellValue(c, player, derived));
      const cells = columnsInOrder.map((c) => cellValue(c, player, derived));
      return [player.name, ...identityCells, ...cells];
    });
    downloadCsv(`player-explorer-${analysisMode}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div className="page-fill">
      <div className="page-header">
        <div>
          <h1>Player Explorer</h1>
        </div>
      </div>

      <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} />

      {/*
        No FiltersBar here any more — Search moved to the toolbar below,
        and Position/Team/Min Minutes are now handled by their own table
        columns (Position/Team's category filter, MINS's per-column numeric
        filter). With every one of FiltersBar's fields opted out via
        showSearch/showPosition/showTeam/showMinMinutes, it would render as
        an empty box holding nothing but a stray Reset icon — worse than no
        bar at all. `filters`/`resetFilters` still exist (Search still
        reads/writes filters.search, and the Filter/Reset-columns buttons
        below still clear it), just with no bar of their own to render.
      */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div className="icon-toolbar">
          <IconChipButton
            icon={<ResetIcon />}
            label="Restore the default columns, order, and natural widths, and clear every filter"
            onClick={() => {
              resetColumns();
              resetFilters();
              columnFiltersState.resetAllFilters();
            }}
          />
          <div style={{ position: "relative" }}>
            <IconChipButton
              icon={<ColumnsIcon />}
              label={`Columns (${visibleColumns.length} shown)`}
              badge={visibleColumns.length}
              onClick={() => setShowColumnPopover((v) => !v)}
            />
            {showColumnPopover && (
              <div className="popover" style={{ left: 0, right: "auto" }}>
                {/* Ownership/Price/Team/Position aren't listed here at all — they're the fixed identity block (IDENTITY_COLUMNS), always shown, never toggleable. */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>
                    Other
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(FIXTURES_COLUMN_KEY)}
                      onChange={() => toggleColumn(FIXTURES_COLUMN_KEY)}
                    />
                    Next 5 Fixtures
                  </label>
                </div>
                {GROUPS.map((group) => (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>
                      {group}
                    </div>
                    {PLAYER_COLUMNS.filter((c) => c.group === group && !FIXED_COLUMN_KEYS.has(c.key)).map((c) => (
                      <label key={c.key}>
                        <input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
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
            label="Clear every filter — the filter bar above and any per-column filters"
            onClick={() => {
              resetFilters();
              columnFiltersState.resetAllFilters();
            }}
          />
          <IconChipButton icon={<DownloadIcon />} label="Export the visible columns and current rows to a CSV file" onClick={handleExportCsv} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input
            id="pe-toolbar-search"
            type="text"
            placeholder="Player name…"
            aria-label="Search players"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>
      </div>

      {advancedFieldAvailability && !advancedFieldAvailability.defensive_contribution && (
        <div className="banner info">
          Defensive Contributions is not present on this build of the live API — affected columns will show —. See the User Guide's
          metric reference for details.
        </div>
      )}

      <div className="page-fill-body">
        {sortedRows.length === 0 && analysisMode !== "live" && historicStatus === "loading" ? (
          <div className="empty-state">
            <h3>Building the historic dataset…</h3>
            <p>This runs once per session and can take up to a minute — it'll be quick after that.</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="empty-state">
            <h3>No players match your filters</h3>
            <p>Try clearing a filter — the criteria bar above or a per-column filter. This is a filter result, not an API error.</p>
          </div>
        ) : (
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky-col" ref={stickyColRef} onClick={() => handleHeaderClick("name", false)}>
                  Player
                </th>
                {IDENTITY_COLUMNS.map((c, idx) => {
                  const key = typeof c === "string" ? c : c.key;
                  const label = columnLabel(c);
                  const sortEntry = sort.find((s) => s.key === key);
                  const width = columnWidths[key];
                  const categoryOptions =
                    c === TEAM_COLUMN_KEY ? teamCategoryOptions : c === POSITION_COLUMN_KEY ? POSITION_OPTIONS : undefined;
                  return (
                    <th
                      key={key}
                      ref={idx === IDENTITY_COLUMNS.length - 1 ? identityEndRef : undefined}
                      className="col-static"
                      onClick={(e) => handleHeaderClick(key, e.shiftKey)}
                      title="Always today's live figure, regardless of the toggle above · Click to sort · Shift-click to add secondary sort · Drag the right edge to resize"
                      style={{
                        position: "relative",
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                      }}
                    >
                      {label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "↑" : "↓"}</span>}
                      <ColumnFilterControl
                        isOpen={columnFiltersState.openFilterKey === key}
                        isActive={isColumnFilterActive(columnFiltersState.columnFilters[key])}
                        filterDraft={columnFiltersState.filterDraft}
                        onOpen={() => columnFiltersState.openFilter(key)}
                        onCancel={columnFiltersState.cancelFilter}
                        onConfirm={columnFiltersState.confirmFilter}
                        onDraftChange={columnFiltersState.setFilterDraft}
                        categoryOptions={categoryOptions}
                      />
                      <span
                        className={`column-resize-handle${resizingKey === key ? " resizing" : ""}`}
                        draggable={false}
                        onPointerDown={(e) => startResize(e, key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
                {columnsInOrder.map((c, idx) => {
                  const isSpecial = typeof c === "string";
                  const key = isSpecial ? c : c.key;
                  const label = columnLabel(c);
                  // Fixtures alone stays unsortable/unfilterable — it renders a row of
                  // fixture chips, not a single comparable value.
                  const isFixtures = c === FIXTURES_COLUMN_KEY;
                  const sortEntry = isFixtures ? undefined : sort.find((s) => s.key === key);
                  const width = columnWidths[key];
                  // Fixtures is always the player's live figure, regardless of analysis mode.
                  const isStatic = isFixtures || isStaticColumn(c as PlayerColumn);
                  // Grey divider between the fixed Ownership/Price/Team/Position block and these user-configurable columns — only the first one carries it.
                  const className = [isStatic && "col-static", idx === 0 && "column-group-divider"].filter(Boolean).join(" ") || undefined;
                  return (
                    <th
                      key={key}
                      draggable
                      className={className}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", key)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverKey !== key) setDragOverKey(key);
                      }}
                      onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverKey(null);
                        const draggedKey = e.dataTransfer.getData("text/plain");
                        if (draggedKey && draggedKey !== key) reorderColumn(draggedKey, key);
                      }}
                      onClick={isFixtures ? undefined : (e) => handleHeaderClick(key, e.shiftKey)}
                      title={
                        isFixtures
                          ? "Always the player's live team's upcoming fixtures, regardless of analysis mode · Drag to reorder · Drag the right edge to resize"
                          : isStatic
                            ? "Always today's live figure, regardless of the toggle above · Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                            : "Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                      }
                      style={{
                        position: "relative",
                        textAlign: isFixtures ? "left" : undefined,
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        cursor: "grab",
                        outline: dragOverKey === key ? "2px dashed var(--accent-focus)" : undefined,
                        outlineOffset: dragOverKey === key ? -2 : undefined,
                      }}
                    >
                      {label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                      {!isFixtures && (
                        <ColumnFilterControl
                          isOpen={columnFiltersState.openFilterKey === key}
                          isActive={isColumnFilterActive(columnFiltersState.columnFilters[key])}
                          filterDraft={columnFiltersState.filterDraft}
                          onOpen={() => columnFiltersState.openFilter(key)}
                          onCancel={columnFiltersState.cancelFilter}
                          onConfirm={columnFiltersState.confirmFilter}
                          onDraftChange={columnFiltersState.setFilterDraft}
                        />
                      )}
                      <span
                        className={`column-resize-handle${resizingKey === key ? " resizing" : ""}`}
                        draggable={false}
                        onPointerDown={(e) => startResize(e, key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(({ player, derived }) => (
                <tr key={player.id} onClick={() => setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(player.id) }))}>
                  <td className="sticky-col">
                    <div className="player-name-cell">
                      <span className={`name ${availabilityTextClass(player.status)}`}>
                        {player.name}
                        <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
                      </span>
                      <span className="meta">
                        {fmtPercent(player.ownership)} · {fmtPrice(player.price)}
                        <TeamBadge teamId={player.teamId} shortName={player.teamShortName} />
                        <PositionBadge position={player.position} />
                      </span>
                    </div>
                  </td>
                  {IDENTITY_COLUMNS.map((c) => {
                    const width = columnWidths[typeof c === "string" ? c : c.key];
                    const widthStyle = width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const } : {};
                    if (c === TEAM_COLUMN_KEY || c === POSITION_COLUMN_KEY) {
                      return (
                        <td key={c} style={widthStyle}>
                          {c === TEAM_COLUMN_KEY ? <TeamBadge teamId={player.teamId} shortName={player.teamShortName} /> : <PositionBadge position={player.position} />}
                        </td>
                      );
                    }
                    const value = c.getValue(player, derived);
                    return (
                      <td key={c.key} style={{ ...widthStyle, backgroundColor: columnTint(player, derived, c) }}>
                        {c.format(value)}
                      </td>
                    );
                  })}
                  {columnsInOrder.map((c, idx) => {
                    const dividerClass = idx === 0 ? "column-group-divider" : undefined;
                    if (c === FIXTURES_COLUMN_KEY) {
                      const width = columnWidths[FIXTURES_COLUMN_KEY];
                      return (
                        <td
                          key={FIXTURES_COLUMN_KEY}
                          className={dividerClass}
                          style={{
                            textAlign: "left",
                            ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden" } : {}),
                          }}
                        >
                          <FixtureChips fixtures={fixturesByTeamId.get(player.teamId) ?? []} />
                        </td>
                      );
                    }
                    const value = c.getValue(player, derived);
                    const isSignedMetric = c.key === "goalsMinusXG" || c.key === "assistsMinusXA";
                    const width = columnWidths[c.key];
                    return (
                      <td
                        key={c.key}
                        className={dividerClass}
                        style={{
                          ...(width
                            ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                            : {}),
                          backgroundColor: columnTint(player, derived, c),
                        }}
                      >
                        {isSignedMetric ? <SignedNum value={value} /> : c.format(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
      <div className="count-pill" style={{ marginTop: 10 }}>
        {sortedRows.length.toLocaleString("en-GB")}/{resolvedPlayers.length.toLocaleString("en-GB")} Players
      </div>
    </div>
  );
}
