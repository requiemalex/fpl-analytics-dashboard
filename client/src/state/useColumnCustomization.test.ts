import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import { useColumnCustomization, MIN_COLUMN_WIDTH } from "./useColumnCustomization";

const DEFAULTS = ["totalPoints", "goals", "assists", "minutes"];

describe("useColumnCustomization", () => {
  it("toggling a column on appends it to the end of the current order; toggling off removes it", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    act(() => result.current.toggleColumn("xG"));
    expect(result.current.visibleColumns).toEqual([...DEFAULTS, "xG"]);
    act(() => result.current.toggleColumn("goals"));
    expect(result.current.visibleColumns).toEqual(["totalPoints", "assists", "minutes", "xG"]);
  });

  it("dragging a column onto another moves it into that column's place", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    act(() => result.current.reorderColumn("minutes", "totalPoints"));
    expect(result.current.visibleColumns).toEqual(["minutes", "totalPoints", "goals", "assists"]);
  });

  it("dragging onto (or from) a column that isn't in this set changes nothing", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    act(() => result.current.reorderColumn("price", "goals"));
    act(() => result.current.reorderColumn("goals", "price"));
    expect(result.current.visibleColumns).toEqual(DEFAULTS);
  });

  it("fitToBox shares the available width equally, never below the minimum", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    act(() => result.current.fitToBox(400));
    expect(result.current.columnWidths).toEqual({ totalPoints: 100, goals: 100, assists: 100, minutes: 100 });
    act(() => result.current.fitToBox(40));
    expect(Object.values(result.current.columnWidths)).toEqual(DEFAULTS.map(() => MIN_COLUMN_WIDTH));
  });

  it("Reset restores the packaged order and visibility and clears every width", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    act(() => result.current.toggleColumn("xG"));
    act(() => result.current.reorderColumn("minutes", "totalPoints"));
    act(() => result.current.fitToBox(500));
    act(() => result.current.resetColumns());
    expect(result.current.visibleColumns).toEqual(DEFAULTS);
    expect(result.current.columnWidths).toEqual({});
  });
});

/** Drags `key`'s resize handle from a 100px start by `delta` pixels, the way a pointer would. */
function dragResize(result: { current: ReturnType<typeof useColumnCustomization> }, key: string, delta: number) {
  const down = { preventDefault() {}, stopPropagation() {}, clientX: 0, currentTarget: { closest: () => null } } as unknown as React.PointerEvent;
  act(() => result.current.startResize(down, key));
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: delta }));
    window.dispatchEvent(new MouseEvent("pointerup"));
  });
}

describe("useColumnCustomization — 2026-09-25 audit fixes", () => {
  it("L6: a width set by dragging survives auto-fit; the other columns share what's left", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    dragResize(result, "goals", 60); // 100 → 160
    expect(result.current.columnWidths.goals).toBe(160);
    act(() => result.current.fitToBox(400));
    expect(result.current.columnWidths).toEqual({ totalPoints: 80, goals: 160, assists: 80, minutes: 80 });
  });

  it("L6: a dragged width on a column outside this set (Player Explorer's Own%/Price/Team/Position) survives auto-fit too", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    dragResize(result, "price", 42);
    act(() => result.current.fitToBox(400));
    expect(result.current.columnWidths.price).toBe(142);
    expect(result.current.columnWidths.totalPoints).toBe(100);
  });

  it("L6: fitToBox from an old render (a resize listener registered once) still fits the current columns", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    const fitFromFirstRender = result.current.fitToBox;
    act(() => result.current.toggleColumn("xG"));
    act(() => fitFromFirstRender(500));
    expect(result.current.columnWidths).toEqual({ totalPoints: 100, goals: 100, assists: 100, minutes: 100, xG: 100 });
  });

  it("M6: a column with its own minimum width gets it first; the rest share what's left", () => {
    const { result } = renderHook(() => useColumnCustomization(["totalPoints", "goals", "fixtures"], { fixtures: 190 }));
    act(() => result.current.fitToBox(400));
    expect(result.current.columnWidths).toEqual({ totalPoints: 105, goals: 105, fixtures: 190 });
    // Given more than its minimum's worth, it just takes an equal share.
    act(() => result.current.fitToBox(900));
    expect(result.current.columnWidths).toEqual({ totalPoints: 300, goals: 300, fixtures: 300 });
  });

  it("Reset forgets dragged widths, so the next auto-fit shares everything equally again", () => {
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS));
    dragResize(result, "goals", 60);
    act(() => result.current.resetColumns());
    act(() => result.current.fitToBox(400));
    expect(result.current.columnWidths).toEqual({ totalPoints: 100, goals: 100, assists: 100, minutes: 100 });
  });
});

describe("useColumnCustomization — 2026-09-25 audit, phase 3 fixes", () => {
  it("R1: a column can't be dragged below its own minimum (Next 5 Fixtures keeps room for five fixtures)", () => {
    const { result } = renderHook(() => useColumnCustomization(["totalPoints", "fixtures"], { fixtures: 190 }));
    dragResize(result, "fixtures", -60); // 100 → floored at 190
    expect(result.current.columnWidths.fixtures).toBe(190);
    dragResize(result, "totalPoints", -60); // 100 → floored at MIN_COLUMN_WIDTH
    expect(result.current.columnWidths.totalPoints).toBe(MIN_COLUMN_WIDTH);
  });

  it("R1: ending a drag calls the page's re-fit, so the other columns make room instead of the table overflowing", () => {
    let fits = 0;
    const { result } = renderHook(() => useColumnCustomization(DEFAULTS, {}, () => fits++));
    dragResize(result, "goals", 60);
    expect(fits).toBe(1);
    act(() => result.current.fitToBox(400));
    expect(result.current.columnWidths).toEqual({ totalPoints: 80, goals: 160, assists: 80, minutes: 80 });
  });
});
