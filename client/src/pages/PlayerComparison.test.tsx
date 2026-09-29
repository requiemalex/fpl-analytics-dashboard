import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerComparison } from "./PlayerComparison";
import { makePlayer, makeSeason } from "../test/fixtures";

const PLAYERS = vi.hoisted(() => [] as ReturnType<typeof makePlayer>[]);

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    historicProfiles: new Map(),
    historicStatus: "ready",
    historicErrorMessage: null,
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    allTimeSeasonsByPlayerId: new Map([[1, [makeSeason({ seasonName: "2025/26", totalPoints: 150, minutes: 2400 })]]]),
    requestHistoricData: () => {},
  }),
}));

const VIEWS_KEY = "fpl-dashboard:comparison:views:v1";
const SELECTED_KEY = "fpl-dashboard:comparison:selected-view:v1";

beforeEach(() => {
  localStorage.clear();
  PLAYERS.length = 0;
  PLAYERS.push(
    makePlayer({ id: 1, name: "Haaland", position: "FWD", totalPoints: 60, goals: 8, minutes: 540, ownership: 73.6, price: 15.6 }),
    makePlayer({ id: 2, name: "Thiago", position: "FWD", totalPoints: 45, goals: 6, minutes: 540 }),
    makePlayer({ id: 3, name: "Cameo", position: "FWD", totalPoints: 12, goals: 2, minutes: 45 }),
    makePlayer({ id: 4, name: "Other", position: "FWD", totalPoints: 30, goals: 3, minutes: 500 }),
  );
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function renderPage(players = "") {
  return render(
    <MemoryRouter initialEntries={[`/player-comparison${players ? `?players=${players}` : ""}`]}>
      <PlayerComparison />
    </MemoryRouter>,
  );
}

function storeView(elements: unknown[]) {
  localStorage.setItem(VIEWS_KEY, JSON.stringify({ version: 1, data: [{ id: "cmp-view-1", name: "Mine", elements, updatedAt: 1 }] }));
  localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: "cmp-view-1" }));
}

describe("PlayerComparison", () => {
  it("opens on the blank My View, with an Add card in each section", () => {
    const { getByLabelText, getByRole } = renderPage();
    expect((getByLabelText("Comparison view") as HTMLSelectElement).value).toBe("comparison-my-view");
    for (const noun of ["Radar Chart", "Outputs Panel", "Trend Graph"]) expect(getByRole("button", { name: `Add ${noun}` })).toBeTruthy();
  });

  it("shows each compared player's tag: ownership · price, club and position", () => {
    const { container } = renderPage("1");
    const tag = container.querySelector(".cmp-player-tag")!;
    expect(tag.textContent).toContain("Haaland");
    expect(tag.textContent).toContain("73.6% · £15.6m");
    expect(tag.querySelector(".badge.pos-FWD")).toBeTruthy();
    expect(tag.querySelector(".team-badge")).toBeTruthy();
  });

  it("builds an Outputs panel from the dialog: a name and at least one statistic are required", () => {
    const { getByRole, getByLabelText, container } = renderPage("1,2");
    fireEvent.click(getByRole("button", { name: "Add Outputs Panel" }));
    const dialog = container.querySelector(".dialog") as HTMLElement;
    const save = within(dialog).getByRole("button", { name: "Add Outputs Panel" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(getByLabelText("Name"), { target: { value: "Goals race" } });
    expect(save.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Goals" }));
    fireEvent.change(within(dialog).getByLabelText("Data View"), { target: { value: "live" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(container.querySelector(".dialog")).toBeNull();
    const panel = container.querySelector(".cmp-outputs") as HTMLElement;
    expect(panel).toBeTruthy();
    const values = Array.from(panel.querySelectorAll(".cmp-outputs-value")).map((v) => v.textContent);
    expect(values).toEqual(["8", "6"]);
    // The better figure is bold, and both have a marker on the track.
    expect((panel.querySelectorAll(".cmp-outputs-value")[0] as HTMLElement).style.fontWeight).toBe("700");
    // Raw scale, 0 to the leader: 8 goals is the full track, 6 is three quarters of it.
    const markers = [...panel.querySelectorAll<HTMLElement>(".cmp-outputs-marker")];
    expect(markers.map((m) => m.style.left)).toEqual(["100%", "75%"]);
    // A card you build has no automatic floor, so no stopwatch badge.
    expect(container.querySelector('[aria-label^="Minimum minutes applied"]')).toBeNull();
  });

  it("a custom card with no Min Minutes ranks everyone, a 45-minute cameo included", () => {
    storeView([{ id: "e1", kind: "outputs", name: "Now", dataView: "live", metricKeys: ["goals"], minMinutes: 0 }]);
    const { container } = renderPage("1,3");
    const panel = container.querySelector(".cmp-outputs") as HTMLElement;
    expect(panel.querySelectorAll(".cmp-outputs-marker")).toHaveLength(2);
    expect(panel.querySelectorAll(".small-sample-badge")).toHaveLength(0);
  });

  it("greys a player under the card's own Min Minutes, on that card only", () => {
    storeView([
      { id: "e1", kind: "outputs", name: "Regulars", dataView: "live", metricKeys: ["goals"], minMinutes: 90 },
      { id: "e2", kind: "outputs", name: "Everyone", dataView: "live", metricKeys: ["goals"], minMinutes: 0 },
    ]);
    const { container } = renderPage("1,3");
    const [regulars, everyone] = [...container.querySelectorAll<HTMLElement>(".cmp-outputs")];
    expect(regulars.querySelectorAll(".cmp-outputs-marker")).toHaveLength(1);
    const badge = regulars.querySelector(".cmp-outputs-head .small-sample-badge")!;
    expect(badge.getAttribute("title")).toMatch(/^Below this card's Min Minutes — 45 min in this mode, under 90/);
    expect(everyone.querySelectorAll(".cmp-outputs-marker")).toHaveLength(2);
  });

  it("marks a player under the card's minimum: no marker, no bold, a badge in his column", () => {
    storeView([{ id: "e1", kind: "outputs", name: "Now", dataView: "live", metricKeys: ["goals"], minMinutes: 90 }]);
    const { container } = renderPage("1,3");
    const panel = container.querySelector(".cmp-outputs") as HTMLElement;
    expect(panel.querySelectorAll(".cmp-outputs-marker")).toHaveLength(1);
    expect(panel.querySelectorAll(".cmp-outputs-head .small-sample-badge")).toHaveLength(1);
    const values = panel.querySelectorAll<HTMLElement>(".cmp-outputs-value");
    expect(values[1].style.fontWeight).toBe("");
    // With only one ranked player there's no "best" to bold either.
    expect(values[0].style.fontWeight).toBe("");
  });

  it("says to add players rather than drawing empty charts", () => {
    storeView([{ id: "e1", kind: "radar", name: "Shape", dataView: "live", metricKeys: ["goals", "assists", "totalPoints"] }]);
    const { getByText } = renderPage();
    expect(getByText("Add players above to compare them here.")).toBeTruthy();
  });

  it("shows a card whose statistic this version doesn't have as unavailable, still removable", () => {
    storeView([{ id: "e1", kind: "trend", name: "Old", dataView: null, metricKeys: ["retiredStat"] }]);
    const { getByText, getByRole, queryByText } = renderPage("1");
    expect(getByText("This graph's statistics are no longer available.")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Remove graph" }));
    expect(queryByText("Old")).toBeNull();
  });

  it("the Starter view is read-only: no Add cards, no Edit/Remove, and it can't be deleted", () => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ version: 1, data: "comparison-starter" }));
    const { queryByRole, getByRole, getByText } = renderPage("1,2");
    expect(getByText("Attacking Shape")).toBeTruthy();
    expect(getByText("Last Season Output")).toBeTruthy();
    expect(getByText("Points by Season")).toBeTruthy();
    // Starter's cards apply the fixed floor, and say so with the stopwatch badge.
    expect(document.querySelectorAll('[aria-label^="Minimum minutes applied"]').length).toBeGreaterThan(0);
    expect(queryByRole("button", { name: "Add Radar Chart" })).toBeNull();
    expect(queryByRole("button", { name: "Edit chart" })).toBeNull();
    expect((getByRole("button", { name: "Delete View" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
