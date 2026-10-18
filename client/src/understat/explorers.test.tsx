import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerExplorer } from "../pages/PlayerExplorer";
import { ExternalStatsContext, type ExternalStatsSource } from "../extensions/externalStats";
import { makePlayer, makeTeam } from "../test/fixtures";
import { understatPlayerColumns, understatTeamColumns } from "./columns";
import type { UsPlayerResolved } from "./resolve";
import type { UsPlayerTotals } from "./schema";

// Player Explorer with a second source mounted: the colour index, the
// per-column source toggle, and <one_source_per_figure>.

const TEAMS = [makeTeam({ id: 1, shortName: "ARS", name: "Arsenal" })];
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 50, xG: 3.21, minutes: 900 }),
  makePlayer({ id: 2, name: "Rice", position: "MID", teamId: 1, teamShortName: "ARS", totalPoints: 40, xG: 1.11, minutes: 900 }),
];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: [],
    advancedFieldAvailability: null,
    historicProfiles: new Map(),
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicRefreshing: false,
    refreshHistoricData: () => {},
    currentSeasonHasStarted: true,
    requestHistoricData: () => {},
  }),
}));

const slice = (shots = 0, goals = 0, xG = 0) => ({ shots, goals, xG });
const usTotals: UsPlayerTotals = {
  understatId: "u1", appearances: 10, minutes: 880, goals: 3, assists: 2, shots: 25, shotsOnTarget: 10, keyPasses: 15, xG: 4.56, xA: 2, npxG: 4.56, npGoals: 3,
  xGChain: 6, xGBuildup: 1, situations: { OpenPlay: slice(20, 3, 4), FromCorner: slice(5, 0, 0.56), SetPiece: slice(), DirectFreekick: slice(), Penalty: slice() },
  bodyParts: { RightFoot: slice(20, 2, 3.5), LeftFoot: slice(3, 1, 0.8), Head: slice(2, 0, 0.26), OtherBodyPart: slice() },
  shotsComplete: true,
};
const resolved: UsPlayerResolved = { totals: usTotals, seasons: 1 };

function fakeSource(staleNote: string | null = null): ExternalStatsSource {
  return {
    id: "understat",
    label: "Understat",
    className: "col-source-understat",
    icon: null,
    status: "ready",
    staleNote,
    request: () => {},
    // Only Saka is linked; Rice shows "—" for every Understat figure.
    playerColumns: () => understatPlayerColumns((p) => (p.id === 1 ? resolved : null)),
    teamColumns: () => understatTeamColumns(new Map(), () => null),
    guideSection: { id: "understat", navLabel: "Understat stats", title: "Understat stats", accentVar: "--col-understat", body: null },
  };
}

afterEach(cleanup);

function renderExplorer(source: ExternalStatsSource | null) {
  const utils = render(
    <ExternalStatsContext.Provider value={source}>
      <MemoryRouter>
        <PlayerExplorer />
      </MemoryRouter>
    </ExternalStatsContext.Provider>,
  );
  fireEvent.click(utils.getByRole("button", { name: "Current Season" }));
  return utils;
}

function header(container: HTMLElement, label: string): HTMLElement {
  const th = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th")).find((el) => el.childNodes[0]?.textContent?.trim() === label);
  if (!th) throw new Error(`No "${label}" column`);
  return th;
}

function cellUnder(container: HTMLElement, label: string, playerName: string): string {
  const headers = Array.from(container.querySelectorAll<HTMLElement>("table.data-table thead th"));
  const index = headers.findIndex((el) => el.childNodes[0]?.textContent?.trim() === label);
  const row = Array.from(container.querySelectorAll<HTMLElement>("table.data-table tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.includes(playerName))!;
  return row.children[index].textContent ?? "";
}

describe("Player Explorer with Understat mounted", () => {
  it("lists Understat's columns under their own violet headings, and shows them violet", () => {
    const { container, getByRole } = renderExplorer(fakeSource());
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    const popover = container.querySelector<HTMLElement>(".popover")!;
    const heading = within(popover).getByText("Understat · Shooting");
    expect(heading.closest(".menu-group-heading")?.classList.contains("col-source-understat")).toBe(true);
    fireEvent.click(within(popover).getByLabelText("Shots"));
    expect(header(container, "Shots").classList.contains("col-source-understat")).toBe(true);
    expect(cellUnder(container, "Shots", "Saka")).toBe("25");
    expect(cellUnder(container, "Shots", "Rice")).toBe("—");
  });

  it("switches a shared figure's whole column between FPL and Understat", () => {
    const { container } = renderExplorer(fakeSource());
    const xG = header(container, "xG");
    expect(xG.classList.contains("col-source-understat")).toBe(false);
    expect(xG.classList.contains("col-source-fpl")).toBe(true);
    expect(header(container, "Price").classList.contains("col-source-fpl")).toBe(false);
    expect(cellUnder(container, "xG", "Saka")).toBe("3.21");
    fireEvent.click(within(xG).getByRole("button", { name: /Click to show Understat's/ }));
    expect(header(container, "xG").classList.contains("col-source-understat")).toBe(true);
    expect(header(container, "xG").classList.contains("col-source-fpl")).toBe(false);
    expect(cellUnder(container, "xG", "Saka")).toBe("4.56");
    expect(cellUnder(container, "xG", "Rice")).toBe("—");
    fireEvent.click(within(header(container, "xG")).getByRole("button", { name: /Click to show FPL's/ }));
    expect(cellUnder(container, "xG", "Saka")).toBe("3.21");
  });

  it("shows shot-based figures as — where Understat's shot list was incomplete, the rest as normal", () => {
    const set = understatPlayerColumns(() => ({ totals: { ...usTotals, shotsComplete: false }, seasons: 1 }));
    const all = set.groups.flatMap((g) => g.columns);
    const byKey = (k: string) => all.find((c) => c.key === k)!.getValue(PLAYERS[0], {} as never);
    expect(byKey("us.shots")).toBeNull();
    expect(byKey("us.openPlayXG")).toBeNull();
    expect(byKey("us.keyPasses")).toBe(15);
    expect(set.alternates.xG.getValue(PLAYERS[0], {} as never)).toBe(4.56);
  });

  it("gives no toggle to figures the two sources agree on (Goals)", () => {
    const { container } = renderExplorer(fakeSource());
    expect(within(header(container, "Goals")).queryByRole("button", { name: /Click to show/ })).toBeNull();
  });

  it("marks Understat headers when its data is out of date", () => {
    const { container } = renderExplorer(fakeSource("Understat is behind"));
    fireEvent.click(within(header(container, "xG")).getByRole("button", { name: /Click to show Understat's/ }));
    expect(header(container, "xG").querySelector(".source-stale-marker")?.getAttribute("title")).toBe("Understat is behind");
  });

  it("with Understat switched off (no source), the page is the FPL page it always was", () => {
    const { container, getByRole } = renderExplorer(null);
    expect(within(header(container, "xG")).queryByRole("button", { name: /Click to show/ })).toBeNull();
    fireEvent.click(getByRole("button", { name: /^Columns/ }));
    expect(container.querySelector(".popover")?.textContent).not.toContain("Understat");
  });
});
