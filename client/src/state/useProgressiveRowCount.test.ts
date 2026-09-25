import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProgressiveRowCount, INITIAL_ROW_COUNT, ROWS_PER_FRAME } from "./useProgressiveRowCount";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});
afterEach(() => {
  vi.useRealTimers();
});

function nextFrame() {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

describe("useProgressiveRowCount", () => {
  it("draws a short table in full straight away", () => {
    const { result } = renderHook(() => useProgressiveRowCount(12));
    expect(result.current).toBe(12);
  });

  it("draws the first rows at once, then the rest over the following frames without any scrolling", () => {
    const total = INITIAL_ROW_COUNT + ROWS_PER_FRAME * 2 + 7;
    const { result } = renderHook(() => useProgressiveRowCount(total));
    expect(result.current).toBe(INITIAL_ROW_COUNT);
    nextFrame();
    expect(result.current).toBe(INITIAL_ROW_COUNT + ROWS_PER_FRAME);
    nextFrame();
    nextFrame();
    expect(result.current).toBe(total);
    nextFrame();
    expect(result.current).toBe(total);
  });

  it("keeps every drawn row when the list changes but its length doesn't (a sort)", () => {
    const { result, rerender } = renderHook(({ total }) => useProgressiveRowCount(total), { initialProps: { total: 300 } });
    for (let i = 0; i < 5; i++) nextFrame();
    expect(result.current).toBe(300);
    rerender({ total: 300 });
    expect(result.current).toBe(300);
  });

  it("stages rows back in after a filter narrows the list and is then cleared", () => {
    const { result, rerender } = renderHook(({ total }) => useProgressiveRowCount(total), { initialProps: { total: 300 } });
    for (let i = 0; i < 5; i++) nextFrame();
    rerender({ total: 8 });
    expect(result.current).toBe(8);
    nextFrame();
    rerender({ total: 300 });
    expect(result.current).toBe(INITIAL_ROW_COUNT);
    for (let i = 0; i < 5; i++) nextFrame();
    expect(result.current).toBe(300);
  });
});
