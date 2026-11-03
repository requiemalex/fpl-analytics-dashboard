import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const refresh = vi.fn();
const state: Record<string, unknown> = { isStale: false, staleDatasets: { fixtures: false, historic: false }, fixturesUnavailable: false };
vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    status: "ready",
    lastUpdated: Date.now(),
    refreshing: false,
    refresh,
    players: [],
    errorMessage: null,
    gameweekState: null,
    events: [],
    ...state,
  }),
}));

const { AppShell } = await import("./AppShell");
const { isComparativeColourOn, setComparativeColourOn } = await import("../state/comparativeColour");

afterEach(() => {
  cleanup();
  state.isStale = false;
  state.staleDatasets = { fixtures: false, historic: false };
  state.fixturesUnavailable = false;
  refresh.mockClear();
  setComparativeColourOn(true);
});

const banner = () =>
  render(
    <MemoryRouter>
      <AppShell>
        <div />
      </AppShell>
    </MemoryRouter>,
  ).container.querySelector(".banner.stale")?.textContent ?? null;

describe("stale fixtures or historic data are flagged, never shown as current (audit 2026-10-18 M3)", () => {
  it("no banner when everything is live", () => {
    expect(banner()).toBeNull();
  });
  it("names the datasets served from a cached copy", () => {
    state.staleDatasets = { fixtures: true, historic: true };
    expect(banner()).toContain("cached copy of the fixtures and historic data");
  });
});

describe("a fixture list that couldn't load is flagged, with Try again (audit 2026-10-23 in-app)", () => {
  const shell = () =>
    render(
      <MemoryRouter>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    );
  it("no banner while fixtures are in", () => {
    expect(shell().container.querySelector(".banner.error")).toBeNull();
  });
  it("says what's missing, and Try again reloads", () => {
    state.fixturesUnavailable = true;
    const { container, getByRole } = shell();
    expect(container.querySelector(".banner.error")?.textContent).toContain("Couldn't load FPL's fixture list");
    fireEvent.click(getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("<comparative_colour_switch>: the top bar's palette turns comparative colouring off and on everywhere", () => {
  it("is on and pressed by default; a click turns it off, another back on", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    );
    const off = getByRole("button", { name: "Turn off green/red comparative colouring everywhere" });
    expect(off.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(off);
    expect(isComparativeColourOn()).toBe(false);
    const on = getByRole("button", { name: "Turn green/red comparative colouring back on everywhere" });
    expect(on.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(on);
    expect(isComparativeColourOn()).toBe(true);
  });
});

describe("the top bar's gameweek label has one style in every gameweek state (audit 2026-11-03 L8, owner's choice)", () => {
  afterEach(() => {
    state.gameweekState = null;
    state.events = [];
  });
  const label = () =>
    render(
      <MemoryRouter>
        <AppShell>
          <div />
        </AppShell>
      </MemoryRouter>,
    ).container.textContent ?? "";
  it.each([
    ["in progress", { kind: "current", event: { id: 9, finished: false } }, [], "Gameweek 9"],
    ["finished, next deadline known", { kind: "current", event: { id: 9, finished: true } }, [{ id: 10, isNext: true, deadlineTime: "2026-11-06T18:30:00Z" }], "Gameweek 10"],
    ["finished, no next gameweek", { kind: "current", event: { id: 38, finished: true } }, [], "Gameweek 38 finished"],
    ["last completed", { kind: "last-completed", event: { id: 9, finished: true } }, [], "Gameweek 9 finished"],
  ])("%s: one \"Gameweek N\" style, never \"GW n\"", (_name, gameweekState, events, expected) => {
    state.gameweekState = gameweekState;
    state.events = events;
    const text = label();
    expect(text).toContain(expected);
    expect(text).not.toMatch(/\bGW \d/);
  });
});
