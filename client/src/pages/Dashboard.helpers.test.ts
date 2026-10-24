import { describe, it, expect, vi, afterEach } from "vitest";
import { applyDefaultViewFloor, dashboardItemFloorNote, displayTileTitle, gameweekDisplay, playersForDashboardItem, playerTileRanks } from "./Dashboard";
import { playerTileMetricByKey } from "../components/summaryTileMetrics";
import { DEFAULT_DASHBOARD_GRAPHS } from "../state/useDashboardGraphs";
import { DEFAULT_SUMMARY_TILES } from "../state/useSummaryTiles";
import { isDefaultViewSelected } from "../state/useSavedDashboardViews";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import { makePlayer } from "../test/fixtures";
import { rankBars } from "../components/charts/BarTopN";
import type { NormalizedEvent, NormalizedPlayer } from "../types/normalized";

describe("rankBars — a bar graph's Order", () => {
  const data = [
    { id: 1, label: "Arsenal", value: 2 },
    { id: 2, label: "Spurs", value: 17 },
    { id: 3, label: "Man City", value: 3 },
    { id: 4, label: "Liverpool", value: 1 },
  ];

  it("ranks highest first by default", () => {
    expect(rankBars(data).map((d) => d.value)).toEqual([17, 3, 2, 1]);
  });

  it("ranks lowest first when ascending — League Position 1, 2, 3…", () => {
    expect(rankBars(data, true).map((d) => d.label)).toEqual(["Liverpool", "Arsenal", "Man City", "Spurs"]);
  });

  it("keeps at most 15", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, label: String(i), value: i }));
    expect(rankBars(many, true).map((d) => d.value)).toEqual(Array.from({ length: 15 }, (_, i) => i));
  });
});

describe("applyDefaultViewFloor", () => {
  const p = (id: number, minutes: number | null) => ({ id, minutes }) as NormalizedPlayer;
  const pool = [p(1, 1), p(2, 89), p(3, 90), p(4, 854), p(5, 855), p(6, null)];

  it("needs one full match in Current Season before five gameweeks are finished", () => {
    expect(applyDefaultViewFloor(pool, "live").map((x) => x.id)).toEqual([3, 4, 5]);
  });

  it("needs a quarter of a season (855 minutes) in the other views", () => {
    expect(applyDefaultViewFloor(pool, "lastSeason").map((x) => x.id)).toEqual([5]);
    expect(applyDefaultViewFloor(pool, "historicAverage").map((x) => x.id)).toEqual([5]);
  });
});

describe("gameweekDisplay — the Gameweek Status card", () => {
  afterEach(() => vi.useRealTimers());
  const ev = (id: number, deadlineTime: string, extra: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
    id,
    name: `Gameweek ${id}`,
    deadlineTime,
    finished: false,
    isCurrent: false,
    isNext: false,
    isPrevious: false,
    ...extra,
  });

  it("while a gameweek is being played, says so and counts down to the NEXT deadline (never its own, already-passed one)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    const current = ev(6, "2026-09-30T10:00:00Z", { isCurrent: true });
    const next = ev(7, "2026-10-10T10:00:00Z", { isNext: true });
    const d = gameweekDisplay({ kind: "current", event: current }, [current, next]);
    expect(d.heading).toBe("Gameweek 6");
    expect(d.sub).toMatch(/^In progress · next deadline /);
    expect(d.progress).toBeCloseTo(50, 5);
  });

  it("once the current gameweek has finished, shows the next one's deadline", () => {
    const current = ev(5, "2026-09-18T17:30:00Z", { isCurrent: true, finished: true });
    const next = ev(6, "2026-10-10T10:00:00Z", { isNext: true });
    const d = gameweekDisplay({ kind: "current", event: current }, [current, next]);
    expect(d.heading).toBe("Gameweek 6");
    expect(d.sub).toMatch(/^Deadline /);
  });

  it("in progress with no next gameweek (the season's last) has no bar", () => {
    const current = ev(38, "2027-05-23T14:00:00Z", { isCurrent: true });
    expect(gameweekDisplay({ kind: "current", event: current }, [current])).toEqual({ heading: "Gameweek 38", sub: "In progress", progress: null });
  });

  it("pre-season", () => {
    expect(gameweekDisplay({ kind: "pre-season" }, []).heading).toBe("Pre-season");
  });
});

describe("playersForDashboardItem — the fixed minutes floor is for the Default view only, on every player tile and graph (audit 2026-09-25 M1)", () => {
  // Reed-style one-cameo player next to a regular.
  const cameo = makePlayer({ id: 1, position: "MID", minutes: 89 });
  const regular = makePlayer({ id: 2, position: "MID", minutes: 2700 });
  const pool = [cameo, regular];
  const item = { dataView: "lastSeason" as const, criteria: DEFAULT_FILTERS, playerIds: null };

  it("a tile or graph the user built ranks everyone its own criteria let through", () => {
    const ids = playersForDashboardItem(item, pool, { defaultViewShown: false }).map((p) => p.id);
    expect(ids).toEqual([1, 2]);
  });

  it("its own Min Minutes is how the user sets a floor", () => {
    const withMin = { ...item, criteria: { ...DEFAULT_FILTERS, minMinutes: 450 } };
    expect(playersForDashboardItem(withMin, pool, { defaultViewShown: false }).map((p) => p.id)).toEqual([2]);
  });

  it("the Default view floors every player tile and graph, totals as well as per-game rates", () => {
    expect(playersForDashboardItem(item, pool, { defaultViewShown: true }).map((p) => p.id)).toEqual([2]);
  });

  it("picked players are never floored", () => {
    const picked = { ...item, playerIds: [1] };
    expect(playersForDashboardItem(picked, pool, { defaultViewShown: true }).map((p) => p.id)).toEqual([1]);
  });

  it("a picked list emptied by the season-id rollover shows nobody, never the whole league (audit 2026-10-18 R2)", () => {
    const emptied = { ...item, playerIds: [] as number[] };
    expect(playersForDashboardItem(emptied, pool, { defaultViewShown: false })).toEqual([]);
    expect(dashboardItemFloorNote({ dataView: "lastSeason", playerIds: [] }, { defaultViewShown: true })).toBe(
      dashboardItemFloorNote({ dataView: "lastSeason", playerIds: [1] }, { defaultViewShown: true }),
    );
  });

  it("R2: 'Default view' means the Default view is selected — not a tile carrying a packaged id, as views saved before v1.35.0 can", () => {
    // A user view saved by the old Save View: a copy of the Default's
    // default-points tile, since edited to PPG (Edit keeps the id).
    const oldUserView = { id: "view-old", tiles: [{ ...DEFAULT_SUMMARY_TILES[0], metricKey: "pointsPerGame" }] };
    const views = [{ id: "default-view-player" }, oldUserView];
    expect(isDefaultViewSelected(views, "view-old")).toBe(false);
    expect(isDefaultViewSelected(views, "default-view-player")).toBe(true);
    expect(isDefaultViewSelected(views, "view-deleted")).toBe(false);
    expect(isDefaultViewSelected(views, undefined)).toBe(false);
  });
});

describe("dashboardItemFloorNote — the minutes-floor badge shows exactly where the Default view applies a floor", () => {
  const item = { dataView: "lastSeason" as const, playerIds: null };

  it("every player tile or graph in the Default view gets the badge, naming the floor for its Data View", () => {
    expect(dashboardItemFloorNote(item, { defaultViewShown: true })).toContain("855+ minutes (a quarter of a season's minutes)");
    expect(dashboardItemFloorNote({ ...item, dataView: "live" }, { defaultViewShown: true })).toContain("90+ minutes (a quarter of the minutes in the gameweeks finished so far, never under one full match)");
  });

  it("Historic Average in the Default view also says only 855+ minute seasons count", () => {
    expect(dashboardItemFloorNote({ ...item, dataView: "historicAverage" }, { defaultViewShown: true })).toContain("Historic Average counts only seasons");
  });

  it("no badge where no threshold applies: a view the user builds with Min Minutes 0, and picked players, outside Historic Average", () => {
    expect(dashboardItemFloorNote(item, { defaultViewShown: false })).toBeNull();
    expect(dashboardItemFloorNote({ ...item, criteria: { ...DEFAULT_FILTERS, minMinutes: 0 } }, { defaultViewShown: false })).toBeNull();
    expect(dashboardItemFloorNote({ ...item, playerIds: [1] }, { defaultViewShown: true })).toBeNull();
  });

  it("<minutes_marker>: a tile the user builds shows it for its own Min Minutes, saying Historic Average's 855-minute seasons too", () => {
    expect(dashboardItemFloorNote({ ...item, criteria: { ...DEFAULT_FILTERS, minMinutes: 270 } }, { defaultViewShown: false })).toContain("your Min Minutes: only players with 270+ minutes");
    expect(dashboardItemFloorNote({ ...item, dataView: "historicAverage", criteria: { ...DEFAULT_FILTERS, minMinutes: 270 } }, { defaultViewShown: false })).toContain(
      "Historic Average counts only seasons of 855+ minutes",
    );
  });

  it("Historic Average's 855-minute seasons alone don't mark an item (the owner's rule, 2026-10-24): Min Minutes 0, or picked players", () => {
    expect(dashboardItemFloorNote({ ...item, dataView: "historicAverage" }, { defaultViewShown: false })).toBeNull();
    expect(dashboardItemFloorNote({ ...item, dataView: "historicAverage", playerIds: [1] }, { defaultViewShown: true })).toBeNull();
  });

  it("every packaged Default player tile and graph shows it", () => {
    for (const d of [...DEFAULT_SUMMARY_TILES, ...DEFAULT_DASHBOARD_GRAPHS].filter((t) => t.scope === "player")) {
      expect(dashboardItemFloorNote(d, { defaultViewShown: true }), d.id).not.toBeNull();
    }
  });
});

describe("tile titles (audit 2026-10-18 L1)", () => {
  it("a Highest First and a Lowest First tile of one metric (once the Starter's two Goals vs xG tiles) no longer share a title", () => {
    const desc = { name: null, direction: "desc" as const };
    const asc = { name: null, direction: "asc" as const };
    expect(displayTileTitle(desc, "Goals vs xG (Goals − xG)")).toBe("Goals vs xG (Goals − xG)");
    expect(displayTileTitle(asc, "Goals vs xG (Goals − xG)")).toBe("Goals vs xG (Goals − xG) · Lowest First");
  });
  it("a custom name is shown as given", () => {
    expect(displayTileTitle({ name: "Cheapest", direction: "asc" }, "Price")).toBe("Cheapest");
    // Only an order against the metric's natural one is named (audit 2026-10-23 in-app).
    expect(displayTileTitle({ name: null, direction: "asc" }, "League Position", false)).toBe("League Position");
    expect(displayTileTitle({ name: null, direction: "desc" }, "League Position", false)).toBe("League Position · Highest First");
  });
});

describe("playerTileRanks — a player tile's colours (<comparative_colouring>)", () => {
  const pool = [
    makePlayer({ id: 1, position: "DEF", minutes: 900, goals: 3 }),
    makePlayer({ id: 2, position: "DEF", minutes: 900, goals: 1 }),
    makePlayer({ id: 3, position: "DEF", minutes: 60, goals: 5 }),
    makePlayer({ id: 4, position: "FWD", minutes: 900, goals: 12 }),
    makePlayer({ id: 5, position: "FWD", minutes: 900, goals: 9 }),
  ];

  it("ranks each player within his position over the whole pool, the floor's small samples left out", () => {
    const ranks = playerTileRanks(playerTileMetricByKey("goals")!, pool, "live");
    expect(ranks.get(1)).toBe(75); // top of the two qualifying defenders, though the 60-minute cameo scored more
    expect(ranks.has(3)).toBe(false);
    expect(ranks.get(5)).toBe(25);
  });

  it("a lower-is-better total ranks on its rate, and a style figure isn't ranked at all", () => {
    const yellows = playerTileRanks(playerTileMetricByKey("yellowCards")!, [makePlayer({ id: 1, position: "MID", minutes: 900, yellowCards: 2, estimatedGames: 10 }), makePlayer({ id: 2, position: "MID", minutes: 1800, yellowCards: 3, estimatedGames: 20 })], "live");
    // 2 in 10 games is the worse rate, despite fewer cards.
    expect(yellows.get(1)).toBe(25);
    expect(playerTileRanks({ ...playerTileMetricByKey("goals")!, noColour: true }, pool, "live").size).toBe(0);
  });
});
