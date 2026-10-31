import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EMPTY_COLUMN_FILTER } from "./useColumnFilters";
import { explorerViewToApply, normalizeExplorerViewSettings, useExplorerViews, type ExplorerViewContext, type ExplorerViewSettings } from "./useExplorerViews";

afterEach(() => localStorage.clear());

const SAVED: ExplorerViewSettings = {
  analysisMode: "live",
  visibleColumns: ["goals", "us.shots", "xG"],
  columnWidths: { goals: 120, "us.shots": 90, price: 80 },
  sort: [{ key: "xG", direction: "desc" }],
  columnFilters: {
    goals: { ...EMPTY_COLUMN_FILTER, gte: 5 },
    "us.shots": { ...EMPTY_COLUMN_FILTER, gte: 20 },
    xG: { ...EMPTY_COLUMN_FILTER, gte: 3 },
    team: { ...EMPTY_COLUMN_FILTER, category: "LEI" },
  },
  sourceChoice: { xG: "understat" },
  search: "saka",
  hideSmallSamples: true,
};

const CONTEXT: ExplorerViewContext = {
  isKnownColumn: (key) => key === "goals" || key === "xG" || key === "us.shots",
  fixedKeys: new Set(["name", "price", "team"]),
  categoryOptions: { team: ["ARS", "CHE"] },
  externalSourceId: "understat",
  canSwitchSource: (key) => key === "xG",
  defaultSort: [{ key: "totalPoints", direction: "desc" }],
};

describe("normalizeExplorerViewSettings", () => {
  it("brings garbage to a usable default instead of throwing", () => {
    expect(normalizeExplorerViewSettings(null)).toEqual({
      analysisMode: "lastSeason",
      visibleColumns: [],
      columnWidths: {},
      sort: [],
      columnFilters: {},
      sourceChoice: {},
      search: "",
      hideSmallSamples: false,
    });
  });

  it("drops only the unreadable parts of a damaged view", () => {
    const s = normalizeExplorerViewSettings({
      analysisMode: "nextSeason",
      visibleColumns: ["goals", 3, "goals", "xG"],
      columnWidths: { goals: 120.4, xG: "wide", assists: -5 },
      sort: [{ key: "xG", direction: "up" }, { key: "goals", direction: "asc" }, null],
      columnFilters: { goals: { gte: 5 }, xG: { gte: "lots" }, assists: null },
      sourceChoice: { xG: "understat", goals: 1 },
      search: 7,
      hideSmallSamples: "yes",
    });
    expect(s.analysisMode).toBe("lastSeason");
    expect(s.visibleColumns).toEqual(["goals", "xG"]);
    expect(s.columnWidths).toEqual({ goals: 120 });
    expect(s.sort).toEqual([{ key: "goals", direction: "asc" }]);
    expect(s.columnFilters).toEqual({ goals: { ...EMPTY_COLUMN_FILTER, gte: 5 } });
    expect(s.sourceChoice).toEqual({ xG: "understat" });
    expect(s.search).toBe("");
    expect(s.hideSmallSamples).toBe(false);
  });
});

describe("normalizeExplorerViewSettings: the set-piece duty filter (<set_piece_filter>)", () => {
  it("keeps the duties this version knows, each once, and drops a filter left with none", () => {
    const s = normalizeExplorerViewSettings({
      columnFilters: { setPieceDuties: { duties: ["penalties:1", "penalties:1", "corners:3", "throwIns:1", 7] }, other: { duties: ["nonsense"] } },
    });
    expect(s.columnFilters.setPieceDuties.duties).toEqual(["penalties:1", "corners:3"]);
    expect(s.columnFilters.other).toBeUndefined();
  });
});

describe("explorerViewToApply (<explorer_view_load>)", () => {
  it("applies a view this page can show in full, saying nothing", () => {
    const whole = { ...SAVED, columnFilters: { goals: SAVED.columnFilters.goals } };
    const { settings, leftOut } = explorerViewToApply(whole, CONTEXT);
    expect(settings).toEqual(whole);
    expect(leftOut).toEqual([]);
  });

  it("with the second source off, leaves out its columns, their filters and widths, and shows switched columns from FPL without their filters", () => {
    const { settings, leftOut } = explorerViewToApply(SAVED, { ...CONTEXT, externalSourceId: null, isKnownColumn: (key) => key === "goals" || key === "xG", canSwitchSource: () => false });
    expect(settings.visibleColumns).toEqual(["goals", "xG"]);
    expect(settings.columnWidths).toEqual({ goals: 120, price: 80 });
    expect(settings.sourceChoice).toEqual({});
    // xG's filter was set on the other source's figures, so it goes too.
    expect(Object.keys(settings.columnFilters)).toEqual(["goals"]);
    expect(settings.sort).toEqual([{ key: "xG", direction: "desc" }]);
    expect(leftOut).toEqual(["1 column not available now", "the filter on LEI, no longer in the league", "1 column saved on another source, shown from FPL"]);
  });

  it("leaves out a category filter whose choice no longer exists (a relegated club)", () => {
    const { settings, leftOut } = explorerViewToApply(SAVED, CONTEXT);
    expect(settings.columnFilters.team).toBeUndefined();
    expect(leftOut).toEqual(["the filter on LEI, no longer in the league"]);
  });

  it("falls back to the default sort when every saved sort column is left out", () => {
    const { settings } = explorerViewToApply({ ...SAVED, sort: [{ key: "us.shots", direction: "asc" }] }, { ...CONTEXT, isKnownColumn: (key) => key !== "us.shots" });
    expect(settings.sort).toEqual([]);
    const withDefaultShown = explorerViewToApply(
      { ...SAVED, visibleColumns: [...SAVED.visibleColumns, "totalPoints"], sort: [{ key: "us.shots", direction: "asc" }] },
      { ...CONTEXT, isKnownColumn: (key) => key !== "us.shots" },
    );
    expect(withDefaultShown.settings.sort).toEqual([{ key: "totalPoints", direction: "desc" }]);
  });

  it("never sorts or filters a column that can't be (Next 5 Fixtures), and never puts a fixed column among the configurable ones", () => {
    const { settings } = explorerViewToApply(
      { ...SAVED, visibleColumns: ["fixtures", "price", "goals"], sort: [{ key: "fixtures", direction: "desc" }], columnFilters: { fixtures: { ...EMPTY_COLUMN_FILTER, gte: 1 } } },
      { ...CONTEXT, isKnownColumn: () => true, unsortableKeys: new Set(["fixtures"]) },
    );
    expect(settings.visibleColumns).toEqual(["fixtures", "goals"]);
    expect(settings.sort).toEqual([]);
    expect(settings.columnFilters).toEqual({});
  });
});

describe("useExplorerViews", () => {
  it("saves, saves over and deletes views, kept per Explorer across reloads", () => {
    const { result, unmount } = renderHook(() => useExplorerViews("player"));
    let id = "";
    act(() => {
      id = result.current.save("Budget Mids", SAVED);
    });
    act(() => result.current.overwrite(id, { ...SAVED, search: "palmer" }));
    unmount();

    const reloaded = renderHook(() => useExplorerViews("player"));
    expect(reloaded.result.current.views.map((v) => [v.name, v.settings.search])).toEqual([["Budget Mids", "palmer"]]);
    expect(renderHook(() => useExplorerViews("team")).result.current.views).toEqual([]);

    act(() => reloaded.result.current.remove(id));
    expect(reloaded.result.current.views).toEqual([]);
  });

  it("one damaged entry costs only itself", () => {
    localStorage.setItem(
      "scoutline:player-explorer:saved-views:v1",
      JSON.stringify({ version: 1, data: [null, { name: "No id" }, { id: "a", name: "Kept", settings: { search: "saka" } }] }),
    );
    const { result } = renderHook(() => useExplorerViews("player"));
    expect(result.current.views.map((v) => [v.name, v.settings.search, v.settings.analysisMode])).toEqual([["Kept", "saka", "lastSeason"]]);
  });
});
