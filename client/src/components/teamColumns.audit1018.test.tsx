import React from "react";
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { teamColumnByKey } from "./teamColumns";
import { columnFilterPasses, EMPTY_COLUMN_FILTER } from "../state/useColumnFilters";
import { TopList } from "./TopList";
import { makePlayer } from "../test/fixtures";

describe("audit 2026-10-18: Team Explorer filters compare as displayed", () => {
  // README "Player Explorer / tables": filters compare a value as displayed (roundAsDisplayed).
  // In Historic Average a club's Goals For is a mean (e.g. 65.75), shown "66".
  it.fails("[PAGES-HA-FILTER] = 66 on Goals For finds a club shown as 66 (Historic Average mean 65.75)", () => {
    const col = teamColumnByKey("goalsFor")!;
    expect(col.format(65.75)).toBe("66");
    expect(columnFilterPasses(65.75, { ...EMPTY_COLUMN_FILTER, eq: 66 }, col.decimals)).toBe(true);
  });

  it.fails("[PAGES-HA-FILTER] League Position <= 2 keeps a club shown as 2nd (mean 2.25)", () => {
    const col = teamColumnByKey("leaguePosition")!;
    expect(col.format(2.25)).toBe("2");
    expect(columnFilterPasses(2.25, { ...EMPTY_COLUMN_FILTER, eq: 2 }, col.decimals)).toBe(true);
  });
});

describe("audit 2026-10-18: Dashboard tile bars", () => {
  // User Guide (Dashboard): "the top row's is full length, so a shorter bar shows how far behind that row is".
  it.fails("[PAGES-TILE-BAR] a Lowest First tile (e.g. Price, League Position) draws its top row full length", () => {
    const rows = [1, 2, 4].map((v, i) => ({ player: makePlayer({ id: i + 1, name: `P${i + 1}`, position: "MID" }), value: v }));
    const { container } = render(
      <MemoryRouter>
        <TopList title="Lowest first" rows={rows} format={(v) => String(v)} />
      </MemoryRouter>,
    );
    const widths = Array.from(container.querySelectorAll<HTMLElement>(".stat-row-bar-fill")).map((el) => el.style.width);
    cleanup();
    expect(widths[0]).toBe("100%");
  });
});
