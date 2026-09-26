import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TopList } from "./TopList";
import { makePlayer } from "../test/fixtures";

afterEach(cleanup);

describe("TopList — a player row", () => {
  it("reads club pill, position, name, bar, value — in that order", () => {
    const player = makePlayer({ id: 1, name: "Saka", position: "MID", teamId: 1, teamShortName: "ARS" });
    const { container } = render(
      <MemoryRouter>
        <TopList title="Total Points" rows={[{ player, value: 40 }]} format={(v) => String(v)} />
      </MemoryRouter>,
    );
    const row = container.querySelector(".stat-row")!;
    const name = row.querySelector(".stat-row-name")!;
    const [team, position] = [...name.querySelectorAll(".badge")];
    expect(team.classList.contains("team-badge")).toBe(true);
    expect(team.textContent).toBe("ARS");
    expect(position.textContent).toBe("MID");
    expect(team.compareDocumentPosition(position) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.textContent).toBe("ARSMIDSaka");
    expect([...row.children].map((c) => c.className)).toEqual(["stat-row-name", "stat-row-bar-track", "stat-row-value"]);
  });
});
