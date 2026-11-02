import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render as renderBare, renderHook, waitFor } from "@testing-library/react";
import { GameweekSummary } from "./GameweekSummary";
import { ChipsFigure, TransfersFigure } from "./SquadPlanning";
import { chipStatuses, type TransferStanding } from "../../metrics/squadTransfers";
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
  overallRank: 54321,
  rankedCount: 1000000,
  chip: null,
  captain: null,
  ...o,
});
const players = [makePlayer({ id: 1, position: "MID", name: "Saka" }), makePlayer({ id: 2, position: "FWD", name: "Haaland" }), makePlayer({ id: 3, position: "MID", name: "Palmer" })];
const playersById = new Map(players.map((p) => [p.id, p]));
const live = (points: Record<number, number>) => ({ data: Object.entries(points).map(([id, p]) => ({ id: Number(id), stats: { total_points: p, minutes: 90 } })) });

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
      transfers: null,
      importedFrom: null,
      gameweekLog: [{ event: 8, playerIds: [1, 2, 3], startingXI: [1, 2], captainId: 1, viceCaptainId: 2, transfers: 2, transferCost: 4, chip: "3xc" }],
    };
    const { result } = renderHook(() => useGameweekLog(squad, [event(8)], players, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    // Triple Captain: the captain three times; the transfers and hits Scoutline kept.
    expect(result.current.rows).toEqual([expect.objectContaining({ event: 8, points: 5 * 3 + 3, benchPoints: 9, average: 52, captain: { id: 1, points: 15 }, transfers: 2, transferCost: 4, chip: "3xc", rank: null, overallRank: null })]);
  });

  it("reads an import's gameweeks from FPL", async () => {
    fetchEntryHistoryMock.mockResolvedValue({
      data: { current: [{ event: 8, points: 64, points_on_bench: 6, event_transfers: 1, event_transfers_cost: 4, rank: 10, overall_rank: 20 }], chips: [{ name: "wildcard", event: 8 }] },
    });
    const squad = { id: "i", importedFrom: { teamId: 77 }, gameweekLog: [] } as unknown as SavedSquad;
    const { result } = renderHook(() => useGameweekLog(squad, [event(8)], players, 1));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows).toEqual([expect.objectContaining({ event: 8, points: 64, chip: "wildcard", transferCost: 4, rank: 10, overallRank: 20, rankedCount: 1000 })]);
  });
});

describe("GameweekSummary", () => {
  const windows: ChipWindow[] = [
    { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
    { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
  ];
  const logOf = (rows: GameweekLogRow[], source: GameweekLog["source"] = "recorded"): GameweekLog => ({ status: "ready", source, rows: [...rows].sort((a, b) => b.event - a.event), error: null });
  const tiles = (container: HTMLElement) => [...container.querySelectorAll(".gw-tiles .stat-tile")].map((t) => t.textContent);
  // The browser writes the colour its own way (spaces, trailing zeros): compare the numbers.
  const plain = (c: string | null | undefined) => (c ?? "").replace(/ /g, "").replace(/(\.\d*?)0+\)/, "$1)");

  it("sets the gameweek against the average and highest as tiles, names the captaincy with what each returned, and says where the chips stand", async () => {
    fetchEventLiveMock.mockResolvedValue(live({ 1: 7, 2: 4, 3: 15 }));
    const rows = [row({ event: 8, points: 60, average: 50, captain: { id: 1, points: 14 } }), row({ event: 9, points: 64, average: 52, captain: { id: 1, points: 14 }, chip: "wildcard" })];
    const { container, getByText } = render(
      <GameweekSummary
        open
        onClose={() => {}}
        squadName="Draft"
        log={logOf(rows)}
        events={[2, 3, 4, 5, 6, 7, 8, 9].map((id) => event(id))}
        chipWindows={windows}
        importTeamId={null}
        playersById={playersById}
        onViewProfile={() => {}}
      />,
    );
    expect(getByText("Gameweek 9")).toBeTruthy();
    // One gameweek only, and no rank: that's the Log's.
    expect(tiles(container)).toEqual(["Points64", "Average52", "Highest120", "Bench6", "Transfers1", "Hits−4"]);
    expect(container.querySelector(".gw-tiles .stat-tile")!.getAttribute("title")).toContain("+12 v the average");
    expect(container.textContent).not.toMatch(/to date|Since GW|GW rank/i);
    const captaincyRows = () => [...container.querySelectorAll('table[aria-label="Captaincy"] tbody tr')].map((l) => l.textContent);
    await waitFor(() => expect(captaincyRows()[1]).toContain("8"));
    expect(captaincyRows()).toEqual(["Your captainSakaTMMID14", "Most captainedHaalandTMFWD8", "Top scoring captainPalmerTMMID30"]);
    // Wildcard: 80 of 1000 played since its window opened at GW2 (10 a gameweek), 1% this week; this squad's own marked Used.
    const wildcard = container.querySelector('table[aria-label="Chips"] tbody tr')!;
    expect(wildcard.textContent).toBe("WildcardUsed1.0%92%");
  });

  it("<chip_used> marks a chip Used from the gameweek the squad played it, and not before", () => {
    fetchEventLiveMock.mockResolvedValue(live({}));
    const rows = [row({ event: 7 }), row({ event: 8, chip: "bboost" }), row({ event: 9 })];
    const { container, getByRole } = render(
      <GameweekSummary open onClose={() => {}} squadName="Draft" log={logOf(rows)} events={[7, 8, 9].map((id) => event(id))} chipWindows={windows} importTeamId={null} playersById={playersById} onViewProfile={() => {}} />,
    );
    const used = () => [...container.querySelectorAll('table[aria-label="Chips"] .gw-chip-used')].map((u) => [u.closest("tr")!.querySelector(".gw-chip-name")!.textContent, u.getAttribute("title")]);
    expect(used()).toEqual([["Bench BoostUsed", "This squad played it in GW8"]]);
    fireEvent.click(getByRole("button", { name: "Previous gameweek" }));
    expect(used()).toEqual([["Bench BoostUsed", "This squad played it this gameweek"]]);
    fireEvent.click(getByRole("button", { name: "Previous gameweek" }));
    expect(used()).toEqual([]);
    // The Log says which gameweek each chip was played in.
    fireEvent.click(getByRole("button", { name: "Show the Gameweek Log" }));
    expect([...container.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td")[1].textContent)).toEqual(["", "Bench Boost", ""]);
  });

  it("colours the points tile against the gameweek, as the Log does", () => {
    fetchEventLiveMock.mockResolvedValue(live({}));
    const { container } = render(
      <GameweekSummary open onClose={() => {}} squadName="Draft" log={logOf([row({ points: 120, average: 50, highest: 120 })])} events={[event(8)]} chipWindows={windows} importTeamId={null} playersById={playersById} onViewProfile={() => {}} />,
    );
    const tile = container.querySelector<HTMLElement>(".gw-tiles .stat-tile")!;
    expect(plain(tile.style.getPropertyValue("--tile-tint"))).toBe(plain(percentileTint(100)));
  });

  it("steps back a gameweek with ‹", () => {
    fetchEventLiveMock.mockResolvedValue(live({}));
    const { getByText, getByRole } = render(
      <GameweekSummary open onClose={() => {}} squadName="Draft" log={logOf([row({ event: 8 }), row({ event: 9 })])} events={[event(8), event(9)]} chipWindows={windows} importTeamId={null} playersById={playersById} onViewProfile={() => {}} />,
    );
    fireEvent.click(getByRole("button", { name: "Previous gameweek" }));
    expect(getByText("Gameweek 8")).toBeTruthy();
  });

  it("switches to the Gameweek Log with the arrow at its foot: an import's points, gameweek rank and overall rank, newest first, a row opening its Summary", () => {
    fetchEventLiveMock.mockResolvedValue(live({}));
    fetchEntryPicksMock.mockResolvedValue({ data: { picks: [] } });
    const rows = [row({ event: 8, points: 120, average: 50, highest: 120, rank: 1, rankedCount: 1000, overallRank: 1 }), row({ event: 9, points: 40, rank: 500, overallRank: 600 })];
    const { container, getByRole, getByText } = render(
      <GameweekSummary open onClose={() => {}} squadName="Draft" log={logOf(rows, "fpl")} events={[event(8), event(9)]} chipWindows={windows} importTeamId={77} playersById={playersById} onViewProfile={() => {}} />,
    );
    fireEvent.click(getByRole("button", { name: "Show the Gameweek Log" }));
    expect(getByText("Gameweek Log")).toBeTruthy();
    expect([...container.querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["GW", "Chip", "Points", "GW Rank", "Overall Rank"]);
    // FPL's green headers, as the profiles' Match Logs have.
    expect([...container.querySelectorAll("thead th")].every((h) => h.classList.contains("col-source-fpl"))).toBe(true);
    const body = [...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(body).toEqual([
      ["9", "", "40", "500", "600"],
      ["8", "", "120", "1", "1"],
    ]);
    // Points against the gameweek; ranks by their place among the managers ranked.
    const cells = container.querySelectorAll<HTMLElement>("tbody tr:last-child td");
    expect(plain(cells[2].style.background)).toBe(plain(percentileTint(100)));
    expect(plain(cells[3].style.background)).toBe(plain(percentileTint(100)));
    fireEvent.click(getByRole("button", { name: "Gameweek 8's Summary" }));
    expect(getByText("Gameweek 8")).toBeTruthy();
    expect(getByRole("button", { name: "Show the Gameweek Log" })).toBeTruthy();
  });

  it("a squad built here's Log has no rank columns: FPL ranks only its own teams", () => {
    fetchEventLiveMock.mockResolvedValue(live({}));
    const { container, getByRole } = render(
      <GameweekSummary open onClose={() => {}} squadName="Draft" log={logOf([row({ rank: null, overallRank: null })])} events={[event(8)]} chipWindows={windows} importTeamId={null} playersById={playersById} onViewProfile={() => {}} />,
    );
    fireEvent.click(getByRole("button", { name: "Show the Gameweek Log" }));
    expect([...container.querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["GW", "Chip", "Points"]);
    fireEvent.click(getByRole("button", { name: "Show the Gameweek Summary" }));
    expect(container.querySelector(".gw-tiles")).toBeTruthy();
  });
});

describe("<squad_transfers> TransfersFigure", () => {
  const standing = (o: Partial<TransferStanding> = {}): TransferStanding => ({
    event: 10,
    free: 1,
    freeBecause: null,
    banked: 1,
    made: 0,
    inIds: [],
    outIds: [],
    count: 0,
    left: 1,
    extra: 0,
    cost: 0,
    ...o,
  });
  const figure = (s: TransferStanding | null, isImport = false, handlers: { onConfirm?: () => void; onSetFree?: (n: number | null) => void } = {}) =>
    render(
      <TransfersFigure standing={s} isImport={isImport} playersById={playersById} onConfirm={handlers.onConfirm ?? (() => {})} onSetFree={handlers.onSetFree ?? (() => {})} onViewProfile={() => {}} />,
    );

  it("shows the free transfers left, and the hit once they're past", () => {
    const { container } = figure(standing({ free: 1, inIds: [2, 3], outIds: [1, 4], count: 2, left: 0, extra: 1, cost: 4 }));
    expect(container.querySelector(".squad-summary-value")!.textContent).toBe("0−4");
    expect(container.querySelector(".squad-summary-button")!.getAttribute("title")).toContain("1 transfer past the free ones: −4 points");
  });

  it("is unlimited in a first gameweek, drawn rather than typed", () => {
    const { container } = figure(standing({ free: null, freeBecause: "first", banked: null, left: null }));
    expect(container.querySelector(".squad-summary-value svg")).toBeTruthy();
    expect(container.querySelector(".squad-summary-button")!.getAttribute("title")).toMatch(/^Unlimited/);
  });

  it("confirms pending transfers with its tick, and lists them in its menu", () => {
    const onConfirm = vi.fn();
    const { getByRole, getByText } = figure(standing({ inIds: [2], outIds: [1], count: 1, left: 0 }), false, { onConfirm });
    fireEvent.click(getByRole("button", { name: "Confirm transfers" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("button", { name: /^Transfers/ }));
    expect(getByText("GW10 transfers")).toBeTruthy();
    expect(getByRole("button", { name: "View Saka's profile" })).toBeTruthy();
    expect(getByRole("button", { name: "View Haaland's profile" })).toBeTruthy();
  });

  it("shows the squad's own free transfers in the menu while a Wildcard makes them all free", () => {
    const { getByRole } = figure(standing({ free: null, freeBecause: "wildcard", banked: 2, left: null }));
    fireEvent.click(getByRole("button", { name: /^Transfers/ }));
    expect(getByRole("radio", { name: "2 free transfers" }).getAttribute("aria-checked")).toBe("true");
  });

  it("a squad built here sets its free transfers in the menu; an import's come from FPL", () => {
    const onSetFree = vi.fn();
    const { getByRole, unmount } = figure(standing(), false, { onSetFree });
    fireEvent.click(getByRole("button", { name: /^Transfers/ }));
    fireEvent.click(getByRole("radio", { name: "3 free transfers" }));
    expect(onSetFree).toHaveBeenCalledWith(3);
    fireEvent.click(getByRole("radio", { name: /^Unlimited/ }));
    expect(onSetFree).toHaveBeenCalledWith(null);
    unmount();
    const imported = figure(standing(), true);
    fireEvent.click(imported.getByRole("button", { name: /^Transfers/ }));
    expect(imported.queryByRole("radiogroup", { name: "Free transfers" })).toBeNull();
    expect(imported.getByRole("button", { name: /^Transfers/ }).getAttribute("title")).toContain("worked out from FPL's history of the team");
  });

  it("isn't known for an import until FPL is read", () => {
    const { container } = figure(null, true);
    expect(container.querySelector(".squad-summary-value")!.textContent).toBe("—");
  });
});

describe("<squad_chips> ChipsFigure", () => {
  const windows: ChipWindow[] = [
    { chip: "wildcard", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "freehit", half: 1, startEvent: 2, stopEvent: 19 },
    { chip: "bboost", half: 1, startEvent: 1, stopEvent: 19 },
    { chip: "3xc", half: 1, startEvent: 1, stopEvent: 19 },
  ];

  it("shows each chip, the spent ones dimmed and the one played lit, and plays or cancels from its menu", () => {
    const onPlay = vi.fn();
    const statuses = chipStatuses([{ chip: "wildcard", event: 3 }], windows, 10, "3xc");
    const { container, getByRole } = render(<ChipsFigure statuses={statuses} event={10} isImport={false} onPlay={onPlay} onMarkUsed={() => {}} />);
    expect([...container.querySelectorAll(".squad-chip-icon")].map((c) => c.className.replace("squad-chip-icon", "").trim())).toEqual(["is-spent", "", "", "is-playing"]);
    fireEvent.click(getByRole("button", { name: /^Chips/ }));
    fireEvent.click(getByRole("button", { name: "Triple Captain" }));
    expect(onPlay).toHaveBeenCalledWith(null);
    // One chip a gameweek: the others wait.
    expect(getByRole("button", { name: "Bench Boost" })).toHaveProperty("disabled", true);
  });

  it("a squad built here marks the chips it has already used by hand; an import's come from FPL", () => {
    const onMarkUsed = vi.fn();
    const statuses = chipStatuses([], windows, 10, null);
    const { getByRole, getAllByRole, unmount } = render(<ChipsFigure statuses={statuses} event={10} isImport={false} onPlay={() => {}} onMarkUsed={onMarkUsed} />);
    fireEvent.click(getByRole("button", { name: /^Chips/ }));
    fireEvent.click(getAllByRole("checkbox")[0]);
    expect(onMarkUsed).toHaveBeenCalledWith("wildcard", true);
    unmount();
    const imported = render(<ChipsFigure statuses={statuses} event={10} isImport onPlay={() => {}} onMarkUsed={() => {}} />);
    fireEvent.click(imported.getByRole("button", { name: /^Chips/ }));
    expect(imported.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
