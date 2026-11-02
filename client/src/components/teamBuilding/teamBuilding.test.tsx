import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render as renderBare, renderHook, waitFor } from "@testing-library/react";
import { GameweekLogTable } from "./GameweekLogTable";
import { GameweekSummary } from "./GameweekSummary";
import { resetEventLiveCache, useGameweekLog, type GameweekLog, type GameweekLogRow } from "../../state/useGameweekLog";
import { makePlayer } from "../../test/fixtures";
import { percentileTint } from "../../utils/colorScale";
import type { ChipWindow, EventSummary, NormalizedEvent } from "../../types/normalized";
import type { SavedSquad } from "../../types/team";

// <gameweek_log>, <gameweek_summary>

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
  rankedCount: 1000000,
  chip: null,
  captain: null,
  ...o,
});
const players = [makePlayer({ id: 1, position: "MID", name: "Saka" }), makePlayer({ id: 2, position: "FWD", name: "Haaland" }), makePlayer({ id: 3, position: "MID", name: "Palmer" })];
const playersById = new Map(players.map((p) => [p.id, p]));
const live = (points: Record<number, number>) => ({ data: Object.entries(points).map(([id, p]) => ({ id: Number(id), stats: { total_points: p, minutes: 90 } })) });

describe("GameweekLogTable", () => {
  it("an import shows FPL's columns for each gameweek, newest first, and nothing added up across them", () => {
    const log: GameweekLog = { status: "ready", source: "fpl", rows: [row({ event: 9, points: 40, transferCost: 0, chip: "bboost" }), row({ event: 8 })], error: null };
    const { container } = render(<GameweekLogTable log={log} playersById={playersById} onViewProfile={() => {}} />);
    expect([...container.querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["GW", "Points", "Average", "Highest", "Bench", "GW Rank", "Transfers", "Hits", "Chip"]);
    const body = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(body[0]).toEqual(["9", "40", "52", "120", "6", "12,345", "1", "0", "Bench Boost"]);
    expect(body[1][7]).toBe("−4");
    expect(container.querySelector("tfoot")).toBeNull();
  });

  it("<gameweek_points_colour> tints points against the gameweek's average and highest, and the rank by its place among managers", () => {
    const log: GameweekLog = { status: "ready", source: "fpl", rows: [row({ points: 120, average: 50, highest: 120, rank: 1 })], error: null };
    const { container } = render(<GameweekLogTable log={log} playersById={playersById} onViewProfile={() => {}} />);
    const cells = container.querySelectorAll<HTMLElement>("tbody td");
    // The browser writes the colour its own way (spaces, trailing zeros): compare the numbers.
    const plain = (c: string | null | undefined) => (c ?? "").replace(/ /g, "").replace(/(\.\d*?)0+\)/, "$1)");
    expect(plain(cells[1].style.background)).toBe(plain(percentileTint(100)));
    expect(plain(cells[5].style.background)).toBe(plain(percentileTint(100)));
    expect(cells[2].style.background).toBe("");
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
    expect(result.current.rows).toEqual([expect.objectContaining({ event: 8, points: 64, chip: "wildcard", transferCost: 4, rank: 10, rankedCount: 1000 })]);
  });
});

describe("GameweekSummary", () => {
  const windows: ChipWindow[] = [
    { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
    { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
  ];

  it("sets the gameweek against the average and highest, names the captaincy with what each returned, and says where the chips stand", async () => {
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
    // One gameweek only: no total to date.
    expect([...container.querySelectorAll(".gw-points-diff")].map((d) => d.textContent)).toEqual(["+12 v average"]);
    expect([...container.querySelectorAll(".gw-bar-row")].map((r) => r.textContent)).toEqual(["This squad64", "Average52", "Highest120"]);
    expect(container.textContent).not.toMatch(/to date|Since GW/);
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
