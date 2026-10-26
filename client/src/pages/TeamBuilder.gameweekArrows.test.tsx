import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { NormalizedFixture } from "../types/normalized";

// Add Players' and the pitch's own gameweek arrows (<gameweek_arrows>,
// GW1, GW2… by FPL's numbering): each moves only its own figures. The
// table's move its Exp. Pts columns; the pitch's move the cards, and
// their colours, which rank the pitch's gameweek among every player.

const TEAMS = [1, 2, 3, 4].map((id) => makeTeam({ id, shortName: ["ARS", "CHE", "BUR", "WOL"][id - 1], played: 10 }));
// FPL's ep_next 5 for Saka, 4 for the Chelsea pair: Saka is top at GW+1.
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
const FIXTURES = [match(1, 1, 1, 3, 2), match(2, 1, 2, 4, 2), match(3, 2, 1, 4, 5), match(4, 2, 2, 3, 1), match(5, 3, 2, 3, 3), match(6, 3, 4, 2, 3)];

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

function fplCell(container: HTMLElement, name: string): HTMLElement | undefined {
  const headers = Array.from(container.querySelectorAll<HTMLElement>("table.data-table.compact thead th"));
  const index = headers.findIndex((th) => th.childNodes[0]?.textContent?.trim() === "Exp. Pts (FPL Official)");
  const row = Array.from(container.querySelectorAll("table.data-table.compact tbody tr")).find((tr) => tr.querySelector(".name")?.textContent?.trim() === name);
  return row?.querySelectorAll<HTMLElement>("td")[index];
}

function card(container: HTMLElement, name: string): HTMLElement {
  return Array.from(container.querySelectorAll<HTMLElement>(".pitch .pitch-card")).find((c) => c.querySelector(".pitch-card-name")?.textContent?.includes(name))!.querySelector<HTMLElement>(".pitch-card-figure")!;
}

/** The pitch's arrows, or the table's (the ones outside the pitch). */
function arrows(container: HTMLElement, which: "pitch" | "table") {
  const groups = Array.from(container.querySelectorAll<HTMLElement>(".gameweek-arrows"));
  const group = groups.find((g) => (g.closest(".squad-pitch") !== null) === (which === "pitch"))!;
  return {
    shown: () => group.querySelector(".gameweek-arrows-value")!.textContent,
    next: () => fireEvent.click(group.querySelector<HTMLElement>('[aria-label="Next gameweek"]')!),
  };
}

function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={["/team-building"]}>
      <TeamBuilder />
    </MemoryRouter>,
  );
}

describe("Team Building — the gameweek arrows", () => {
  it("the table's move its Exp. Pts to the picked gameweek; the pitch cards, and their colours, stay where the pitch's arrows are", () => {
    const { container } = renderBuilder();
    expect(fplCell(container, "Enzo")!.textContent).toBe("4.0");
    const sakaBefore = { text: card(container, "Saka").textContent, colour: card(container, "Saka").style.backgroundColor };
    const palmerColour = card(container, "Palmer").style.backgroundColor;
    expect(sakaBefore.text).toBe("5.0");
    expect(sakaBefore.colour).not.toBe(palmerColour);

    const table = arrows(container, "table");
    expect(table.shown()).toBe("GW1");
    table.next();
    expect(table.shown()).toBe("GW2");

    expect(fplCell(container, "Enzo")!.textContent).toBe("4.8");
    expect(arrows(container, "pitch").shown()).toBe("GW1");
    expect(card(container, "Saka").textContent).toBe(sakaBefore.text);
    expect(card(container, "Saka").style.backgroundColor).toBe(sakaBefore.colour);
    expect(card(container, "Palmer").style.backgroundColor).toBe(palmerColour);
  });

  it("the pitch's move the cards and their colours; the table stays", () => {
    const { container } = renderBuilder();
    const sakaColour = card(container, "Saka").style.backgroundColor;
    arrows(container, "pitch").next();
    // GW2: Arsenal FDR 5 (5 × 0.8), Chelsea FDR 1 (4 × 1.2). Saka is no longer the top midfielder.
    expect(card(container, "Saka").textContent).toBe("4.0");
    expect(card(container, "Palmer").textContent).toBe("4.8");
    expect(card(container, "Saka").style.backgroundColor).not.toBe(sakaColour);
    expect(arrows(container, "table").shown()).toBe("GW1");
    expect(fplCell(container, "Enzo")!.textContent).toBe("4.0");
  });

  it("adds up a double gameweek's two matches, and shows a blank as no match", () => {
    const { container } = renderBuilder();
    const table = arrows(container, "table");
    table.next();
    table.next();
    expect(table.shown()).toBe("GW3");
    expect(fplCell(container, "Enzo")!.textContent).toBe("8.0");
    expect(fplCell(container, "Enzo")!.title).toContain("FPL's expected points for GW3 v BUR (H) and v WOL (A)");
    expect(fplCell(container, "Odegaard")!.textContent).toBe("—");
    expect(fplCell(container, "Odegaard")!.title).toContain("No match in GW3");
  });
});
