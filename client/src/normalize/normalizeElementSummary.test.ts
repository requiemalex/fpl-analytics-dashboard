import { describe, it, expect } from "vitest";
import { normalizeElementSummary } from "./normalizeElementSummary";
import type { RawElementSummary } from "../types/raw";

// Shape of real history rows (Haaland, element 411, live API 2026-10-24):
// GW7 played 3–2, and GW8 at Villa listed before kick-off with both scores
// null and every figure 0.
function row(round: number, fixture: number, home: number | null, away: number | null, minutes: number) {
  return {
    element: 411, fixture, opponent_team: 2, total_points: minutes > 0 ? 13 : 0, was_home: true,
    kickoff_time: "2026-10-17T14:00:00Z", team_h_score: home, team_a_score: away, round, modified: false,
    minutes, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, own_goals: 0, penalties_saved: 0,
    penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0, starts: minutes > 0 ? 1 : 0,
    defensive_contribution: 0, tackles: 0, clearances_blocks_interceptions: 0, recoveries: 0,
    expected_goals: "0.00", expected_assists: "0.00", expected_goal_involvements: "0.00", expected_goals_conceded: "0.00",
  };
}

describe("<kicked_off_only> gameweek history", () => {
  it("leaves out a match FPL lists before kick-off, and keeps played and under-way ones", () => {
    const raw = { history: [row(7, 67, 3, 2, 90), row(8, 72, null, null, 0), row(8, 75, 0, 0, 0)], history_past: [] } as unknown as RawElementSummary;
    const rows = normalizeElementSummary(raw);
    expect(rows.map((r) => r.fixtureId)).toEqual([67, 75]);
  });

  it("keeps a match he missed: it has a score", () => {
    const raw = { history: [row(1, 3, 3, 2, 0)], history_past: [] } as unknown as RawElementSummary;
    expect(normalizeElementSummary(raw)).toHaveLength(1);
  });
});
