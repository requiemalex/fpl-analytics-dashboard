import { useCallback } from "react";
import { isAnalysisMode, type AnalysisMode } from "../metrics/resolvePlayerStats";
import type { ColumnSourceChoice } from "../extensions/externalStats";
import { EMPTY_COLUMN_FILTER, type ColumnFilterSpec } from "./useColumnFilters";
import type { SortSpec } from "./useSortSpec";
import { mapReadableEntries, type VersionedStore, usePersistentState } from "./persistentStorage";

/** One store per Explorer, so the two pages never write each other's views. */
const STORAGE_KEYS = {
  player: "scoutline:player-explorer:saved-views:v1",
  team: "scoutline:team-explorer:saved-views:v1",
} as const;
const STORAGE_VERSION = 1;

export type ExplorerScope = keyof typeof STORAGE_KEYS;

/**
 * Everything an Explorer's table is set to: what a saved view puts back.
 * Column keys are kept as saved, including ones this version (or the
 * second source being off) can't show; the page leaves those out on load
 * and says so (<explorer_view_load>), so the view itself loses nothing.
 */
export interface ExplorerViewSettings {
  analysisMode: AnalysisMode;
  /** The user-configurable columns, in order. */
  visibleColumns: string[];
  /** Hand-set (dragged) widths only; every other column fits the window on load, as it would after a drag. */
  columnWidths: Record<string, number>;
  sort: SortSpec[];
  columnFilters: Record<string, ColumnFilterSpec>;
  /** Which ⇄ columns show the second source. Applied only by loading a view: the page itself still opens on FPL each visit. */
  sourceChoice: ColumnSourceChoice;
  search: string;
  /** Player Explorer's Hide (<hide_small_samples>); always false for Team Explorer, which has none. */
  hideSmallSamples: boolean;
}

export interface ExplorerView {
  id: string;
  name: string;
  settings: ExplorerViewSettings;
  updatedAt: number;
}

/** The same limit as a Dashboard scope's views, Player Comparison's views and saved squads. No packaged view counts towards it: Reset already restores the defaults. */
export const MAX_EXPLORER_VIEWS = 5;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
const numberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function normalizeFilter(raw: unknown): ColumnFilterSpec | null {
  if (!isRecord(raw)) return null;
  const spec: ColumnFilterSpec = {
    ...EMPTY_COLUMN_FILTER,
    lte: numberOrNull(raw.lte),
    gte: numberOrNull(raw.gte),
    eq: numberOrNull(raw.eq),
    category: typeof raw.category === "string" ? raw.category : null,
  };
  return spec.lte === null && spec.gte === null && spec.eq === null && spec.category === null ? null : spec;
}

/** Saved settings in the current shape: anything unreadable is dropped field by field, so a damaged entry still loads what it can. */
export function normalizeExplorerViewSettings(raw: unknown): ExplorerViewSettings {
  const s = isRecord(raw) ? raw : {};
  const visibleColumns = [...new Set(strings(s.visibleColumns))];
  const columnWidths: Record<string, number> = {};
  if (isRecord(s.columnWidths)) {
    for (const [key, width] of Object.entries(s.columnWidths)) {
      if (typeof width === "number" && Number.isFinite(width) && width > 0) columnWidths[key] = Math.round(width);
    }
  }
  const sort: SortSpec[] = Array.isArray(s.sort)
    ? s.sort.filter((e): e is SortSpec => isRecord(e) && typeof e.key === "string" && (e.direction === "asc" || e.direction === "desc")).map((e) => ({ key: e.key, direction: e.direction }))
    : [];
  const columnFilters: Record<string, ColumnFilterSpec> = {};
  if (isRecord(s.columnFilters)) {
    for (const [key, spec] of Object.entries(s.columnFilters)) {
      const filter = normalizeFilter(spec);
      if (filter) columnFilters[key] = filter;
    }
  }
  const sourceChoice: ColumnSourceChoice = {};
  if (isRecord(s.sourceChoice)) {
    for (const [key, source] of Object.entries(s.sourceChoice)) if (typeof source === "string") sourceChoice[key] = source;
  }
  return {
    analysisMode: isAnalysisMode(s.analysisMode) ? s.analysisMode : "lastSeason",
    visibleColumns,
    columnWidths,
    sort,
    columnFilters,
    sourceChoice,
    search: typeof s.search === "string" ? s.search : "",
    hideSmallSamples: s.hideSmallSamples === true,
  };
}

function normalizeExplorerView(raw: Record<string, unknown>): ExplorerView | null {
  if (typeof raw.id !== "string" || raw.id === "" || typeof raw.name !== "string") return null;
  return { id: raw.id, name: raw.name, settings: normalizeExplorerViewSettings(raw.settings), updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0 };
}

const VIEWS_STORE: VersionedStore<ExplorerView[]> = {
  version: STORAGE_VERSION,
  fallback: [],
  migrate(data) {
    if (!Array.isArray(data)) return null;
    return mapReadableEntries(data, normalizeExplorerView);
  },
};

export interface ExplorerViewContext {
  /** A configurable column this page can show now (its own catalogue, or a second source's while one is mounted). */
  isKnownColumn: (key: string) => boolean;
  /** Always on screen, never in `visibleColumns`: the name column, and Player Explorer's Own%/Price/Team/Position block. */
  fixedKeys: ReadonlySet<string>;
  /** Shown but neither sorted nor filtered (Next 5 Fixtures). */
  unsortableKeys?: ReadonlySet<string>;
  /** A category column's choices now (Team: today's 20 clubs); a saved choice no longer among them is left out. */
  categoryOptions?: Record<string, readonly string[]>;
  /** The mounted second source's id, or null with none. */
  externalSourceId: string | null;
  /** Whether a column has the ⇄ toggle now. */
  canSwitchSource: (key: string) => boolean;
  defaultSort: SortSpec[];
}

/**
 * <explorer_view_load>: the part of a saved view this page can show now,
 * and what was left out, in words for the page's notice (graceful
 * degradation: a view saved with a column this version doesn't have, or
 * with the second source since switched off, still loads). Hidden-column
 * rules hold as when hiding one by hand: a filter or sort only on a column
 * on screen, the default sort if none is left. A filter set on one
 * source's figures goes when that column has to show the other's
 * (<one_source_per_figure>).
 */
export function explorerViewToApply(saved: ExplorerViewSettings, ctx: ExplorerViewContext): { settings: ExplorerViewSettings; leftOut: string[] } {
  const configurable = saved.visibleColumns.filter((key) => !ctx.fixedKeys.has(key));
  const visibleColumns = configurable.filter(ctx.isKnownColumn);
  const missingColumns = configurable.length - visibleColumns.length;
  const onScreen = new Set([...ctx.fixedKeys, ...visibleColumns]);
  const usable = (key: string) => onScreen.has(key) && !ctx.unsortableKeys?.has(key);

  const sourceChoice: ColumnSourceChoice = {};
  const lostSource = new Set<string>();
  for (const [key, source] of Object.entries(saved.sourceChoice)) {
    if (!onScreen.has(key)) continue;
    if (ctx.externalSourceId !== null && source === ctx.externalSourceId && ctx.canSwitchSource(key)) sourceChoice[key] = source;
    else lostSource.add(key);
  }

  const columnFilters: Record<string, ColumnFilterSpec> = {};
  const lostCategories: string[] = [];
  for (const [key, spec] of Object.entries(saved.columnFilters)) {
    if (!usable(key) || lostSource.has(key)) continue;
    const options = ctx.categoryOptions?.[key];
    if (spec.category !== null && options && !options.includes(spec.category)) {
      lostCategories.push(spec.category);
      continue;
    }
    columnFilters[key] = spec;
  }

  const kept = saved.sort.filter((s) => usable(s.key));
  const sort = kept.length > 0 ? kept : ctx.defaultSort.filter((s) => usable(s.key));

  const columnWidths = Object.fromEntries(Object.entries(saved.columnWidths).filter(([key]) => onScreen.has(key)));

  const leftOut: string[] = [];
  if (missingColumns > 0) leftOut.push(`${missingColumns} column${missingColumns === 1 ? "" : "s"} not available now`);
  for (const category of lostCategories) leftOut.push(`the filter on ${category}, no longer in the league`);
  if (lostSource.size > 0) leftOut.push(`${lostSource.size} column${lostSource.size === 1 ? "" : "s"} saved on another source, shown from FPL`);

  return { settings: { ...saved, visibleColumns, columnWidths, sort, columnFilters, sourceChoice }, leftOut };
}

export interface UseExplorerViews {
  views: ExplorerView[];
  /** Adds a view of these settings; returns its id. Name and cap checks are the caller's. */
  save: (name: string, settings: ExplorerViewSettings) => string;
  /** Replaces a view's settings with these, keeping its name. */
  overwrite: (id: string, settings: ExplorerViewSettings) => void;
  remove: (id: string) => void;
}

/**
 * An Explorer's saved views: named snapshots of its table (<explorer_views>).
 * Unlike the Dashboard's and Player Comparison's views, which save every
 * edit while picked, these change only when saved or saved over (the
 * owner's choice, 2026-10-20): an Explorer is for trying filters out, and
 * every quick search or sort would otherwise rewrite the view. The page
 * still opens on its defaults each visit; a view applies only when loaded.
 * localStorage only, like every other saved setting.
 */
export function useExplorerViews(scope: ExplorerScope): UseExplorerViews {
  const [views, setViews] = usePersistentState(STORAGE_KEYS[scope], VIEWS_STORE);

  const save = useCallback((name: string, settings: ExplorerViewSettings) => {
    const id = `explorer-view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setViews((prev) => [...prev, { id, name, settings, updatedAt: Date.now() }]);
    return id;
  }, []);

  const overwrite = useCallback((id: string, settings: ExplorerViewSettings) => {
    setViews((prev) => prev.map((v) => (v.id === id ? { ...v, settings, updatedAt: Date.now() } : v)));
  }, []);

  const remove = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  return { views, save, overwrite, remove };
}
