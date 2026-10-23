import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useColumnCustomization } from "../state/useColumnCustomization";
import { useSortSpec, compareSortValues, sortWithinColumns, sortWithoutHiddenColumn, type SortSpec } from "../state/useSortSpec";
import { useColumnFilters } from "../state/useColumnFilters";
import { useComparativeColour } from "../state/comparativeColour";
import { ColumnHeader } from "../components/ColumnHeader";
import { columnHint, playerRankHint, PLAYER_STAT_HINTS, UNDERSTAT_STAT_HINTS } from "../components/hoverText";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getUpcomingFixtures, formatFixturesForCsv, type UpcomingFixture } from "../metrics/fixtureTicker";
import { AnalysisModeToggle } from "../components/AnalysisModeToggle";
import { PositionBadge, TeamBadge, AvailabilityFlag, availabilityTextClass, FixtureChips } from "../components/primitives";
import { PLAYER_COLUMNS, cellText, columnByKey, columnForMode, isStaticColumn, rankValue, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { IconChipButton, ResetIcon, ColumnsIcon, FilterIcon, DownloadIcon } from "../components/IconToolbar";
import { fmtPercent, fmtPrice } from "../utils/format";
import { percentileTint } from "../utils/colorScale";
import { colourDirection, fixtureDifficultyRanks, positionRanks } from "../metrics/comparativeColour";
import { downloadCsv } from "../utils/csvExport";
import { filterBySearch } from "../utils/playerSearch";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { HideSmallSamplesButton, isSmallSample, MinutesFloorBadge, RowSmallSampleBadge, smallSamplesShownNote, userMinimumNote } from "../components/MinutesFloorBadge";
import type { ColumnFilterSpec } from "../state/useColumnFilters";
import { useProgressiveRowCount, INITIAL_ROW_COUNT } from "../state/useProgressiveRowCount";
import type { NormalizedPlayer, Position } from "../types/normalized";
import { ColumnsPopover, MenuGroupHeading, fplHeading } from "../components/MenuControls";
import { headerMinWidth } from "../components/headerWidth";
import { CrossoverGroupHeading, SourceStaleMarker, SourceToggle } from "../components/SourceToggle";
import { FPL_SOURCE, useExternalStats, type ColumnSourceChoice } from "../extensions/externalStats";
import { explorerViewToApply, useExplorerViews, type ExplorerView, type ExplorerViewSettings } from "../state/useExplorerViews";
import { ExplorerViewNotice, ExplorerViewsMenu, explorerViewNote } from "../components/ExplorerViewsMenu";

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
/** Every sortable key on screen straight after Reset: the player name, the fixed columns and the default columns. */
const EXPLORER_KEYS_AFTER_RESET = new Set<string>(["name", ...FIXED_COLUMN_KEYS, ...EXPLORER_DEFAULT_VISIBLE_COLUMNS]);
/** Always on screen, so never in a saved view's visibleColumns: the player name and the fixed block. */
const EXPLORER_ALWAYS_SHOWN_KEYS = new Set<string>(["name", ...FIXED_COLUMN_KEYS]);
const EXPLORER_UNSORTABLE_KEYS = new Set<string>([FIXTURES_COLUMN_KEY]);

/** The minimum a Mins column filter sets ("≥" or "="), or null when it sets none — what its header's amber stopwatch names (<minutes_marker>). */
function minutesFilterMinimum(spec: ColumnFilterSpec | undefined): number | null {
  const min = spec?.gte ?? spec?.eq ?? null;
  return min !== null && min > 0 ? min : null;
}

/** Per column key, each player's rank within his position (<comparative_colouring>). */
type ColumnRanks = Map<string, Map<number, number>>;
/** Shared empty list, so a team with no fixtures doesn't hand its rows a new array (and a re-render) every time. */
const NO_FIXTURES: UpcomingFixture[] = [];

function columnTint(ranks: ColumnRanks, player: NormalizedPlayer, c: PlayerColumn): string | undefined {
  return percentileTint(ranks.get(c.key)?.get(player.id));
}

/** What a cell's colour means for him: "xG: top 8% of midfielders" (<hover_text>). */
function columnRankHint(ranks: ColumnRanks, player: NormalizedPlayer, c: PlayerColumn): string | undefined {
  return playerRankHint(ranks.get(c.key)?.get(player.id), player.position, c.label);
}

/** The sticky Player cell — shared by real rows and the width-sizer rows, so both measure exactly the same. */
function PlayerCell({ player, mode }: { player: NormalizedPlayer; mode: AnalysisMode }) {
  return (
    <td className="sticky-col">
      <div className="player-name-cell">
        <span className={`name ${availabilityTextClass(player.status)}`}>
          {player.name}
          <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
          <RowSmallSampleBadge minutes={player.minutes} mode={mode} />
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
  /** The Data View, for the row's small-sample marker. */
  mode: AnalysisMode;
  columnsInOrder: (PlayerColumn | typeof FIXTURES_COLUMN_KEY)[];
  columnWidths: Record<string, number>;
  columnRanks: ColumnRanks;
  fixtures: UpcomingFixture[];
  /** His club's next-fixtures difficulty colour (a club figure, ranked among clubs). */
  fixturesTint: string | undefined;
  onOpenPlayer: (playerId: number) => void;
}

/** One table row. Memoized: opening a filter, dragging a header or adding more staged rows leaves the rows already drawn alone. */
const ExplorerRow = React.memo(function ExplorerRow({ player, derived, mode, columnsInOrder, columnWidths, columnRanks, fixtures, fixturesTint, onOpenPlayer }: ExplorerRowProps) {
  // Memoized, so it subscribes itself to repaint when comparative colouring is switched (<comparative_colour_switch>).
  useComparativeColour();
  return (
    <tr onClick={() => onOpenPlayer(player.id)}>
      <PlayerCell player={player} mode={mode} />
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
        return (
          <td key={c.key} className={className} style={{ ...widthStyle, backgroundColor: columnTint(columnRanks, player, c) }} title={columnRankHint(columnRanks, player, c)}>
            {cellText(c, player, derived)}
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
              <FixtureChips fixtures={fixtures} avgTint={fixturesTint} />
            </td>
          );
        }
        const width = columnWidths[c.key];
        return (
          <td
            key={c.key}
            className={dividerClass}
            style={{
              ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
              backgroundColor: columnTint(columnRanks, player, c),
            }}
            title={columnRankHint(columnRanks, player, c)}
          >
            {cellText(c, player, derived)}
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
  // <hide_small_samples>: off by default, per page like every other filter.
  const [hideSmallSamples, setHideSmallSamples] = useState(false);

  const columnFiltersState = useColumnFilters();

  // A second data source (Understat), when one is mounted: its own columns,
  // and its version of figures FPL also has, picked per column by the
  // header's source toggle (FPL by default). Every column lookup on this
  // page goes through lookupColumn, so a toggled column's value, sort,
  // filter, tint and export all come from the one source.
  const ext = useExternalStats();
  useEffect(() => {
    ext?.request();
  }, [ext]);
  const extColumns = useMemo(() => ext?.playerColumns(analysisMode) ?? null, [ext, analysisMode]);
  const extOnlyByKey = useMemo(() => new Map((extColumns?.groups ?? []).flatMap((g) => g.columns).map((c) => [c.key, c])), [extColumns]);
  /** FPL columns the second source also has (the ⇄ ones): listed under their own picker heading while it's mounted. */
  const crossoverKeys = useMemo(() => new Set(ext && extColumns ? Object.keys(extColumns.alternates) : []), [ext, extColumns]);
  const [sourceChoice, setSourceChoice] = useState<ColumnSourceChoice>({});
  const lookupColumn = useCallback(
    (key: string): PlayerColumn | undefined => {
      const c = ext && extColumns && sourceChoice[key] === ext.id && extColumns.alternates[key] ? extColumns.alternates[key] : (columnByKey(key) ?? extOnlyByKey.get(key));
      // As this Data View shows it (<averaged_counts>): a Historic Average count has 1 decimal, its filter included.
      return c && columnForMode(c, analysisMode);
    },
    [ext, extColumns, sourceChoice, extOnlyByKey, analysisMode],
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


  // Every column's floor fits its header's longest word (<header_floor>;
  // a source toggle wraps under it like the sort arrow); Next 5 Fixtures
  // keeps its own larger one.
  const explorerMinWidths = useMemo(() => {
    const widths: Record<string, number> = { ...EXPLORER_MIN_COLUMN_WIDTHS };
    for (const c of [...PLAYER_COLUMNS, ...extOnlyByKey.values()]) widths[c.key] = Math.max(widths[c.key] ?? 0, headerMinWidth(c.label));
    return widths;
  }, [extOnlyByKey]);

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
    return query ? filterBySearch(allRows, query, (r) => r.player) : allRows;
  }, [allRows, search]);

  const [showColumnPopover, setShowColumnPopover] = useState(false);
  // <natural_first_click>: names and clubs A to Z, Position in pitch order (its first, descending, click), a lower-is-better figure lowest first.
  const { sort, setSort, handleHeaderClick } = useSortSpec(EXPLORER_DEFAULT_SORT, (key) =>
    key === "name" || key === TEAM_COLUMN_KEY ? "asc" : key === POSITION_COLUMN_KEY ? "desc" : lookupColumn(key)?.higherIsBetter === false ? "asc" : "desc",
  );

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
    manualWidths,
    applyLayout,
  } = useColumnCustomization(EXPLORER_DEFAULT_VISIBLE_COLUMNS, explorerMinWidths, () => handleFitToBox());
  const headerLayout = { dragOverKey, setDragOverKey, reorderColumn, resizingKey, startResize };
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
    const col = lookupColumn(key);
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

  const columnFilteredRows = useMemo(
    () =>
      rows.filter((r) =>
        columnFiltersState.passesAllFilters(
          (key) => getRowValue(r, key),
          (key) => lookupColumn(key)?.decimals,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, columnFiltersState.columnFilters, lookupColumn],
  );
  // The rows under the minutes threshold (the amber stopwatch) among those the filters leave: what the Hide button
  // leaves out, and — while shown — what turns the page's stopwatches amber (<marker_follows_data>).
  const smallSampleCount = useMemo(() => columnFilteredRows.filter((r) => isSmallSample(r.player.minutes, analysisMode)).length, [columnFilteredRows, analysisMode]);
  const filteredRows = useMemo(
    () => (hideSmallSamples ? columnFilteredRows.filter((r) => !isSmallSample(r.player.minutes, analysisMode)) : columnFilteredRows),
    [columnFilteredRows, hideSmallSamples, analysisMode],
  );
  const shownSmallSampleCount = hideSmallSamples ? 0 : smallSampleCount;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, sort, lookupColumn]);

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

  // Saved views (<explorer_views>): snapshots of everything above, loaded
  // only when picked. `viewLoads` re-fits the columns after a load, which
  // can bring new hand-set widths without changing the column count.
  const explorerViews = useExplorerViews("player");
  const [viewNote, setViewNote] = useState<string | null>(null);
  const [viewLoads, setViewLoads] = useState(0);

  function currentViewSettings(): ExplorerViewSettings {
    return {
      analysisMode,
      visibleColumns,
      columnWidths: manualWidths(),
      sort,
      columnFilters: columnFiltersState.columnFilters,
      // Only the columns switched away from FPL, the default.
      sourceChoice: Object.fromEntries(Object.entries(sourceChoice).filter(([, source]) => source !== FPL_SOURCE)),
      search,
      hideSmallSamples,
    };
  }

  function loadView(view: ExplorerView) {
    const { settings, leftOut } = explorerViewToApply(view.settings, {
      isKnownColumn: (key) => key === FIXTURES_COLUMN_KEY || !!(columnByKey(key) ?? extOnlyByKey.get(key)),
      fixedKeys: EXPLORER_ALWAYS_SHOWN_KEYS,
      unsortableKeys: EXPLORER_UNSORTABLE_KEYS,
      categoryOptions: { [TEAM_COLUMN_KEY]: teamCategoryOptions, [POSITION_COLUMN_KEY]: POSITION_OPTIONS },
      externalSourceId: ext?.id ?? null,
      canSwitchSource: (key) => !!extColumns?.alternates[key],
      defaultSort: EXPLORER_DEFAULT_SORT,
    });
    setAnalysisMode(settings.analysisMode);
    applyLayout(settings.visibleColumns, settings.columnWidths);
    setSort(settings.sort);
    columnFiltersState.replaceAllFilters(settings.columnFilters);
    setSourceChoice(settings.sourceChoice);
    setSearch(settings.search);
    setHideSmallSamples(settings.hideSmallSamples);
    setViewLoads((n) => n + 1);
    setViewNote(explorerViewNote(view.name, leftOut));
  }

  // Column widths auto-fit the table's available width — on first load,
  // when the table empties or fills again (the Player column's width
  // follows the names in it), after a drag-resize, whenever the set of visible
  // columns changes (so toggling a column on/off never leaves the table
  // overflowing or oddly narrow), after a saved view loads, and on window resize. Deliberately keyed
  // on visibleColumns.length rather than the array itself: a plain reorder
  // (drag-and-drop) doesn't change the column count, so it shouldn't
  // re-trigger this and wipe out a manual per-column resize.
  useEffect(() => {
    handleFitToBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows.length > 0, visibleColumns.length, viewLoads]);

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
        .map((key) => (key === FIXTURES_COLUMN_KEY ? key : lookupColumn(key)))
        .filter((c): c is PlayerColumn | typeof FIXTURES_COLUMN_KEY => !!c),
    [visibleColumns, lookupColumn],
  );

  function toggleColumnSource(key: string) {
    if (!ext) return;
    // A filter set on one source's figures doesn't carry over to the other's.
    columnFiltersState.clearFilter(key);
    setSourceChoice((prev) => ({ ...prev, [key]: prev[key] === ext.id ? FPL_SOURCE : ext.id }));
  }

  // Each column's colour (<comparative_colouring>): every player ranked
  // within his position among the whole pool for this Data View (allRows —
  // never the rows a search or filter leaves), anyone under the fixed floor
  // left out and uncoloured. So a player's colour doesn't change as the
  // table is narrowed, and matches his profile's. Covers the fixed columns
  // too (Ownership, Price: less is better); Team and Position are
  // categories, and Fixtures has its own club-ranked colour.
  const columnRanks = useMemo(() => {
    const ranks: ColumnRanks = new Map();
    for (const c of [...IDENTITY_COLUMNS, ...columnsInOrder]) {
      if (typeof c === "string") continue;
      const higherIsBetter = colourDirection(c);
      if (higherIsBetter === null) continue;
      ranks.set(
        c.key,
        positionRanks(allRows, {
          id: (r) => r.player.id,
          position: (r) => r.player.position,
          minutes: (r) => r.player.minutes,
          mode: analysisMode,
          value: (r) => rankValue(c, r.player, r.derived),
          higherIsBetter,
        }),
      );
    }
    return ranks;
  }, [columnsInOrder, allRows, analysisMode]);
  const fixtureRanks = useMemo(() => fixtureDifficultyRanks(fixturesByTeamId), [fixturesByTeamId]);

  const nameSort = sort.find((s) => s.key === "name");

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
    return cellText(c, player, derived);
  }

  // Matches exactly what's on screen — same rows (filtered/sorted), same
  // columns in the same order (Player's name, then the fixed Ownership/
  // Price/Team/Position block, then the user-configurable columns), same
  // formatted values (— for unavailable) — so the export is never a
  // surprise relative to the table it was taken from.
  function handleExportCsv() {
    const exportLabel = (c: PlayerColumn | typeof FIXTURES_COLUMN_KEY) =>
      typeof c !== "string" && ext && c.sourceId === ext.id ? `${columnLabel(c)} (${ext.label})` : columnLabel(c);
    const headers = ["Player", ...IDENTITY_COLUMNS.map(columnLabel), ...columnsInOrder.map(exportLabel)];
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

      <AnalysisModeToggle mode={analysisMode} onChange={setAnalysisMode} floorActive={shownSmallSampleCount > 0} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div className="icon-toolbar">
          <IconChipButton
            icon={<ResetIcon />}
            label="Restore the default columns, order, and natural widths, and clear every filter"
            onClick={() => {
              resetColumns();
              setSort((prev) => sortWithinColumns(prev, EXPLORER_KEYS_AFTER_RESET, EXPLORER_DEFAULT_SORT));
              setSourceChoice({});
              setSearch("");
              setHideSmallSamples(false);
              columnFiltersState.resetAllFilters();
              setViewNote(null);
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
              <ColumnsPopover style={{ left: 0, right: "auto" }}>
                {/* Ownership/Price/Team/Position aren't listed here at all — they're the fixed identity block (IDENTITY_COLUMNS), always shown, never toggleable. */}
                <div>
                  <MenuGroupHeading group="Other" label={fplHeading("Other")} className="col-source-fpl" />
                  <label>
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(FIXTURES_COLUMN_KEY)}
                      onChange={() => handleToggleColumn(FIXTURES_COLUMN_KEY)}
                    />
                    Next 5 Fixtures
                  </label>
                </div>
                {/* Three kinds of heading, by source: green FPL only, the crossover colour for figures both sources have (⇄ on the header), then the second source's own. */}
                {GROUPS.map((group) => (
                  <div key={group}>
                    <MenuGroupHeading group={group} label={fplHeading(group)} className="col-source-fpl" />
                    {PLAYER_COLUMNS.filter((c) => c.group === group && !FIXED_COLUMN_KEYS.has(c.key) && !crossoverKeys.has(c.key)).map((c) => (
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
                    {PLAYER_COLUMNS.filter((c) => crossoverKeys.has(c.key)).map((c) => (
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
              </ColumnsPopover>
            )}
          </div>
          <IconChipButton
            icon={<FilterIcon />}
            label="Clear every filter: the search box, every column filter and Hide"
            onClick={() => {
              setSearch("");
              setHideSmallSamples(false);
              columnFiltersState.resetAllFilters();
            }}
          />
          <ExplorerViewsMenu
            pageName="Player Explorer"
            views={explorerViews.views}
            placeholder="e.g. Budget Midfielders"
            onSave={(name) => explorerViews.save(name, currentViewSettings())}
            onLoad={loadView}
            onOverwrite={(view) => explorerViews.overwrite(view.id, currentViewSettings())}
            onDelete={(view) => explorerViews.remove(view.id)}
          />
          <HideSmallSamplesButton hidden={hideSmallSamples} count={smallSampleCount} mode={analysisMode} onToggle={() => setHideSmallSamples((h) => !h)} />
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

      <ExplorerViewNotice note={viewNote} onDismiss={() => setViewNote(null)} />

      {advancedFieldAvailability && !advancedFieldAvailability.defensive_contribution && (
        <div className="banner info">
          Defensive Contributions is not present on this build of the live API, so affected columns show "—". See the User Guide's
          metric reference for details.
        </div>
      )}

      <div className="page-fill-body">
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="data-table resizable-columns wrap-headers">
            <thead>
              <tr>
                <th
                  className="sticky-col"
                  ref={stickyColRef}
                  onClick={(e) => handleHeaderClick("name", e.shiftKey)}
                  // 1px means "as narrow as its content" — see the identity headers below.
                  style={{ width: 1 }}
                >
                  Player
                  {nameSort && <span className="sort-indicator">{nameSort.direction === "asc" ? "↑" : "↓"}</span>}
                </th>
                {IDENTITY_COLUMNS.map((c, idx) => {
                  const key = typeof c === "string" ? c : c.key;
                  const label = columnLabel(c);
                  const sortEntry = sort.find((s) => s.key === key);
                  const width = columnWidths[key];
                  const categoryOptions =
                    c === TEAM_COLUMN_KEY ? teamCategoryOptions : c === POSITION_COLUMN_KEY ? POSITION_OPTIONS : undefined;
                  // A second grey divider separates the sticky Player column from this
                  // whole identity block — distinct from the one between this block
                  // and the user-configurable columns further along.
                  const isFirst = idx === 0;
                  return (
                    <ColumnHeader
                      key={key}
                      columnKey={key}
                      label={label}
                      className={isFirst ? "col-static column-group-divider" : "col-static"}
                      title={typeof c === "string" ? (c === TEAM_COLUMN_KEY ? "Team: his club. Click a badge for the club's profile." : "Position: his FPL position.") : columnHint(c.label, { hint: PLAYER_STAT_HINTS[c.key], lowerIsBetter: c.higherIsBetter === false, liveFigure: true })}
                      layout={headerLayout}
                      width={width}
                      // Unless hand-set, 1px means "as narrow as its content": without it
                      // this block and Player take a share of the table's spare width on
                      // the first layout, and fitOnce then measures (and keeps) that
                      // inflated width (same fix as Team Explorer's Team column).
                      narrowUnlessSet
                      draggable={false}
                      sortDirection={sortEntry?.direction}
                      onSort={(shiftKey) => handleHeaderClick(key, shiftKey)}
                      filters={columnFiltersState}
                      categoryOptions={categoryOptions}
                      style={{ paddingLeft: isFirst ? 6 : undefined }}
                    />
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
                  // The colour index: FPL figures that follow the Data View are green, always-live ones muted red,
                  // a second source's figures its own colour (violet for Understat).
                  const fromExt = !isSpecial && !!ext && c.sourceId === ext.id;
                  const canSwitchSource = !isSpecial && !!ext && !!extColumns?.alternates[key];
                  // Grey divider between the fixed Ownership/Price/Team/Position block and these user-configurable columns — only the first one carries it.
                  const className =
                    [isStatic && "col-static", !isStatic && !fromExt && "col-source-fpl", fromExt && ext.className, idx === 0 && "column-group-divider"].filter(Boolean).join(" ") || undefined;
                  return (
                    <ColumnHeader
                      key={key}
                      columnKey={key}
                      label={label}
                      className={className}
                      title={
                        isFixtures
                          ? "Next 5 Fixtures: his club's next 5 matches, coloured by FPL difficulty, with their average."
                          : columnHint((c as PlayerColumn).label, {
                              hint: fromExt ? UNDERSTAT_STAT_HINTS[key] : PLAYER_STAT_HINTS[key],
                              source: fromExt ? ext.label : undefined,
                              lowerIsBetter: (c as PlayerColumn).higherIsBetter === false,
                              liveFigure: isStatic,
                            })
                      }
                      layout={headerLayout}
                      width={width}
                      sortDirection={sortEntry?.direction}
                      onSort={isFixtures ? undefined : (shiftKey) => handleHeaderClick(key, shiftKey)}
                      filters={isFixtures ? undefined : columnFiltersState}
                      badges={
                        key === "minutes" &&
                        minutesFilterMinimum(columnFiltersState.columnFilters[key]) !== null && (
                          <MinutesFloorBadge
                            note={smallSamplesShownNote(userMinimumNote(minutesFilterMinimum(columnFiltersState.columnFilters[key])!, analysisMode), shownSmallSampleCount, analysisMode)}
                            active={shownSmallSampleCount > 0}
                          />
                        )
                      }
                      trailing={
                        <>
                          {canSwitchSource && <SourceToggle showingExternal={fromExt} externalLabel={ext.label} onToggle={() => toggleColumnSource(key)} />}
                          {fromExt && ext.staleNote && <SourceStaleMarker note={ext.staleNote} />}
                        </>
                      }
                      style={{ textAlign: isFixtures ? "left" : undefined }}
                    />
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
                        <p>This runs once per session and can take up to a minute; after that it's quick.</p>
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
                  mode={analysisMode}
                  columnsInOrder={columnsInOrder}
                  columnWidths={columnWidths}
                  columnRanks={columnRanks}
                  fixtures={fixturesByTeamId.get(player.teamId) ?? NO_FIXTURES}
                  fixturesTint={percentileTint(fixtureRanks.get(player.teamId))}
                  onOpenPlayer={openPlayer}
                />
              ))}
              {widthSizerRows.map((player) => (
                <tr key={`sizer-${player.id}`} className="width-sizer-row" aria-hidden="true">
                  <PlayerCell player={player} mode={analysisMode} />
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
