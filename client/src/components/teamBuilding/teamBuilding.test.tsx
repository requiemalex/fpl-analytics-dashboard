import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render as renderBare, renderHook, waitFor } from "@testing-library/react";
import { GameweekLogTable } from "./GameweekLogTable";
import { GameweekSummary } from "./GameweekSummary";
import { PriceChanges, priceMovers } from "./PriceChanges";
import { resetEventLiveCache, useGameweekLog, type GameweekLog, type GameweekLogRow } from "../../state/useGameweekLog";
import { makePlayer } from "../../test/fixtures";
import type { ChipWindow, EventSummary, NormalizedEvent } from "../../types/normalized";
import type { SavedSquad } from "../../types/team";

// <gameweek_log>, <gameweek_summary>, <price_changes_week>

const fetchEventLiveMock = vi.fn();
const fetchEntryPicksMock = vi.fn();
const fetchEntryHistoryMock = vi.fn();
vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client")>()),
  fetchEventLive: (...a: unknown[]) => fetchEventLiveMock(...a),
  fetchEntryPicks: (...a: unknown[]) => fetchEntryPicksMock(...a),
  fetchEntryHistory: (...a: unknown[]) => fetchEntryHistoryMock(...a),
}));

afterEach(cleanup);
/** Club pills open a club's profile through the router. */
const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks();
  resetEventLiveCache();
});

const summary = (o: Partial<EventSummary> = {}): EventSummary => ({
  averageScore: 52,
  highestScore: 120,
  rankedCount: 1000,
  mostCaptainedId: 2,
  mostViceCaptainedId: null,
  topScorer: { id: 3, points: 15 },
  chipPlays: { wildcard: 10, bboost: 20 },
  ...o,
});
const event = (id: number, o: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  id,
  name: `Gameweek ${id}`,
  deadlineTime: `2026-10-${String(id + 10).padStart(2, "0")}T11:00:00Z`,
  finished: true,
  isCurrent: false,
  isNext: false,
  isPrevious: false,
  summary: summary(),
  ...o,
});
const row = (o: Partial<GameweekLogRow>): GameweekLogRow => ({
  event: 8,
  finished: true,
  points: 64,
  benchPoints: 6,
  average: 52,
  highest: 120,
  transfers: 1,
  transferCost: 4,
  rank: 12345,
  overallRank: 56789,
  chip: null,
  captain: null,
  ...o,
});
const players = [makePlayer({ id: 1, position: "MID", name: "Saka" }), makePlayer({ id: 2, position: "FWD", name: "Haaland" }), makePlayer({ id: 3, position: "MID", name: "Palmer" })];
const playersById = new Map(players.map((p) => [p.id, p]));
const live = (points: Record<number, number>) => ({ data: Object.entries(points).map(([id, p]) => ({ id: Number(id), stats: { total_points: p, minutes: 90 } })) });

describe("GameweekLogTable", () => {
  it("an import shows FPL's columns, newest first, with Totals and Average", () => {
    const log: GameweekLog = { status: "ready", source: "fpl", rows: [row({ event: 9, points: 40, transferCost: 0, chip: "bboost" }), row({ event: 8 })], error: null };
    const { container } = render(<GameweekLogTable log={log} playersById={playersById} onViewProfile={() => {}} />);
    expect([...container.querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["GW", "Points", "Average", "Highest", "Bench", "Transfers", "Hits", "GW Rank", "Overall Rank", "Chip"]);
    const body = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(body[0]).toEqual(["9", "40", "52", "120", "6", "1", "0", "12,345", "56,789", "Bench Boost"]);
    expect(body[1][6]).toBe("−4");
    const foot = [...container.querySelectorAll("tfoot tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(foot[0]).toEqual(["Totals", "104", "104", "", "12", "2", "−4", "", "", ""]);
    expect(foot[1]).toEqual(["Average", "52", "52", "", "6", "1", "", "", "", ""]);
  });

  it("a squad built here shows its captain instead, and no transfers or ranks", () => {
    const log: GameweekLog = { status: "ready", source: "recorded", rows: [row({ captain: { id: 1, points: 14 }, transfers: null, rank: null })], error: null };
    const { container, getByRole } = render(<GameweekLogTable log={log} playersById={playersById} onViewProfile={() => {}} />);
    expect([...container.querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["GW", "Points", "Average", "Highest", "Bench", "Captain"]);
    expect(getByRole("button", { name: "View Saka's profile" })).toBeTruthy();
  });
});

describe("useGameweekLog", () => {
  it("scores a squad built here from its records and FPL's gameweek data", async () => {
    fetchEventLiveMock.mockResolvedValue(live({ 1: 5, 2: 3, 3: 9 }));
    const squad: SavedSquad = {
      id: "s",
      name: "Draft",
      createdAt: 1,
      updatedAt: 1,
      playerIds: [1, 2, 3],
      startingXI: [1, 2],
      captainId: 1,
      viceCaptainId: 2,
      purchasePrices: {},
      usedChips: [],
      importedFrom: null,
      gameweekLog: [{ event: 8, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2 }],
    };
    const { result } = renderHook(() => useGameweekLog(squad, [event(8)], players, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows).toEqual([expect.objectContaining({ event: 8, points: 5 * 2 + 3, benchPoints: 9, average: 52, captain: { id: 1, points: 10 } })]);
  });

  it("reads an import's gameweeks from FPL", async () => {
    fetchEntryHistoryMock.mockResolvedValue({
      data: { current: [{ event: 8, points: 64, points_on_bench: 6, event_transfers: 1, event_transfers_cost: 4, rank: 10, overall_rank: 20 }], chips: [{ name: "wildcard", event: 8 }] },
    });
    const squad = { id: "i", importedFrom: { teamId: 77 }, gameweekLog: [] } as unknown as SavedSquad;
    const { result } = renderHook(() => useGameweekLog(squad, [event(8)], players, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows).toEqual([expect.objectContaining({ event: 8, points: 64, chip: "wildcard", transferCost: 4, overallRank: 20 })]);
  });
});

describe("GameweekSummary", () => {
  const windows: ChipWindow[] = [
    { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
    { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
  ];

  it("sets the squad against the average, names the captaincy with what each returned, and says where the chips stand", async () => {
    fetchEventLiveMock.mockResolvedValue(live({ 1: 7, 2: 4, 3: 15 }));
    const rows = [row({ event: 8, points: 60, average: 50, captain: { id: 1, points: 14 } }), row({ event: 9, points: 64, average: 52, captain: { id: 1, points: 14 } })];
    const { container, getByText } = render(
      <GameweekSummary
        open
        onClose={() => {}}
        squadName="Draft"
        rows={rows}
        events={[2, 3, 4, 5, 6, 7, 8, 9].map((id) => event(id))}
        chipWindows={windows}
        importTeamId={null}
        playersById={playersById}
        onViewProfile={() => {}}
      />,
    );
    expect(getByText("Gameweek 9")).toBeTruthy();
    expect([...container.querySelectorAll(".gw-points-diff")].map((d) => d.textContent)).toEqual(["+12 v average", "+22 v average"]);
    expect(getByText("Since GW8")).toBeTruthy();
    await waitFor(() => expect(container.querySelectorAll(".gw-lines-captaincy .gw-line:not(.gw-line-head)")[1].textContent).toContain("8"));
    const captaincy = [...container.querySelectorAll(".gw-lines-captaincy .gw-line:not(.gw-line-head)")].map((l) => l.textContent);
    expect(captaincy).toEqual(["Your captainSakaTMMID14", "Most captainedHaalandTMFWD8", "Top scorerPalmerTMMID30"]);
    // Wildcard: 80 of 1000 played since its window opened at GW2 (10 a gameweek), 1% this week.
    const wildcard = container.querySelectorAll(".gw-lines-chips .gw-line:not(.gw-line-head)")[0];
    expect(wildcard.textContent).toBe("Wildcard1.0%92%");
  });

  it("steps back a gameweek with ‹", () => {
    fetchEventLiveMock.mockResolvedValue(live({}));
    const rows = [row({ event: 8 }), row({ event: 9 })];
    const { getByText, getByRole } = render(
      <GameweekSummary open onClose={() => {}} squadName="Draft" rows={rows} events={[event(8), event(9)]} chipWindows={windows} importTeamId={null} playersById={playersById} onViewProfile={() => {}} />,
    );
    fireEvent.click(getByRole("button", { name: "Previous gameweek" }));
    expect(getByText("Gameweek 8")).toBeTruthy();
  });
});

describe("PriceChanges", () => {
  const movers = [
    makePlayer({ id: 1, position: "MID", name: "Up Small", price: 6, costChangeEvent: 0.1 }),
    makePlayer({ id: 2, position: "FWD", name: "Up Dear", price: 9, costChangeEvent: 0.1 }),
    makePlayer({ id: 3, position: "DEF", name: "Down", price: 5, costChangeEvent: -0.1 }),
    makePlayer({ id: 4, position: "DEF", name: "Still", price: 5, costChangeEvent: 0 }),
  ];

  it("lists risers dearest first and fallers apart, filtered by position", () => {
    expect(priceMovers(movers, "rise").map((p) => p.name)).toEqual(["Up Dear", "Up Small"]);
    const { container, getByRole } = render(<PriceChanges open onClose={() => {}} players={movers} gameweek={9} onViewProfile={() => {}} />);
    const names = () => [...container.querySelectorAll(".gw-player-name")].map((n) => n.textContent);
    expect(names()).toEqual(["Up Dear", "Up Small"]);
    expect(container.textContent).toContain("Since the GW9 deadline");
    fireEvent.click(getByRole("radio", { name: "Prices down since the deadline" }));
    expect(names()).toEqual(["Down"]);
    expect(container.querySelector(".gw-lines-prices .gw-line:not(.gw-line-head)")!.textContent).toContain("−£0.1m");
    fireEvent.click(getByRole("radio", { name: "Forwards" }));
    expect(container.textContent).toContain("No falls yet.");
  });
});
