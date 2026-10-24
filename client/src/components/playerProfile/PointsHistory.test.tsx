import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PointsHistoryChart } from "./PointsHistory";
import { computeSeasonTrend } from "../../metrics/careerMetrics";

afterEach(cleanup);

// N.Jackson's shape (live API 2026-10-24): 2025/26 in FPL with 0 points in 0 minutes, on loan abroad.
const seasons = [
  { seasonName: "2023/24", totalPoints: 142, minutes: 2801 },
  { seasonName: "2024/25", totalPoints: 121, minutes: 2220 },
  { seasonName: "2025/26", totalPoints: 0, minutes: 0 },
];

describe("Points History — a season of 0 minutes (<no_minutes_no_figures>)", () => {
  it("shows — with no bar, and says on hover that he didn't play", () => {
    const { container } = render(<PointsHistoryChart seasons={seasons} countedSeasonNames={null} currentSeasonName={null} averagePoints={null} />);
    const cols = container.querySelectorAll(".points-history-col");
    expect(cols[2].querySelector(".points-history-value")?.textContent).toBe("—");
    expect((cols[2].querySelector(".points-history-bar") as HTMLElement).style.height).toBe("0px");
    expect(cols[2].getAttribute("title")).toBe("2025/26: didn't play");
    expect(cols[1].querySelector(".points-history-value")?.textContent).toBe("121");
  });

  it("still shows a club's season, which has no minutes", () => {
    const { container } = render(<PointsHistoryChart seasons={[{ seasonName: "2025/26", totalPoints: 0 }]} countedSeasonNames={null} currentSeasonName={null} averagePoints={null} />);
    expect(container.querySelector(".points-history-value")?.textContent).toBe("0");
  });

  it("the change badge compares the latest two seasons he played in", () => {
    expect(computeSeasonTrend(seasons)).toMatchObject({ pointsDelta: -21, previousSeason: "2023/24", latestSeason: "2024/25", direction: "down" });
  });

  it("is unknown when fewer than two seasons have a figure", () => {
    expect(computeSeasonTrend(seasons.slice(1)).direction).toBe("unknown");
  });
});
