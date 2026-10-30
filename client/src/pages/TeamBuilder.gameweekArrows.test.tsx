import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { NormalizedFixture } from "../types/normalized";
import { addPlayersCell, addPlayersHeader, openAddPlayers } from "../test/addPlayers";

// Add Players' and the pitch's own gameweek arrows (<gameweek_arrows>,
// GW1, GW2… by FPL's numbering): each moves only its own figures. The
// table's move its Exp. Pts columns; the pitch's move the cards, and
// their colours, which rank the pitch's gameweek among every player.

const TEAMS = [1, 2, 3, 4].map((id) => makeTeam({ id, shortName: ["ARS", "CHE", "BUR", "WOL"][id - 1], played: 10 }));
// FPL's ep_next 5 for Saka, 4 for the Chelsea pair: Saka is top at GW+1
// (FDR 3, × 1; no season matches loaded, so FPL Official is ep_next × FDR alone, <fpl_official>).
// In GW2 Arsenal's match is FDR 5 (× 0.8) and Chelsea's FDR 1 (× 1.2): 4.0 against 4.8.
// In GW3 Arsenal blank and Chelsea have a double (FDR 3, × 1 each): 4.0 + 4.0.
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, epNext: 5 }),
  makePlayer({ id: 2, name: "Palmer", position: "MID", teamId: 2, teamShortName: "CHE", minutes: 900, epNext: 4 }),
  makePlayer({ id: 3, name: "Enzo", position: "MID", teamId: 2, teamShortName: "CHE", minutes: 900, epNext: 4 }),
  makePlayer({ id: 4, name: "Odegaard", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, epNext: 3 }),
];
const match = (id: number, eventId: number, homeTeamId: number, awayTeamId: number, homeDifficulty: number): NormalizedFixture => ({
  id,
  eventId,
  homeTeamId,
  awayTeamId,
  homeScore: null,
  awayScore: null,
  kickoffTime: null,
  finished: false,
  started: false,
  homeDifficulty,
  awayDifficulty: 3,
});
const FIXTURES = [match(1, 1, 1, 3, 3), match(2, 1, 2, 4, 3), match(3, 2, 1, 4, 5), match(4, 2, 2, 3, 1), match(5, 3, 2, 3, 3), match(6, 3, 4, 2, 3)];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: FIXTURES,
    events: [1, 2, 3].map((id) => ({ id, isNext: id === 1 })),
    historicProfiles: new Map(),
    clubSeasons: [],
    historicReferenceSeason: null,
    historicFetchSkippedPlayerIds: [],
    historicSkippedPlayerIds: [],
    historicErrorMessage: null,
    historicRefreshing: false,
    refreshHistoricData: () => {},
    advancedFieldAvailability: null,
    seasonMatchesByPlayerId: new Map(),
    historicStatus: "ready",
    currentSeasonHasStarted: true,
    gameweekState: null,
    requestHistoricData: () => {},
  }),
}));

beforeEach(() => {
  localStorage.clear();
  saveVersioned("fpl-dashboard:saved-squads:v1", 1, [
    { id: "s1", name: "Test", createdAt: 0, updatedAt: 0, playerIds: [1, 2], startingXI: [1, 2], captainId: null, viceCaptainId: null, usedChips: [], importedFrom: null },
  ]);
});
afterEach(cleanup);

const fplCell = (container: HTMLElement, name: string) => addPlayersCell(container, "Exp. Pts (FPL Official)", name);

function card(container: HTMLElement, name: string): HTMLElement {
  return Array.from(container.querySelectorAll<HTMLElement>(".pitch .pitch-card")).find((c) => c.querySelector(".pitch-card-name")?.textContent?.includes(name))!.querySelector<HTMLElement>(".pitch-card-figure")!;
}

/** The pitch's gameweek arrows (Add Players has none: its Exp. Pts columns pick how many gameweeks to add up). */
function pitchArrows(container: HTMLElement) {
  const group = container.querySelector<HTMLElement>(".squad-pitch .gameweek-arrows")!;
  return {
    shown: () => group.querySelector(".gameweek-arrows-value")!.textContent,
    next: () => fireEvent.click(group.querySelector<HTMLElement>('[aria-label="Next gameweek"]')!),
  };
}

/** <points_horizon>: picks how many gameweeks a column's Exp. Pts adds up. */
function pickHorizon(container: HTMLElement, label: string, gameweeks: number) {
  fireEvent.change(addPlayersHeader(container, label)!.querySelector("select.horizon-picker")!, { target: { value: String(gameweeks) } });
}

function renderBuilder() {
  const utils = render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
  openAddPlayers(utils);
  return utils;
}

const projected = (container: HTMLElement) => container.querySelector(".squad-summary-figure .squad-summary-value")!.textContent;

describe("Team Building — gameweeks", () => {
  it("<points_horizon> an Exp. Pts column adds up as many gameweeks as its header picks, a blank counting 0; the pitch stays where its arrows are", () => {
    const { container } = renderBuilder();
    expect(fplCell(container, "Enzo")!.textContent).toBe("4.0");
    expect(fplCell(container, "Odegaard")!.textContent).toBe("3.0");
    pickHorizon(container, "Exp. Pts (FPL Official)", 3);
    // GW1 4.0 + GW2 4.8 (FDR 1) + GW3 8.0 (a double); Odegaard 3.0 + 2.4 (FDR 5) + a blank.
    expect(fplCell(container, "Enzo")!.textContent).toBe("16.8");
    expect(fplCell(container, "Enzo")!.title).toContain("FPL figures, next 3 gameweeks: 16.8 pts");
    expect(fplCell(container, "Enzo")!.title).toContain("GW3 v BUR (H) and v WOL (A): 8.0");
    expect(fplCell(container, "Odegaard")!.textContent).toBe("5.4");
    expect(fplCell(container, "Odegaard")!.title).toContain("GW3: no match");
    expect(pitchArrows(container).shown()).toBe("GW1");
    expect(card(container, "Saka").textContent).toBe("5.0");
  });

  it("the pitch's arrows move the cards, their colours and Projected Points; Add Players stays", () => {
    const { container } = renderBuilder();
    const sakaColour = card(container, "Saka").style.backgroundColor;
    expect(card(container, "Saka").textContent).toBe("5.0");
    // <projected_points>: the XI (Saka, Palmer), no captain.
    expect(projected(container)).toBe("9.0");
    pitchArrows(container).next();
    // GW2: Arsenal FDR 5 (5 × 0.8), Chelsea FDR 1 (4 × 1.2). Saka is no longer the top midfielder.
    expect(card(container, "Saka").textContent).toBe("4.0");
    expect(card(container, "Palmer").textContent).toBe("4.8");
    expect(card(container, "Saka").style.backgroundColor).not.toBe(sakaColour);
    expect(projected(container)).toBe("8.8");
    expect(fplCell(container, "Enzo")!.textContent).toBe("4.0");
  });

  it("a double gameweek's two matches add up on the pitch, and a blank shows as no match", () => {
    const { container } = renderBuilder();
    pitchArrows(container).next();
    pitchArrows(container).next();
    expect(pitchArrows(container).shown()).toBe("GW3");
    expect(card(container, "Palmer").textContent).toBe("8.0");
    expect(card(container, "Palmer").title).toContain("FPL figures v BUR (H): 4.0 pts");
    expect(card(container, "Palmer").title).toContain("\nFPL figures v WOL (A): 4.0 pts");
    expect(card(container, "Saka").textContent).toBe("—");
    expect(card(container, "Saka").title).toContain("No match in GW3");
    // Saka's blank adds 0 to Projected Points.
    expect(projected(container)).toBe("8.0");
  });
});

describe("Team Building — the squad's heading", () => {
  it("is the page's section heading, as the Dashboard's: an icon and just the squad's name, no formation or player count", () => {
    const { container } = renderBuilder();
    const heading = container.querySelector("h2.section-heading")!;
    expect(heading.querySelector(".section-heading-icon svg")).toBeTruthy();
    expect(heading.textContent).toBe("Test");
    // Under it the squad picker (<squad_picker>), then the squad's summary and pitch.
    expect(heading.nextElementSibling!.classList.contains("squad-picker-row")).toBe(true);
    expect(heading.nextElementSibling!.nextElementSibling!.querySelector(".squad-pitch .squad-summary")).toBeTruthy();
  });

  it("<squad_picker> renames the squad in its box, switches squad from its list, and has New Squad and Delete as icons", () => {
    saveVersioned("fpl-dashboard:saved-squads:v1", 1, [
      { id: "s1", name: "Test", createdAt: 0, updatedAt: 0, playerIds: [1, 2], startingXI: [1, 2], captainId: null, viceCaptainId: null, usedChips: [], importedFrom: null },
      { id: "s2", name: "Wildcard", createdAt: 0, updatedAt: 0, playerIds: [3], startingXI: [3], captainId: null, viceCaptainId: null, usedChips: [], importedFrom: null },
    ]);
    const { container, getByRole, queryByRole, queryByLabelText } = renderBuilder();
    const heading = () => container.querySelector("h2.section-heading")!.textContent;
    // No separate Squad select or Name box any more.
    expect(container.querySelector("#squad-select")).toBeNull();
    expect(queryByLabelText("Name")).toBeNull();
    const box = getByRole("textbox", { name: /^Squad name/ }) as HTMLInputElement;
    expect(box.value).toBe("Test");
    fireEvent.change(box, { target: { value: "Eze Peasy" } });
    expect(heading()).toBe("Eze Peasy");
    fireEvent.click(getByRole("button", { name: "Switch squad" }));
    const options = [...getByRole("listbox", { name: "Saved squads" }).querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.textContent)).toEqual(["Eze Peasy", "Wildcard"]);
    fireEvent.click(options[1]);
    expect(queryByRole("listbox")).toBeNull();
    expect(heading()).toBe("Wildcard");
    expect(box.value).toBe("Wildcard");
    expect(getByRole("button", { name: "New Squad" }).querySelector("svg")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Delete Squad" }));
    expect(getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("has no formation warning: the pitch shows a starting XI short of 11", () => {
    const { container } = renderBuilder();
    expect(container.textContent).not.toMatch(/Formation:|Starting XI has/);
  });
});
