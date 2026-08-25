import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useFilteredPlayers, effectiveMinMinutes } from "../state/useFilteredPlayers";
import { useColumnCustomization } from "../state/useColumnCustomization";
import { useSortSpec, compareSortValues } from "../state/useSortSpec";
import { useColumnFilters, isColumnFilterActive } from "../state/useColumnFilters";
import { ColumnFilterControl } from "../components/ColumnFilterControl";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { computeArchetypesForAllPlayers } from "../metrics/archetypes";
import { resolvePlayerStatsList } from "../metrics/resolvePlayerStats";
import { FiltersBar } from "../components/FiltersBar";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { PositionBadge, SignedNum, ArchetypeBadges, AvailabilityFlag, availabilityTextClass } from "../components/primitives";
import { PLAYER_COLUMNS, DEFAULT_VISIBLE_COLUMNS, columnByKey, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { fmtDecimal, fmtPrice } from "../utils/format";
import { relativeCellTint } from "../utils/colorScale";
import type { NormalizedPlayer } from "../types/normalized";

const GROUPS: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];
/** Archetypes isn't a PLAYER_COLUMNS entry (it renders badges, not a number), but it shares the reorder/resize/Fit-to-Box engine as a special key — scoped to this page's own default list, not the shared DEFAULT_VISIBLE_COLUMNS Team Building also uses. */
const ARCHETYPES_COLUMN_KEY = "archetypes";
/** Below this width, badges switch to short-form codes rather than full labels — narrower still, they simply overflow-hide, which is an acceptable outcome by request. */
const ARCHETYPES_COMPACT_WIDTH = 110;
const DEFAULT_VISIBLE_COLUMNS_WITH_ARCHETYPES = [ARCHETYPES_COLUMN_KEY, ...DEFAULT_VISIBLE_COLUMNS];

export function PlayerExplorer() {
  const { players, teamsById, advancedFieldAvailability, filters, resetFilters, analysisMode, historicProfiles, historicStatus, currentSeasonHasStarted } =
    useAppState();

  const { resolved: resolvedPlayers, omittedCount } = useMemo(
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

  const filtered = useFilteredPlayers(resolvedPlayers, filters, analysisMode, teamsById, historicProfiles);
  const [, setSearchParams] = useSearchParams();

  const archetypeMap = useMemo(
    () => computeArchetypesForAllPlayers(resolvedPlayers, effectiveMinMinutes(filters, analysisMode), teamsById, historicProfiles, players),
    [resolvedPlayers, filters, analysisMode, teamsById, historicProfiles, players],
  );

  const [showColumnPopover, setShowColumnPopover] = useState(false);
  const [compact, setCompact] = useState(false);
  const [comparativeColouring, setComparativeColouring] = useState(true);
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
  } = useColumnCustomization(DEFAULT_VISIBLE_COLUMNS_WITH_ARCHETYPES);
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
        const cmp = compareSortValues(getRowValue(a, s.key), getRowValue(b, s.key), s.direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return arr;
  }, [filteredRows, sort]);

  /** Measures the sticky Player column actually rendered, then hands the remaining width to the shared engine (Archetypes is now one of the flexible columns, not a separate pinned one). */
  function handleFitToBox() {
    const container = tableWrapRef.current;
    if (!container) return;
    const stickyWidth = stickyColRef.current?.getBoundingClientRect().width ?? 170;
    fitToBox(container.clientWidth - stickyWidth - 4);
  }

  // Runs Fit to Box automatically the first time the table actually has
  // rows to measure against (not on every render — a ref flag, not a
  // dependency on row content, stops this from re-firing every time
  // filters/sort change the row count later). Without this, the default
  // natural-width columns can overflow badly on a narrower screen before
  // anyone's touched the Fit to Box button.
  const hasAutoFitRef = useRef(false);
  useEffect(() => {
    if (hasAutoFitRef.current || sortedRows.length === 0) return;
    hasAutoFitRef.current = true;
    handleFitToBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows.length > 0]);

  const columnsInOrder = useMemo(
    () =>
      visibleColumns
        .map((key) => (key === ARCHETYPES_COLUMN_KEY ? ARCHETYPES_COLUMN_KEY : columnByKey(key)))
        .filter((c): c is PlayerColumn | typeof ARCHETYPES_COLUMN_KEY => !!c),
    [visibleColumns],
  );

  // Per-column min/max across the rows currently shown (post-filter,
  // post-sort) — same scoping as Team Building's tint: "how does this
  // compare to what you're looking at right now", not an absolute scale.
  // Archetypes isn't numeric, so it's skipped here entirely.
  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of columnsInOrder) {
      if (c === ARCHETYPES_COLUMN_KEY) continue;
      const values = sortedRows.map((r) => c.getValue(r.player, r.derived)).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [columnsInOrder, sortedRows]);

  function columnTint(player: NormalizedPlayer, derived: PlayerDerivedMetrics, c: PlayerColumn): string | undefined {
    if (!comparativeColouring) return undefined;
    const range = columnRanges.get(c.key);
    const v = c.getValue(player, derived);
    if (!range || v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Player Explorer</h1>
          <p className="page-subtitle">Search, filter, sort and compare every eligible Premier League player.</p>
        </div>
      </div>

      <AnalysisModeToggle />

      <FiltersBar />

      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button type="button" className="chip" onClick={() => setCompact((c) => !c)}>
          {compact ? "Comfortable rows" : "Compact rows"}
        </button>
        <button type="button" className="chip" onClick={handleFitToBox} title="Compress all visible columns to fit the table width">
          Fit to Box
        </button>
        <button type="button" className="chip" onClick={resetColumns} title="Restore the default columns, order, and natural widths">
          Reset Columns
        </button>
        <div style={{ position: "relative" }}>
          <button type="button" className="chip" onClick={() => setShowColumnPopover((v) => !v)}>
            Columns ({visibleColumns.length})
          </button>
          {showColumnPopover && (
            <div className="popover">
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>
                  Other
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(ARCHETYPES_COLUMN_KEY)}
                    onChange={() => toggleColumn(ARCHETYPES_COLUMN_KEY)}
                  />
                  Archetypes
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
        <button
          type="button"
          className="chip"
          onClick={() => {
            resetFilters();
            columnFiltersState.resetAllFilters();
          }}
          title="Clear every filter — the filter bar above and any per-column filters"
        >
          Clear Filters
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={comparativeColouring} onChange={(e) => setComparativeColouring(e.target.checked)} />
          Comparative Colouring
        </label>
      </div>

      {advancedFieldAvailability && !advancedFieldAvailability.defensive_contribution && (
        <div className="banner info">
          Defensive Contributions is not present on this build of the live API — affected columns will show —. See the User Guide's
          metric reference for details.
        </div>
      )}

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
        <div className="table-wrap" ref={tableWrapRef} style={{ maxHeight: "70vh" }}>
          <table className={`data-table${compact ? " compact" : ""}`}>
            <thead>
              <tr>
                <th className="sticky-col" ref={stickyColRef} onClick={() => handleHeaderClick("name", false)}>
                  Player
                </th>
                {columnsInOrder.map((c) => {
                  const key = c === ARCHETYPES_COLUMN_KEY ? ARCHETYPES_COLUMN_KEY : c.key;
                  const label = c === ARCHETYPES_COLUMN_KEY ? "Archetypes" : c.label;
                  const sortEntry = c === ARCHETYPES_COLUMN_KEY ? undefined : sort.find((s) => s.key === key);
                  const width = columnWidths[key];
                  return (
                    <th
                      key={key}
                      draggable
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
                      onClick={c === ARCHETYPES_COLUMN_KEY ? undefined : (e) => handleHeaderClick(key, e.shiftKey)}
                      title={
                        c === ARCHETYPES_COLUMN_KEY
                          ? "Drag to reorder · Drag the right edge to resize — badges shrink to short codes, or disappear, as this column narrows"
                          : "Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                      }
                      style={{
                        position: "relative",
                        textAlign: c === ARCHETYPES_COLUMN_KEY ? "left" : undefined,
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        cursor: "grab",
                        outline: dragOverKey === key ? "2px dashed var(--accent-focus)" : undefined,
                        outlineOffset: dragOverKey === key ? -2 : undefined,
                      }}
                    >
                      {label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                      {c !== ARCHETYPES_COLUMN_KEY && (
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
                    if (c === ARCHETYPES_COLUMN_KEY) {
                      const width = columnWidths[ARCHETYPES_COLUMN_KEY];
                      return (
                        <td
                          key={ARCHETYPES_COLUMN_KEY}
                          style={{
                            textAlign: "left",
                            ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden" } : {}),
                          }}
                        >
                          <ArchetypeBadges labels={archetypeMap.get(player.id) ?? []} compact={width !== undefined && width < ARCHETYPES_COMPACT_WIDTH} />
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
      <p className="page-subtitle" style={{ marginTop: 10 }}>
        Showing {sortedRows.length.toLocaleString("en-GB")} of {resolvedPlayers.length.toLocaleString("en-GB")} players with data for this
        view. {fmtDecimal(null)} indicates the metric is unavailable for that player, never a substituted value.
        {analysisMode !== "live" && omittedCount > 0 && ` ${omittedCount.toLocaleString("en-GB")} player(s) have no data for this mode and aren't shown at all.`}
      </p>
    </div>
  );
}
