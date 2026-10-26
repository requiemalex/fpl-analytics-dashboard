import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamBuilder } from "./TeamBuilder";

// Before any squad is loaded, "FPL team ID" says on hover where to find it:
// in the "No squad loaded" note and on the New Squad dialog's import field.

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    players: [],
    teams: [],
    teamsById: new Map(),
    fixtures: [],
    events: [],
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

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Team Building — FPL team ID hover", () => {
  it("tells you where to find your team ID, before a squad is loaded and in New Squad", () => {
    const { container, getByRole } = render(
      <MemoryRouter initialEntries={["/team-building"]}>
        <TeamBuilder />
      </MemoryRouter>,
    );
    const hints = () => [...container.querySelectorAll<HTMLElement>(".hint-term")].filter((el) => el.textContent === "FPL team ID");
    expect(hints()).toHaveLength(1);
    expect(hints()[0].title).toContain("open the Points tab, and it's the number after /entry/");
    fireEvent.click(getByRole("button", { name: "New Squad" }));
    expect(hints()).toHaveLength(2);
    const field = hints().find((el) => el.closest('label[for="new-squad-team-id"]'));
    expect(field!.title).toBe(hints()[0].title);
  });
});
