import { describe, it, expect } from "vitest";
import { normalizeSeasonHistory } from "./normalizeElementSummary";
import type { RawElementSummary } from "../types/raw";

// Shape of a real history_past row (Pickford, element 226, live API 2026-10-18):
// 2021/22 played 3,150 minutes but FPL carries starts 0 and xG/xA/xGI/xGC "0.00"
// because it didn't track them before 2022/23. CLAUDE.md: unavailable -> null, never 0.
function season(name: string, minutes: number, starts: number, xgc: string) {
  return {
    season_name: name, element_code: 1, start_cost: 50, end_cost: 50, total_points: 130, minutes,
    goals_scored: 0, assists: 0, clean_sheets: 10, goals_conceded: 58, own_goals: 0, penalties_saved: 0,
    penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 100, bonus: 10, bps: 600,
    influence: "0", creativity: "0", threat: "0", ict_index: "90.5", clearances_blocks_interceptions: 0,
    recoveries: 0, tackles: 0, defensive_contribution: 0, starts,
    expected_goals: "0.00", expected_assists: "0.00", expected_goal_involvements: "0.00", expected_goals_conceded: xgc,
  };
}

describe("history_past placeholders before FPL tracked starts / expected stats", () => {
  const raw = { history: [], fixtures: [], history_past: [season("2021/22", 3150, 0, "0.00"), season("2022/23", 3330, 37, "66.41")] } as unknown as RawElementSummary;

  it("keeps tracked seasons as real numbers (control)", () => {
    const s = normalizeSeasonHistory(raw).find((x) => x.seasonName === "2022/23")!;
    expect(s.starts).toBe(37);
    expect(s.xGC).toBeCloseTo(66.41);
  });

  it("[CALC-pre2223-placeholders] 2021/22 starts and xG-family are null, not a placeholder 0", () => {
    const s = normalizeSeasonHistory(raw).find((x) => x.seasonName === "2021/22")!;
    expect(s.starts).toBeNull();
    expect(s.xG).toBeNull();
    expect(s.xGC).toBeNull();
  });
});
