import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useEscapeLayer } from "./useEscapeLayer";

afterEach(cleanup);

function Layer({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscapeLayer(active, onEscape);
  return null;
}

describe("useEscapeLayer (audit 2026-09-25: one Escape used to close every open layer at once)", () => {
  it("Escape closes only the most recently opened layer; the next press closes the one under it", () => {
    const under = vi.fn();
    const top = vi.fn();
    const { rerender } = render(
      <>
        <Layer active onEscape={under} />
        <Layer active onEscape={top} />
      </>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(top).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();

    // The top layer closes (as its onEscape would do), so the next Escape reaches the one under it.
    rerender(
      <>
        <Layer active onEscape={under} />
        <Layer active={false} onEscape={top} />
      </>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(under).toHaveBeenCalledTimes(1);
    expect(top).toHaveBeenCalledTimes(1);
  });

  it("other keys, and Escape with nothing open, do nothing", () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Layer active onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: "Enter" });
    rerender(<Layer active={false} onEscape={onEscape} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("always runs the latest onEscape passed, never a stale one", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Layer active onEscape={first} />);
    rerender(<Layer active onEscape={latest} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
