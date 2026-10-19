import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePlayerHistory } from "./usePlayerHistory";

// An open profile's Match Log reloads with the live data (the 10-minute poll
// or Refresh Data), quietly: its rows stay until the new ones arrive.

const fetchElementSummaryMock = vi.fn();
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  fetchElementSummary: (...args: unknown[]) => fetchElementSummaryMock(...args),
}));

function summary(points: number) {
  return {
    data: {
      history: [
        {
          element: 1,
          fixture: 10,
          opponent_team: 2,
          total_points: points,
          was_home: true,
          kickoff_time: "2026-10-18T14:00:00Z",
          team_h_score: 1,
          team_a_score: 0,
          round: 8,
          minutes: 90,
          goals_scored: 0,
          assists: 0,
          clean_sheets: 1,
          goals_conceded: 0,
          bonus: 0,
          bps: 20,
          starts: 1,
          expected_goals: "0.10",
          expected_assists: "0.05",
          expected_goal_involvements: "0.15",
          expected_goals_conceded: "0.80",
        },
      ],
      history_past: [],
    },
    source: "live" as const,
    fetchedAt: 0,
  };
}

beforeEach(() => fetchElementSummaryMock.mockReset());

describe("usePlayerHistory — reloads with the live data", () => {
  it("reloads a loaded log when the version moves, forced only for Refresh Data, keeping its rows meanwhile", async () => {
    fetchElementSummaryMock.mockResolvedValueOnce(summary(2));
    const { result, rerender } = renderHook(({ v }) => usePlayerHistory(1, v), { initialProps: { v: { count: 1, forced: false } } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.history[0].totalPoints).toBe(2);

    // The poll: the proxy's copy (not forced); the old rows stay until it answers.
    let answer!: (v: unknown) => void;
    fetchElementSummaryMock.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    rerender({ v: { count: 2, forced: false } });
    expect(fetchElementSummaryMock).toHaveBeenLastCalledWith(1, { forceRefresh: false });
    expect(result.current.status).toBe("ready");
    expect(result.current.history[0].totalPoints).toBe(2);
    await act(async () => answer(summary(9)));
    expect(result.current.history[0].totalPoints).toBe(9);

    // Refresh Data: forced. A failed reload keeps the rows.
    fetchElementSummaryMock.mockRejectedValueOnce(new Error("502"));
    rerender({ v: { count: 3, forced: true } });
    expect(fetchElementSummaryMock).toHaveBeenLastCalledWith(1, { forceRefresh: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.history[0].totalPoints).toBe(9);
  });

  it("does nothing for the same version, or with no player open", async () => {
    fetchElementSummaryMock.mockResolvedValue(summary(2));
    const { result, rerender } = renderHook(({ id, v }) => usePlayerHistory(id, v), { initialProps: { id: 1 as number | null, v: { count: 1, forced: false } } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ id: 1, v: { count: 1, forced: false } });
    expect(fetchElementSummaryMock).toHaveBeenCalledTimes(1);
    rerender({ id: null, v: { count: 2, forced: false } });
    expect(fetchElementSummaryMock).toHaveBeenCalledTimes(1);
  });
});
