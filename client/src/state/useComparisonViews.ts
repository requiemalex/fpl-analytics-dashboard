import { useCallback, useEffect, useMemo, useState } from "react";
import { isAnalysisMode, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:comparison:views:v1";
/**
 * Bumped 1 -> 2 when each card gained its own `minMinutes` (Min Minutes, set
 * in the Add/Edit dialog, as a Dashboard tile has). A card stored under
 * version 1 had no minimum of its own, so migrate() gives it 0 — the app
 * adds no floor where the user can set one (<fixed_minutes_floor>).
 */
const STORAGE_VERSION = 2;
const SELECTED_VIEW_STORAGE_KEY = "fpl-dashboard:comparison:selected-view:v1";
const SELECTED_VIEW_STORAGE_VERSION = 1;

/** radar: Charts section; outputs: Outputs section; trend: Trends section. */
export type ComparisonElementKind = "radar" | "outputs" | "trend";

export const COMPARISON_ELEMENT_KINDS: ComparisonElementKind[] = ["radar", "outputs", "trend"];

export interface ComparisonElementConfig {
  id: string;
  kind: ComparisonElementKind;
  /** Title shown on the card — required when the element is built. */
  name: string;
  /** radar/outputs: the analysis mode their figures come from. Null for a trend, which always spans every completed season. */
  dataView: AnalysisMode | null;
  /** radar: its axes; outputs: its rows; trend: one key, its y axis. Metric keys this version doesn't know are kept, and the card says so. */
  metricKeys: string[];
  /**
   * This card's Min Minutes (0 = none). A compared player below it is
   * greyed on this card only; a radar also ranks only players at or above
   * it; a trend season below it is a marked dip. Ignored on the Starter
   * view, which applies the fixed floor instead (<fixed_minutes_floor>).
   */
  minMinutes: number;
}

export interface ComparisonView {
  id: string;
  name: string;
  elements: ComparisonElementConfig[];
  updatedAt: number;
}

/** Starter and My View included — the same limit as a Dashboard scope's saved views. */
export const MAX_COMPARISON_VIEWS = 5;
/** Per section (Charts, Outputs, Trends) of one view. */
export const MAX_ELEMENTS_PER_SECTION = 6;

export const COMPARISON_STARTER_VIEW_ID = "comparison-starter";
export const COMPARISON_MY_VIEW_ID = "comparison-my-view";

function starterElement(kind: ComparisonElementKind, n: number, name: string, dataView: AnalysisMode | null, metricKeys: string[]): ComparisonElementConfig {
  return { id: `starter-${kind}-${n}`, kind, name, dataView, metricKeys, minMinutes: 0 };
}

/**
 * The packaged, read-only view: a set of comparisons that works for any
 * players the moment they're added — attacking and defensive shape, last
 * season's and this season's output side by side, and three career trends.
 */
const STARTER_VIEW: ComparisonView = {
  id: COMPARISON_STARTER_VIEW_ID,
  name: "Starter",
  updatedAt: 0,
  elements: [
    starterElement("radar", 1, "Attacking Shape", "lastSeason", ["totalPoints", "goals", "assists", "xGPerGame", "xAPerGame", "ictIndex"]),
    starterElement("radar", 2, "Defensive Shape", "lastSeason", ["cleanSheets", "xGCPerGame", "defensiveContributionsPerGame", "bps", "bonus"]),
    starterElement("outputs", 1, "Last Season Output", "lastSeason", [
      "totalPoints",
      "pointsPerGame",
      "goals",
      "assists",
      "bonus",
      "xGIPerGame",
      "xGPerGame",
      "xAPerGame",
      "pointsPerMillion",
      "xGIPerMillion",
    ]),
    starterElement("outputs", 2, "This Season So Far", "live", [
      "totalPoints",
      "pointsPerGame",
      "goals",
      "assists",
      "bonus",
      "xGIPerGame",
      "xGPerGame",
      "xAPerGame",
      "pointsPerMillion",
      "xGIPerMillion",
    ]),
    starterElement("trend", 1, "Points by Season", null, ["totalPoints"]),
    starterElement("trend", 2, "xGI per Game by Season", null, ["xGIPerGame"]),
    starterElement("trend", 3, "Minutes by Season", null, ["minutes"]),
  ],
};

const MY_VIEW: ComparisonView = { id: COMPARISON_MY_VIEW_ID, name: "My View", updatedAt: 0, elements: [] };

export function isStarterComparisonView(view: Pick<ComparisonView, "id">): boolean {
  return view.id === COMPARISON_STARTER_VIEW_ID;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A stored element in the current shape, or null if it can't be salvaged (not an object, or a kind this version doesn't have). */
export function normalizeComparisonElement(raw: unknown): ComparisonElementConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<Record<keyof ComparisonElementConfig, unknown>>;
  if (!COMPARISON_ELEMENT_KINDS.includes(e.kind as ComparisonElementKind)) return null;
  const kind = e.kind as ComparisonElementKind;
  return {
    id: typeof e.id === "string" && e.id ? e.id : newId("el"),
    kind,
    name: typeof e.name === "string" ? e.name : "",
    dataView: kind === "trend" ? null : isAnalysisMode(e.dataView) ? e.dataView : "lastSeason",
    metricKeys: Array.isArray(e.metricKeys) ? e.metricKeys.filter((k): k is string => typeof k === "string") : [],
    minMinutes: typeof e.minMinutes === "number" && Number.isFinite(e.minMinutes) ? Math.max(0, Math.floor(e.minMinutes)) : 0,
  };
}

const VIEWS_STORE: VersionedStore<ComparisonView[]> = {
  version: STORAGE_VERSION,
  fallback: [STARTER_VIEW, MY_VIEW],
  // Runs on every load. Starter is always the packaged one (restored if
  // missing, replaced if stored differently), like the Dashboard's; every
  // other view keeps what the user built, with each element brought to the
  // current shape (a version-1 card gets minMinutes 0) and anything
  // unreadable dropped.
  migrate(data) {
    if (!Array.isArray(data)) return null;
    const views: ComparisonView[] = [];
    for (const raw of data) {
      if (!raw || typeof raw !== "object") continue;
      const v = raw as Partial<Record<keyof ComparisonView, unknown>>;
      if (v.id === COMPARISON_STARTER_VIEW_ID || typeof v.id !== "string" || typeof v.name !== "string") continue;
      const elements = Array.isArray(v.elements) ? v.elements.map(normalizeComparisonElement).filter((el): el is ComparisonElementConfig => el !== null) : [];
      views.push({ id: v.id, name: v.name, elements, updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0 });
    }
    return [STARTER_VIEW, ...views];
  },
};

const SELECTED_VIEW_STORE: VersionedStore<string> = {
  version: SELECTED_VIEW_STORAGE_VERSION,
  fallback: COMPARISON_MY_VIEW_ID,
  migrate: (data) => (typeof data === "string" ? data : null),
};

export type ElementSettings = Omit<ComparisonElementConfig, "id">;

export interface UseComparisonViews {
  views: ComparisonView[];
  /** The view on screen: the one last picked while it exists, else My View, else Starter. */
  selectedView: ComparisonView;
  selectView: (id: string) => void;
  /** Adds a blank view and selects it; returns its id. Name checks are the caller's. */
  createView: (name: string) => string;
  /** Refuses Starter; deleting the view on screen falls back to My View (or Starter). */
  deleteView: (id: string) => void;
  /** These four change the selected view only, and refuse Starter. */
  addElement: (settings: ElementSettings) => void;
  updateElement: (elementId: string, settings: ElementSettings) => void;
  removeElement: (elementId: string) => void;
  /** Moves `draggedId` to `targetId`'s place — only within one section (same kind). */
  reorderElement: (draggedId: string, targetId: string) => void;
}

/**
 * Player Comparison's views: named layouts of radar charts, Outputs panels
 * and trend graphs. The players compared are the page's own (its address),
 * not part of a view, so any view works for any players. "Starter" is
 * packaged and read-only, and applies the fixed minutes floor to every card; "My View" is seeded blank and selected on first
 * load; every other view is made blank with Create View. Edits save as they
 * happen — there's no separate Save step. localStorage only, like the
 * Dashboard's views.
 */
export function useComparisonViews(): UseComparisonViews {
  const [views, setViews] = useState<ComparisonView[]>(() => loadVersioned(STORAGE_KEY, VIEWS_STORE));
  const [storedSelectedId, setStoredSelectedId] = useState<string>(() => loadVersioned(SELECTED_VIEW_STORAGE_KEY, SELECTED_VIEW_STORE));

  useEffect(() => {
    saveVersioned(STORAGE_KEY, STORAGE_VERSION, views);
  }, [views]);
  useEffect(() => {
    saveVersioned(SELECTED_VIEW_STORAGE_KEY, SELECTED_VIEW_STORAGE_VERSION, storedSelectedId);
  }, [storedSelectedId]);

  const selectedView = useMemo(
    () =>
      views.find((v) => v.id === storedSelectedId) ??
      views.find((v) => v.id === COMPARISON_MY_VIEW_ID) ??
      views.find((v) => v.id === COMPARISON_STARTER_VIEW_ID) ??
      STARTER_VIEW,
    [views, storedSelectedId],
  );
  const selectedId = selectedView.id;

  const updateSelected = useCallback(
    (change: (elements: ComparisonElementConfig[]) => ComparisonElementConfig[]) => {
      if (selectedId === COMPARISON_STARTER_VIEW_ID) return;
      setViews((prev) => prev.map((v) => (v.id === selectedId ? { ...v, elements: change(v.elements), updatedAt: Date.now() } : v)));
    },
    [selectedId],
  );

  const selectView = useCallback((id: string) => setStoredSelectedId(id), []);

  const createView = useCallback((name: string) => {
    const id = newId("cmp-view");
    setViews((prev) => [...prev, { id, name, elements: [], updatedAt: Date.now() }]);
    setStoredSelectedId(id);
    return id;
  }, []);

  const deleteView = useCallback((id: string) => {
    if (id === COMPARISON_STARTER_VIEW_ID) return;
    setViews((prev) => prev.filter((v) => v.id !== id));
    setStoredSelectedId((prev) => (prev === id ? (id === COMPARISON_MY_VIEW_ID ? COMPARISON_STARTER_VIEW_ID : COMPARISON_MY_VIEW_ID) : prev));
  }, []);

  const addElement = useCallback((settings: ElementSettings) => updateSelected((els) => [...els, { ...settings, id: newId("el") }]), [updateSelected]);

  const updateElement = useCallback(
    (elementId: string, settings: ElementSettings) => updateSelected((els) => els.map((e) => (e.id === elementId ? { ...settings, id: elementId } : e))),
    [updateSelected],
  );

  const removeElement = useCallback((elementId: string) => updateSelected((els) => els.filter((e) => e.id !== elementId)), [updateSelected]);

  const reorderElement = useCallback(
    (draggedId: string, targetId: string) =>
      updateSelected((els) => {
        const from = els.findIndex((e) => e.id === draggedId);
        const to = els.findIndex((e) => e.id === targetId);
        if (from === -1 || to === -1 || from === to || els[from].kind !== els[to].kind) return els;
        const next = [...els];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      }),
    [updateSelected],
  );

  return { views, selectedView, selectView, createView, deleteView, addElement, updateElement, removeElement, reorderElement };
}
