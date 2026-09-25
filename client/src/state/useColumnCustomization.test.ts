import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
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
