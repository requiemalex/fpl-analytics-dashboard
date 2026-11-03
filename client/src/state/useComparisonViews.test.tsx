import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useComparisonViews, COMPARISON_MY_VIEW_ID, COMPARISON_STARTER_VIEW_ID, normalizeComparisonElement } from "./useComparisonViews";

const STORAGE_KEY = "fpl-dashboard:comparison:views:v1";
const SELECTED_KEY = "fpl-dashboard:comparison:selected-view:v1";

beforeEach(() => {
  localStorage.clear();
});

const radar = { kind: "radar" as const, name: "Shape", dataView: "lastSeason" as const, metricKeys: ["goals", "assists", "xG"], minMinutes: 0 };
const trend = { kind: "trend" as const, name: "Points", dataView: null, metricKeys: ["totalPoints"], minMinutes: 0 };

describe("useComparisonViews", () => {
  it("with nothing stored, has Starter and a blank My View, and opens on Starter", () => {
    const { result } = renderHook(() => useComparisonViews());
    expect(result.current.views.map((v) => v.id)).toEqual([COMPARISON_STARTER_VIEW_ID, COMPARISON_MY_VIEW_ID]);
    expect(result.current.selectedView.id).toBe(COMPARISON_STARTER_VIEW_ID);
    expect(result.current.views.find((v) => v.id === COMPARISON_MY_VIEW_ID)?.elements).toEqual([]);
  });

  it("ships a Starter view with charts, outputs and trends", () => {
    const { result } = renderHook(() => useComparisonViews());
    const starter = result.current.views.find((v) => v.id === COMPARISON_STARTER_VIEW_ID)!;
    expect(new Set(starter.elements.map((e) => e.kind))).toEqual(new Set(["radar", "outputs", "trend"]));
  });

  it("adds, edits and removes cards on the selected view, and keeps them for the next load", () => {
    const { result, unmount } = renderHook(() => useComparisonViews());
    // A new install opens on the read-only Starter, so pick My View to edit (audit 2026-11-03 M8).
    act(() => result.current.selectView(COMPARISON_MY_VIEW_ID));
    act(() => result.current.addElement(radar));
    const id = result.current.selectedView.elements[0].id;
    act(() => result.current.updateElement(id, { ...radar, name: "Renamed" }));
    expect(result.current.selectedView.elements[0]).toMatchObject({ id, name: "Renamed" });
    unmount();
    const { result: reloaded } = renderHook(() => useComparisonViews());
    expect(reloaded.current.selectedView.elements).toHaveLength(1);
    act(() => reloaded.current.removeElement(id));
    expect(reloaded.current.selectedView.elements).toEqual([]);
  });

  it("never changes the Starter view", () => {
    const { result } = renderHook(() => useComparisonViews());
    act(() => result.current.selectView(COMPARISON_STARTER_VIEW_ID));
    const before = result.current.selectedView.elements;
    act(() => result.current.addElement(radar));
    act(() => result.current.removeElement(before[0].id));
    act(() => result.current.deleteView(COMPARISON_STARTER_VIEW_ID));
    expect(result.current.selectedView.id).toBe(COMPARISON_STARTER_VIEW_ID);
    expect(result.current.selectedView.elements).toEqual(before);
  });

  it("reorders only within one section", () => {
    const { result } = renderHook(() => useComparisonViews());
    act(() => result.current.selectView(COMPARISON_MY_VIEW_ID));
    act(() => result.current.addElement(radar));
    act(() => result.current.addElement({ ...radar, name: "Second" }));
    act(() => result.current.addElement(trend));
    const [a, b, t] = result.current.selectedView.elements.map((e) => e.id);
    act(() => result.current.reorderElement(b, a));
    expect(result.current.selectedView.elements.map((e) => e.id)).toEqual([b, a, t]);
    act(() => result.current.reorderElement(t, b));
    expect(result.current.selectedView.elements.map((e) => e.id)).toEqual([b, a, t]);
  });

  it("creates a blank view and selects it; deleting it falls back to My View", () => {
    const { result } = renderHook(() => useComparisonViews());
    let id = "";
    act(() => {
      id = result.current.createView("Forwards");
    });
    expect(result.current.selectedView).toMatchObject({ id, name: "Forwards", elements: [] });
    act(() => result.current.deleteView(id));
    expect(result.current.selectedView.id).toBe(COMPARISON_MY_VIEW_ID);
  });

  it("restores Starter to the packaged one, keeps the user's views, and drops elements it can't read", () => {
    const stored = [
      { id: COMPARISON_STARTER_VIEW_ID, name: "Edited", elements: [], updatedAt: 5 },
      { id: "cmp-view-1", name: "Mine", updatedAt: 1, elements: [radar, { kind: "pie", name: "?", metricKeys: [] }, "junk", { ...trend, dataView: "live" }] },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: stored }));
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: "cmp-view-1" }));
    const { result } = renderHook(() => useComparisonViews());
    const starter = result.current.views.find((v) => v.id === COMPARISON_STARTER_VIEW_ID)!;
    expect(starter.name).toBe("Starter");
    expect(starter.elements.length).toBeGreaterThan(0);
    expect(result.current.selectedView.id).toBe("cmp-view-1");
    expect(result.current.selectedView.elements.map((e) => e.kind)).toEqual(["radar", "trend"]);
    // A trend has no Data View of its own.
    expect(result.current.selectedView.elements[1].dataView).toBeNull();
  });

  // Audit 2026-11-03 phase 3 R5: a selection that's gone opens Starter, as a new install does.
  it("falls back to Starter when the stored selection no longer exists", () => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: "cmp-view-gone" }));
    const { result } = renderHook(() => useComparisonViews());
    expect(result.current.selectedView.id).toBe(COMPARISON_STARTER_VIEW_ID);
  });
});

describe("normalizeComparisonElement", () => {
  it("backfills a bad Data View and non-string metric keys", () => {
    expect(normalizeComparisonElement({ id: "e1", kind: "outputs", name: "O", dataView: "bogus", metricKeys: ["goals", 3] })).toEqual({
      id: "e1",
      kind: "outputs",
      name: "O",
      dataView: "lastSeason",
      metricKeys: ["goals"],
      minMinutes: 0,
    });
  });
});

describe("useComparisonViews — version 1 -> 2 (each card's own Min Minutes)", () => {
  it("gives a card saved before Min Minutes existed a minimum of 0, and keeps a stored one", () => {
    const stored = [{ id: "cmp-view-1", name: "Mine", updatedAt: 1, elements: [{ id: "e1", kind: "radar", name: "Old", dataView: "live", metricKeys: ["goals", "assists", "xG"] }, { ...radar, id: "e2", minMinutes: 450 }] }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: stored }));
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: "cmp-view-1" }));
    const { result } = renderHook(() => useComparisonViews());
    expect(result.current.selectedView.elements.map((e) => e.minMinutes)).toEqual([0, 450]);
  });
});

describe("useComparisonViews — selected view version 1 -> 2 (open on Starter, audit 2026-11-03 M8)", () => {
  const myView = (elements: unknown[]) => ({ id: COMPARISON_MY_VIEW_ID, name: "My View", updatedAt: 1, elements });

  it("moves a page that landed on a still-blank My View to Starter, keeping My View in the list", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: [myView([])] }));
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: COMPARISON_MY_VIEW_ID }));
    const { result } = renderHook(() => useComparisonViews());
    expect(result.current.selectedView.id).toBe(COMPARISON_STARTER_VIEW_ID);
    expect(result.current.views.map((v) => v.id)).toContain(COMPARISON_MY_VIEW_ID);
  });

  it("keeps a My View with cards on it, Starter, and a view of the user's own", () => {
    for (const id of [COMPARISON_MY_VIEW_ID, COMPARISON_STARTER_VIEW_ID, "cmp-mine"]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: [myView([{ ...radar, id: "el-1" }]), { id: "cmp-mine", name: "Mine", updatedAt: 1, elements: [] }] }));
      localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: id }));
      const { result, unmount } = renderHook(() => useComparisonViews());
      expect(result.current.selectedView.id).toBe(id);
      unmount();
    }
  });

  it("runs once: a blank My View picked after upgrading stays selected", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: [myView([])] }));
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 2, data: COMPARISON_MY_VIEW_ID }));
    const { result } = renderHook(() => useComparisonViews());
    expect(result.current.selectedView.id).toBe(COMPARISON_MY_VIEW_ID);
  });
});
