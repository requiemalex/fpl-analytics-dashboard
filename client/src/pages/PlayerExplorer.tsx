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
import { FiltersBar } from "../components/FiltersBar";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";
import { PositionBadge, SignedNum, AvailabilityFlag, availabilityTextClass, FixtureChips } from "../components/primitives";
import { PLAYER_COLUMNS, DEFAULT_VISIBLE_COLUMNS, columnByKey, isStaticColumn, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { IconChipButton, ResetIcon, ColumnsIcon, FilterIcon, DownloadIcon } from "../components/IconToolbar";
import { fmtPrice, fmtSigned, DASH } from "../utils/format";
import { relativeCellTint } from "../utils/colorScale";
import { downloadCsv } from "../utils/csvExport";
import type { NormalizedPlayer } from "../types/normalized";

const GROUPS: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];
/** Not a PLAYER_COLUMNS entry (renders fixture chips, not a number), so it shares the reorder/resize/Fit-to-Box engine as a special key, scoped to this page's own default list rather than the shared DEFAULT_VISIBLE_COLUMNS Team Building also uses. Deselected by default. Always the player's live team's upcoming fixtures, regardless of analysis mode — moving between seasons' fixtures wouldn't mean anything, same reasoning as price/ownership staying live. */
const FIXTURES_COLUMN_KEY = "fixtures";

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

  // Price in the name+position+price identity cluster is always live,
  // regardless of analysis mode — matching Team Building and the
  // profile header, which never let a past season's price stand in for
  // today's. The Price COLUMN (PLAYER_COLUMNS, toggleable) is a
  // different thing and correctly still resolves per mode — this is
  // specifically about the identity line, not that explicit column.
  const livePlayersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

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
  } = useColumnCustomization(DEFAULT_VISIBLE_COLUMNS);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyColRef = useRef<HTMLTableCellElement>(null);

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
    const col = columnByKey(key);
    return col ? col.getValue(row.player, row.derived) : null;
  }

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

  /** Measures the sticky Player column actually rendered, then hands the remaining width to the shared engine. */
  function handleFitToBox() {
    const container = tableWrapRef.current;
    if (!container) return;
    const stickyWidth = stickyColRef.current?.getBoundingClientRect().width ?? 170;
    fitToBox(container.clientWidth - stickyWidth - 4);
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

  // A column is either a real PLAYER_COLUMNS entry or the special Fixtures
  // string key above — that one doesn't render a plain number, so
  // `typeof c === "string"` is used throughout as the generic "is this
  // the special column" check.
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
  // The special column is skipped here entirely — Fixtures already has
  // its own per-chip FDR colour, a second tint layered on top would just
  // be noise.
  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of columnsInOrder) {
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

  // Matches exactly what's on screen — same rows (filtered/sorted), same
  // visible columns in the same order, same formatted values (— for
  // unavailable) — so the export is never a surprise relative to the table
  // it was taken from.
  function handleExportCsv() {
    const headers = [
      "Player",
      "Position",
      "Team",
      "Price",
      ...columnsInOrder.map((c) => (c === FIXTURES_COLUMN_KEY ? "Next 5 Fixtures" : c.label)),
    ];
    const rows = sortedRows.map(({ player, derived }) => {
      const price = fmtPrice(livePlayersById.get(player.id)?.price ?? player.price);
      const cells = columnsInOrder.map((c) => {
        if (c === FIXTURES_COLUMN_KEY) return formatFixturesForCsv(fixturesByTeamId.get(player.teamId) ?? []);
        const value = c.getValue(player, derived);
        if (c.key === "goalsMinusXG" || c.key === "assistsMinusXA") return value !== null ? fmtSigned(value, 2) : DASH;
        return c.format(value);
      });
      return [player.name, player.position, player.teamShortName, price, ...cells];
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

      <FiltersBar idPrefix="pe" filters={filters} onChange={setFilters} onReset={resetFilters} analysisMode={analysisMode} />

      <div className="icon-toolbar" style={{ marginBottom: 12 }}>
        <IconChipButton icon={<ResetIcon />} label="Restore the default columns, order, and natural widths" onClick={resetColumns} />
        <div style={{ position: "relative" }}>
          <IconChipButton
            icon={<ColumnsIcon />}
            label={`Columns (${visibleColumns.length} shown)`}
            badge={visibleColumns.length}
            onClick={() => setShowColumnPopover((v) => !v)}
          />
          {showColumnPopover && (
            <div className="popover" style={{ left: 0, right: "auto" }}>
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
                  {PLAYER_COLUMNS.filter((c) => c.group === group).map((c) => (
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
            <p>Try widening the minimum-minutes threshold or clearing a filter. This is a filter result, not an API error.</p>
          </div>
        ) : (
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky-col" ref={stickyColRef} onClick={() => handleHeaderClick("name", false)}>
                  Player
                </th>
                {columnsInOrder.map((c) => {
                  const isSpecial = typeof c === "string";
                  const key = isSpecial ? c : c.key;
                  const label = c === FIXTURES_COLUMN_KEY ? "Next 5 Fixtures" : (c as PlayerColumn).label;
                  const sortEntry = isSpecial ? undefined : sort.find((s) => s.key === key);
                  const width = columnWidths[key];
                  // Fixtures are always the player's live upcoming fixtures, regardless of analysis mode.
                  const isStatic = c === FIXTURES_COLUMN_KEY || (!isSpecial && isStaticColumn(c as PlayerColumn));
                  return (
                    <th
                      key={key}
                      draggable
                      className={isStatic ? "col-static" : undefined}
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
                      onClick={isSpecial ? undefined : (e) => handleHeaderClick(key, e.shiftKey)}
                      title={
                        c === FIXTURES_COLUMN_KEY
                          ? "Always the player's live team's upcoming fixtures, regardless of analysis mode · Drag to reorder · Drag the right edge to resize"
                          : isStatic
                            ? "Always today's live figure, regardless of the toggle above · Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                            : "Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                      }
                      style={{
                        position: "relative",
                        textAlign: isSpecial ? "left" : undefined,
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        cursor: "grab",
                        outline: dragOverKey === key ? "2px dashed var(--accent-focus)" : undefined,
                        outlineOffset: dragOverKey === key ? -2 : undefined,
                      }}
                    >
                      {label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                      {!isSpecial && (
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
                        <PositionBadge position={player.position} /> {player.teamShortName} · {fmtPrice(livePlayersById.get(player.id)?.price ?? player.price)}
                      </span>
                    </div>
                  </td>
                  {columnsInOrder.map((c) => {
                    if (c === FIXTURES_COLUMN_KEY) {
                      const width = columnWidths[FIXTURES_COLUMN_KEY];
                      return (
                        <td
                          key={FIXTURES_COLUMN_KEY}
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
