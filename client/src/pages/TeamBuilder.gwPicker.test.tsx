import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";
import { makePlayer, makeTeam } from "../test/fixtures";
import { saveVersioned } from "../state/persistentStorage";
import type { NormalizedFixture } from "../types/normalized";

// Add Players' own GW+1…GW+5 picker: it moves the table's Exp. Pts
// columns only. The pitch cards stay on GW+1, and so do their colours.

const TEAMS = [1, 2, 3, 4].map((id) => makeTeam({ id, shortName: ["ARS", "CHE", "BUR", "WOL"][id - 1], played: 10 }));
// FPL's ep_next 5 for Saka, 4 for the Chelsea pair: Saka is top at GW+1.
// At GW+2 Arsenal's match is FDR 5 (× 0.8) and Chelsea's FDR 1 (× 1.2): 4.0 against 4.8.
const PLAYERS = [
  makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS", minutes: 900, epNext: 5 }),
  makePlayer({ id: 2, name: "Palmer", position: "MID", teamId: 2, teamShortName: "CHE", minutes: 900, epNext: 4 }),
  makePlayer({ id: 3, name: "Enzo", position: "MID", teamId: 2, teamShortName: "CHE", minutes: 900, epNext: 4 }),
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
const FIXTURES = [match(1, 1, 1, 3, 2), match(2, 1, 2, 4, 2), match(3, 2, 1, 4, 5), match(4, 2, 2, 3, 1)];

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: PLAYERS,
    teams: TEAMS,
    teamsById: new Map(TEAMS.map((t) => [t.id, t])),
    fixtures: FIXTURES,
    events: [{ id: 1, isNext: true }],
    historicProfiles: new Map(),
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

describe("Team Building — Add Players' gameweek picker", () => {
  it("moves the table's Exp. Pts to the picked match; the pitch cards, and their colours, stay on GW+1", () => {
    const { container, getByRole } = render(
      <MemoryRouter initialEntries={["/team-building"]}>
        <TeamBuilder />
      </MemoryRouter>,
    );
    expect(fplCell(container, "Enzo")!.textContent).toBe("4.0");
    const sakaBefore = { text: card(container, "Saka").textContent, colour: card(container, "Saka").style.backgroundColor };
    const palmerColour = card(container, "Palmer").style.backgroundColor;
    expect(sakaBefore.text).toBe("5.0");
    expect(sakaBefore.colour).not.toBe(palmerColour);

    fireEvent.click(getByRole("radio", { name: /match 2 from now/ }));

    expect(fplCell(container, "Enzo")!.textContent).toBe("4.8");
    expect(card(container, "Saka").textContent).toBe(sakaBefore.text);
    expect(card(container, "Saka").style.backgroundColor).toBe(sakaBefore.colour);
    expect(card(container, "Palmer").style.backgroundColor).toBe(palmerColour);
  });
});
