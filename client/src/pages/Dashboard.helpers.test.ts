import { describe, it, expect, vi, afterEach } from "vitest";
import { applyRateStatFloor, gameweekDisplay, playersForDashboardItem, poolForDashboardItem, LIVE_RATE_STAT_MIN_MINUTES, RATE_STAT_MIN_MINUTES } from "./Dashboard";
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

describe("applyRateStatFloor", () => {
  const p = (id: number, minutes: number | null) => ({ id, minutes }) as NormalizedPlayer;
  const pool = [p(1, 1), p(2, 89), p(3, 90), p(4, 449), p(5, 450), p(6, null)];

  it("needs one full match in Current Season", () => {
    expect(LIVE_RATE_STAT_MIN_MINUTES).toBe(90);
    expect(applyRateStatFloor(pool, "live").map((x) => x.id)).toEqual([3, 4, 5]);
  });

  it("needs five full matches in the other views", () => {
    expect(RATE_STAT_MIN_MINUTES).toBe(450);
    expect(applyRateStatFloor(pool, "lastSeason").map((x) => x.id)).toEqual([5]);
    expect(applyRateStatFloor(pool, "historicAverage").map((x) => x.id)).toEqual([5]);
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

describe("playersForDashboardItem — the per-game minutes floor is for the Default view only (audit 2026-09-25 M1)", () => {
  // Reed-style one-cameo player next to a regular.
  const cameo = makePlayer({ id: 1, position: "MID", minutes: 89 });
  const regular = makePlayer({ id: 2, position: "MID", minutes: 2700 });
  const pool = [cameo, regular];
  const item = { dataView: "lastSeason" as const, criteria: DEFAULT_FILTERS, playerIds: null };

  it("a tile or graph the user built ranks everyone its own criteria let through, even on a per-game metric", () => {
    const ids = playersForDashboardItem(item, pool, { showsRate: true, defaultViewShown: false }).map((p) => p.id);
    expect(ids).toEqual([1, 2]);
  });

  it("its own Min Minutes is how the user sets a floor", () => {
    const withMin = { ...item, criteria: { ...DEFAULT_FILTERS, minMinutes: 450 } };
    expect(playersForDashboardItem(withMin, pool, { showsRate: true, defaultViewShown: false }).map((p) => p.id)).toEqual([2]);
  });

  it("a packaged default showing a per-game metric still gets the floor", () => {
    expect(playersForDashboardItem(item, pool, { showsRate: true, defaultViewShown: true }).map((p) => p.id)).toEqual([2]);
    expect(playersForDashboardItem(item, pool, { showsRate: false, defaultViewShown: true }).map((p) => p.id)).toEqual([1, 2]);
  });

  it("picked players are never floored", () => {
    const picked = { ...item, playerIds: [1] };
    expect(playersForDashboardItem(picked, pool, { showsRate: true, defaultViewShown: true }).map((p) => p.id)).toEqual([1]);
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

describe("poolForDashboardItem — Historic Average from fixed-floor seasons in the Default view only (audit 2026-09-25 player-team-profiles V2)", () => {
  const p = (id: number) => ({ id }) as NormalizedPlayer;
  const pools = {
    byMode: { live: [p(1)], lastSeason: [p(2)], historicAverage: [p(3)] },
    historicFixedFloorSeasons: [p(4)],
  };

  it("the packaged Default view reads the fixed-floor-seasons pool for Historic Average", () => {
    expect(poolForDashboardItem("historicAverage", true, pools).map((x) => x.id)).toEqual([4]);
  });

  it("a view the user builds keeps every season, and other Data Views are unchanged", () => {
    expect(poolForDashboardItem("historicAverage", false, pools).map((x) => x.id)).toEqual([3]);
    expect(poolForDashboardItem("lastSeason", true, pools).map((x) => x.id)).toEqual([2]);
    expect(poolForDashboardItem("live", true, pools).map((x) => x.id)).toEqual([1]);
  });
});
