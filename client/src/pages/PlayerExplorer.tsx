import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useColumnCustomization } from "../state/useColumnCustomization";
import { useSortSpec, compareSortValues, sortWithoutHiddenColumn, type SortSpec } from "../state/useSortSpec";
import { useColumnFilters, isColumnFilterActive } from "../state/useColumnFilters";
import { ColumnFilterControl } from "../components/ColumnFilterControl";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures, formatFixturesForCsv, type UpcomingFixture } from "../metrics/fixtureTicker";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { PositionBadge, TeamBadge, AvailabilityFlag, availabilityTextClass, FixtureChips } from "../components/primitives";
import { PLAYER_COLUMNS, columnByKey, isStaticColumn, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { IconChipButton, ResetIcon, ColumnsIcon, FilterIcon, DownloadIcon } from "../components/IconToolbar";
import { fmtPercent, fmtPrice } from "../utils/format";
import { relativeCellTint } from "../utils/colorScale";
import { downloadCsv } from "../utils/csvExport";
import { matchesPlayerSearch } from "../utils/playerSearch";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { useProgressiveRowCount, INITIAL_ROW_COUNT } from "../state/useProgressiveRowCount";
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

/** Next 5 Fixtures needs room for five fixture chips plus their average; an equal share of the table (about 72px at 1600px wide) showed only two. */
const EXPLORER_MIN_COLUMN_WIDTHS: Record<string, number> = { [FIXTURES_COLUMN_KEY]: 190 };
/** Position sorts in pitch order, not alphabetically: the first (descending) click gives GKP, DEF, MID, FWD. */
const POSITION_SORT_RANK: Record<Position, number> = { GKP: 4, DEF: 3, MID: 2, FWD: 1 };

const EXPLORER_DEFAULT_SORT: SortSpec[] = [{ key: "totalPoints", direction: "desc" }];

/** This page's own default visible-column order for the user-configurable columns only — deliberately NOT the shared DEFAULT_VISIBLE_COLUMNS (Team Building also uses that one; changing it would silently change Team Building's defaults too). Ownership/Price/Team/Position are never part of this list — see IDENTITY_COLUMNS above. */
const EXPLORER_DEFAULT_VISIBLE_COLUMNS = ["totalPoints", "pointsPerGame", "goals", "assists", "pointsPerMillion", "xG", "xA", "xGI", "minutes"];

type ColumnRanges = Map<string, { min: number; max: number }>;
/** Shared empty list, so a team with no fixtures doesn't hand its rows a new array (and a re-render) every time. */
const NO_FIXTURES: UpcomingFixture[] = [];

function columnTint(ranges: ColumnRanges, player: NormalizedPlayer, derived: PlayerDerivedMetrics, c: PlayerColumn): string | undefined {
  const range = ranges.get(c.key);
  const v = c.getValue(player, derived);
  if (!range || v === null) return undefined;
  return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
}

/** The sticky Player cell — shared by real rows and the width-sizer rows, so both measure exactly the same. */
function PlayerCell({ player }: { player: NormalizedPlayer }) {
  return (
    <td className="sticky-col" style={{ paddingRight: 6 }}>
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
  );
}

interface ExplorerRowProps {
  player: NormalizedPlayer;
  derived: PlayerDerivedMetrics;
  columnsInOrder: (PlayerColumn | typeof FIXTURES_COLUMN_KEY)[];
  columnWidths: Record<string, number>;
  columnRanges: ColumnRanges;
  fixtures: UpcomingFixture[];
  onOpenPlayer: (playerId: number) => void;
}

/** One table row. Memoized: opening a filter, dragging a header or adding more staged rows leaves the rows already drawn alone. */
const ExplorerRow = React.memo(function ExplorerRow({ player, derived, columnsInOrder, columnWidths, columnRanges, fixtures, onOpenPlayer }: ExplorerRowProps) {
  return (
    <tr onClick={() => onOpenPlayer(player.id)}>
      <PlayerCell player={player} />
      {IDENTITY_COLUMNS.map((c, idx) => {
        const width = columnWidths[typeof c === "string" ? c : c.key];
        const isFirst = idx === 0;
        const widthStyle = {
          ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const } : {}),
          ...(isFirst ? { paddingLeft: 6 } : {}),
        };
        const className = isFirst ? "column-group-divider" : undefined;
        if (c === TEAM_COLUMN_KEY || c === POSITION_COLUMN_KEY) {
          return (
            <td key={c} className={className} style={widthStyle}>
              {c === TEAM_COLUMN_KEY ? <TeamBadge teamId={player.teamId} shortName={player.teamShortName} /> : <PositionBadge position={player.position} />}
            </td>
          );
        }
        const value = c.getValue(player, derived);
        return (
          <td key={c.key} className={className} style={{ ...widthStyle, backgroundColor: columnTint(columnRanges, player, derived, c) }}>
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
              <FixtureChips fixtures={fixtures} />
            </td>
          );
        }
        const value = c.getValue(player, derived);
        const width = columnWidths[c.key];
        return (
          <td
            key={c.key}
            className={dividerClass}
            style={{
              ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
              backgroundColor: columnTint(columnRanges, player, derived, c),
            }}
          >
            {c.format(value)}
          </td>
        );
      })}
    </tr>
  );
});

/** How many of the likeliest-widest Player cells (by name line, and by the ownership/price line) stand in for rows not drawn yet. */
const SIZER_CANDIDATES_BY_NAME = 20;
const SIZER_CANDIDATES_BY_META = 10;
/** Rough allowance for the availability flag after a flagged player's name — only used to rank candidates, never to size anything. */
const FLAG_ALLOWANCE_PX = 14;

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Text width for ranking candidates only. Falls back to character count where canvas isn't available (tests). */
function estimateTextWidth(text: string, font: string): number {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement("canvas").getContext("2d") ?? null;
    } catch {
      measureContext = null;
    }
  }
  if (!measureContext) return text.length * 7;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

function topIds(entries: { id: number; width: number }[], count: number): number[] {
  return [...entries].sort((a, b) => b.width - a.width).slice(0, count).map((e) => e.id);
}

/**
 * The Player column is sized by the browser to its widest name, across every
 * row in the table. While rows are still being drawn in stages, the widest
 * one may not be drawn yet — the column (and everything right of it) would
 * then shift a few pixels when it arrives. So the likeliest-widest Player
 * cells among the undrawn rows are drawn as hidden, zero-height rows
 * (`.width-sizer-row`, visibility: collapse — they still count towards
 * column widths) until the real rows are all in. Candidates come from the
 * rows the table is showing (not the whole pool), so a search still narrows
 * the column exactly as it did before. The estimate only picks candidates;
 * the width itself is the browser's own measurement of the real cell.
 */
function useWidthSizerRows(filteredRows: { player: NormalizedPlayer }[], sortedRows: { player: NormalizedPlayer }[], renderedCount: number): NormalizedPlayer[] {
  // Only while rows are still being staged — a mode switch or filter with
  // every row already drawn needs no stand-ins, so skips the estimate.
  const staging = renderedCount < sortedRows.length;
  const candidates = useMemo(() => {
    if (!staging || filteredRows.length <= INITIAL_ROW_COUNT) return [];
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || "sans-serif";
    const nameFont = `600 12.5px ${family}`;
    const metaFont = `10.5px ${family}`;
    const byName = filteredRows.map(({ player }) => ({
      id: player.id,
      width: estimateTextWidth(player.name, nameFont) + (player.status !== "a" ? FLAG_ALLOWANCE_PX : 0),
    }));
    const byMeta = filteredRows.map(({ player }) => ({
      id: player.id,
      width: estimateTextWidth(`${fmtPercent(player.ownership)} · ${fmtPrice(player.price)} ${player.teamShortName} ${player.position}`, metaFont),
    }));
    const ids = new Set([...topIds(byName, SIZER_CANDIDATES_BY_NAME), ...topIds(byMeta, SIZER_CANDIDATES_BY_META)]);
    return filteredRows.filter((r) => ids.has(r.player.id)).map((r) => r.player);
  }, [filteredRows, staging]);

  return useMemo(() => {
    if (renderedCount >= sortedRows.length || candidates.length === 0) return [];
    const drawn = new Set(sortedRows.slice(0, renderedCount).map((r) => r.player.id));
    return candidates.filter((p) => !drawn.has(p.id));
  }, [candidates, sortedRows, renderedCount]);
}

export function PlayerExplorer() {
  const { players, teamsById, fixtures, advancedFieldAvailability, historicProfiles, historicStatus, currentSeasonHasStarted, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);

  // This page's own analysis mode, search and column filters — deliberately
  // not shared with any other page (see state/scoutingFilters.ts). There is
  // no criteria bar: Team, Position, Mins and every other filter is a
  // column filter below.
  const [, setSearchParams] = useSearchParams();
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("lastSeason");
  const [search, setSearch] = useState("");

  const columnFiltersState = useColumnFilters();

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

  // Derived metrics once per resolved player, before the search narrows
  // them — each row object then stays the same across searches, sorts and
  // filters, which lets ExplorerRow skip re-rendering rows that didn't change.
  const allRows = useMemo(() => resolvedPlayers.map((p) => ({ player: p, derived: getPlayerDerivedMetrics(p) })), [resolvedPlayers]);

  const rows = useMemo(() => {
    const query = search.trim();
    return query ? allRows.filter((r) => matchesPlayerSearch(r.player, query)) : allRows;
  }, [allRows, search]);

  const [showColumnPopover, setShowColumnPopover] = useState(false);
  const { sort, setSort, handleHeaderClick } = useSortSpec(EXPLORER_DEFAULT_SORT);

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
  } = useColumnCustomization(EXPLORER_DEFAULT_VISIBLE_COLUMNS, EXPLORER_MIN_COLUMN_WIDTHS, () => handleFitToBox());
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // A filter or sort on a column the user hides goes with it — either would
  // otherwise keep shaping the table with nothing on screen to say why.
  function handleToggleColumn(key: string) {
    if (visibleColumns.includes(key)) {
      columnFiltersState.clearFilter(key);
      setSort((prev) => sortWithoutHiddenColumn(prev, key, EXPLORER_DEFAULT_SORT));
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
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const stickyColRef = useRef<HTMLTableCellElement>(null);

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

  function getSortValue(row: { player: NormalizedPlayer; derived: PlayerDerivedMetrics }, key: string): number | string | null {
    if (key === POSITION_COLUMN_KEY) return POSITION_SORT_RANK[row.player.position];
    return getRowValue(row, key);
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
    () =>
      rows.filter((r) =>
        columnFiltersState.passesAllFilters(
          (key) => getRowValue(r, key),
          (key) => columnByKey(key)?.decimals,
        ),
      ),
    [rows, columnFiltersState.columnFilters],
  );

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      for (const s of sort) {
        const cmp = compareSortValues(getSortValue(a, s.key), getSortValue(b, s.key), s.direction, "belowZero");
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return arr;
  }, [filteredRows, sort]);

  /** Measures the sticky Player column and the fixed identity block (Ownership/Price/Team/Position), then hands only what's left over to the shared engine for the user-configurable columns. */
  function handleFitToBox() {
    fitOnce();
    // The auto-width Player/Own%/Team/Position block was just measured at
    // whatever width the old layout squeezed it to; once the new widths have
    // laid out, measure again so the flexible columns share exactly what's
    // left (otherwise the table overshoots and the browser trims every
    // column a few pixels, hand-resized ones included).
    requestAnimationFrame(() => requestAnimationFrame(fitOnce));
  }
  function fitOnce() {
    const container = tableWrapRef.current;
    const headerRow = stickyColRef.current?.parentElement;
    if (!container || !headerRow) return;
    // Player plus the fixed Own%/Price/Team/Position block, each at its
    // rendered width — or its hand-set width, if the browser has squeezed it
    // below that (read from the DOM, which is current even when this runs
    // from the once-registered resize listener).
    const fixedCells = Array.from(headerRow.children).slice(0, 1 + IDENTITY_COLUMNS.length) as HTMLElement[];
    const fixedWidth = fixedCells.reduce((sum, th) => sum + Math.max(th.getBoundingClientRect().width, parseFloat(th.style.width) || 0), 0);
    fitToBox(container.clientWidth - fixedWidth - 4);
  }

  // Column widths auto-fit the table's available width — on first load,
  // when the table empties or fills again (the Player column's width
  // follows the names in it), after a drag-resize, whenever the set of visible
  // columns changes (so toggling a column on/off never leaves the table
  // overflowing or oddly narrow), and on window resize. Deliberately keyed
  // on visibleColumns.length rather than the array itself: a plain reorder
  // (drag-and-drop) doesn't change the column count, so it shouldn't
  // re-trigger this and wipe out a manual per-column resize.
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

  // The user-configurable columns — a real PLAYER_COLUMNS entry, or the
  // special Fixtures key (renders fixture chips, not a number). Team/Position
  // never appear here — they're part of the fixed IDENTITY_COLUMNS block
  // above, never toggled into `visibleColumns` at all (see handleToggleColumn's
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
  // top would just be noise either way. Built from filteredRows (the same
  // players as sortedRows, before ordering) so a sort alone doesn't produce
  // new ranges and redraw every row.
  const columnRanges = useMemo(() => {
    const ranges = new Map<string, { min: number; max: number }>();
    for (const c of [...IDENTITY_COLUMNS, ...columnsInOrder]) {
      if (typeof c === "string") continue;
      const values = filteredRows.map((r) => c.getValue(r.player, r.derived)).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [columnsInOrder, filteredRows]);

  // Rows are drawn in stages (see useProgressiveRowCount); everything above
  // still works on the full sortedRows.
  const renderedRowCount = useProgressiveRowCount(sortedRows.length);
  const widthSizerRows = useWidthSizerRows(filteredRows, sortedRows, renderedRowCount);

  // Stable across renders, so memoized rows don't re-render just because
  // this page did; the ref keeps the call on the current setSearchParams.
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const openPlayer = useCallback((playerId: number) => {
    setSearchParamsRef.current((prev) => ({ ...Object.fromEntries(prev), player: String(playerId) }));
  }, []);

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
    return c.format(c.getValue(player, derived));
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
                {/* Ownership/Price/Team/Position aren't listed here at all — they're the fixed identity block (IDENTITY_COLUMNS), always shown, never toggleable. */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>
                    Other
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(FIXTURES_COLUMN_KEY)}
                      onChange={() => handleToggleColumn(FIXTURES_COLUMN_KEY)}
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
          <input
            id="pe-toolbar-search"
            type="text"
            placeholder="Player name…"
            aria-label="Search players"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="data-table resizable-columns">
            <thead>
              <tr>
                <th className="sticky-col" ref={stickyColRef} onClick={() => handleHeaderClick("name", false)} style={{ paddingRight: 6 }}>
                  Player
                </th>
                {IDENTITY_COLUMNS.map((c, idx) => {
                  const key = typeof c === "string" ? c : c.key;
                  const label = columnLabel(c);
                  const sortEntry = sort.find((s) => s.key === key);
                  const width = columnWidths[key];
                  const categoryOptions =
                    c === TEAM_COLUMN_KEY ? teamCategoryOptions : c === POSITION_COLUMN_KEY ? POSITION_OPTIONS : undefined;
                  // A second grey divider, tighter-spaced (6px either side rather than
                  // the standard 10px), separates the sticky Player column from this
                  // whole identity block — distinct from the one between this block
                  // and the user-configurable columns further along.
                  const isFirst = idx === 0;
                  return (
                    <th
                      key={key}
                      className={isFirst ? "col-static column-group-divider" : "col-static"}
                      onClick={(e) => handleHeaderClick(key, e.shiftKey)}
                      title="Always today's live figure, regardless of the toggle above · Click to sort · Shift-click to add secondary sort · Drag the right edge to resize"
                      style={{
                        position: "relative",
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        paddingLeft: isFirst ? 6 : undefined,
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
              {/* The header stays when nothing matches, so every column's ▾ is still there to change or clear its filter. */}
              {sortedRows.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={1 + IDENTITY_COLUMNS.length + columnsInOrder.length}>
                    {analysisMode !== "live" && historicStatus === "loading" ? (
                      // A number filter fails every "—", and every historic figure is "—" until the build finishes.
                      <div className="empty-state">
                        <h3>Building the historic dataset…</h3>
                        <p>This runs once per session and can take up to a minute — it'll be quick after that.</p>
                      </div>
                    ) : (
                      <div className="empty-state">
                        <h3>No players match your filters</h3>
                        <p>Try clearing the search or a column filter. This is a filter result, not an API error.</p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {sortedRows.slice(0, renderedRowCount).map(({ player, derived }) => (
                <ExplorerRow
                  key={player.id}
                  player={player}
                  derived={derived}
                  columnsInOrder={columnsInOrder}
                  columnWidths={columnWidths}
                  columnRanges={columnRanges}
                  fixtures={fixturesByTeamId.get(player.teamId) ?? NO_FIXTURES}
                  onOpenPlayer={openPlayer}
                />
              ))}
              {widthSizerRows.map((player) => (
                <tr key={`sizer-${player.id}`} className="width-sizer-row" aria-hidden="true">
                  <PlayerCell player={player} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="count-pill" style={{ marginTop: 10 }}>
        {sortedRows.length.toLocaleString("en-GB")}/{resolvedPlayers.length.toLocaleString("en-GB")} Players
      </div>
    </div>
  );
}
