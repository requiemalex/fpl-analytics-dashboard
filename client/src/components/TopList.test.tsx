import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
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

describe("<keyboard_reachable> a player's name opens his profile from the keyboard (audit 2026-10-23 in-app)", () => {
  it("is a Tab stop named for what it does, and Enter or Space opens the profile, once", () => {
    const player = makePlayer({ id: 7, name: "Saka", position: "MID" });
    const onSelect = vi.fn();
    const { getByRole } = render(
      <MemoryRouter>
        <TopList title="Total Points" rows={[{ player, value: 40 }]} format={(v) => String(v)} onSelect={onSelect} />
      </MemoryRouter>,
    );
    const name = getByRole("button", { name: "View Saka's profile" });
    expect(name.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.keyDown(name, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
    fireEvent.click(name);
    expect(onSelect).toHaveBeenCalledTimes(3); // the row's own click doesn't open it a second time
  });
});
