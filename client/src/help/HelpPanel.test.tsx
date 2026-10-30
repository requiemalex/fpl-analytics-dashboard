import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    status: "ready",
    lastUpdated: Date.now(),
    refreshing: false,
    refresh: () => {},
    players: [],
    errorMessage: null,
    gameweekState: null,
    events: [],
    isStale: false,
    staleDatasets: { fixtures: false, historic: false },
    fixturesUnavailable: false,
    advancedFieldAvailability: { expected_goals: true, defensive_contribution: false },
    validationReport: null,
    skippedPlayerCount: 0,
    skippedRecordCounts: { fixtures: 0, clubSeasons: 0 },
  }),
}));

const { AppShell } = await import("../components/AppShell");

afterEach(cleanup);

function shell(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell>
        <div />
      </AppShell>
    </MemoryRouter>,
  );
}

const helpButton = () => screen.getByRole("button", { name: "Help: ask how anything in Scoutline works" });
const helpLayer = () => document.querySelector(".help-panel")!.closest(".side-layer")!;
const ask = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Ask a question, or name a statistic", hidden: true }), { target: { value: text } });

describe("Help (<help_panel>)", () => {
  it("the magnifying glass opens it, says what it is on hover, and Esc closes it", () => {
    shell();
    expect(helpLayer().classList.contains("open")).toBe(false);
    expect(helpButton().getAttribute("title")).toBe("Help: ask how anything in Scoutline works");
    fireEvent.click(helpButton());
    expect(helpLayer().classList.contains("open")).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(helpLayer().classList.contains("open")).toBe(false);
  });

  it("shares the side panel with the Notepad: opening one closes the other", () => {
    shell();
    fireEvent.click(helpButton());
    fireEvent.click(screen.getByRole("button", { name: "Open notepad" }));
    expect(helpLayer().classList.contains("open")).toBe(false);
    const open = document.querySelectorAll(".side-layer.open");
    expect(open).toHaveLength(1);
    expect(open[0].querySelector(".help-panel")).toBeNull();
    fireEvent.click(helpButton());
    expect(helpLayer().classList.contains("open")).toBe(true);
    expect(document.querySelectorAll(".side-layer.open")).toHaveLength(1);
  });

  it("with nothing typed, lists this page's guides first", () => {
    shell("/team-building");
    fireEvent.click(helpButton());
    const groups = [...document.querySelectorAll(".help-group-title")].map((h) => h.textContent);
    expect(groups[0]).toBe("This page");
    const first = document.querySelector(".help-group .help-card-title")?.textContent;
    expect(first).toBe("Import your FPL team");
  });

  it("a question lists its best guide first, already open", () => {
    shell();
    fireEvent.click(helpButton());
    ask("who should i captain");
    const cards = document.querySelectorAll(".help-card");
    expect(cards[0].querySelector(".help-card-title")?.textContent).toBe("Best Draft and the captain");
    expect(cards[0].classList.contains("open")).toBe(true);
  });

  it("a related guide opens in its place", () => {
    shell();
    fireEvent.click(helpButton());
    ask("stopwatch");
    fireEvent.click(screen.getByRole("button", { name: /Setting a minimum minutes/, hidden: true }));
    const open = document.querySelector(".help-card.open .help-card-title")?.textContent;
    expect(open).toBe("Setting a minimum minutes");
  });

  it("names a statistic's meaning, as its hover does", () => {
    shell();
    fireEvent.click(helpButton());
    ask("bps");
    expect(document.querySelector(".help-stat .help-card-answer")?.textContent).toMatch(/^Bonus Points System/);
  });

  it("says so when nothing matches", () => {
    shell();
    fireEvent.click(helpButton());
    ask("zebra crossing");
    expect(document.querySelector(".help-empty")?.textContent).toContain('Nothing matches "zebra crossing"');
  });

  it("the data check lists what FPL didn't send", () => {
    shell();
    fireEvent.click(helpButton());
    ask("something looks wrong");
    expect(document.querySelector(".help-health")?.textContent).toContain("Defensive Contributions");
  });
});
