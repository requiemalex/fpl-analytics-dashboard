import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ComparisonTrend } from "./ComparisonTrend";
import { buildSeasonTrend, trendMetricByKey } from "../../metrics/careerTrends";
import { makePlayer, makeSeason } from "../../test/fixtures";

// jsdom has no layout, so ResponsiveContainer would measure 0 and draw nothing: give the chart a fixed size.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => React.cloneElement(children, { width: 600, height: 260 } as never),
  };
});

describe("ComparisonTrend — a season he didn't play carries the amber stopwatch (<no_data_is_zero>, the owner's rule, 2026-10-24)", () => {
  const metric = trendMetricByKey("totalPoints")!;
  const entries = [{ player: makePlayer({ id: 1, name: "Saka", position: "MID" }), color: "#3fbf7f" }];

  it("marks a 0-minute season on his dotted line between two played ones, as well as a light one at its point", () => {
    const seasons = new Map([
      [
        1,
        [
          makeSeason({ seasonName: "2022/23", totalPoints: 150, minutes: 2500 }),
          makeSeason({ seasonName: "2023/24", totalPoints: 0, minutes: 0 }),
          makeSeason({ seasonName: "2024/25", totalPoints: 40, minutes: 600 }),
          makeSeason({ seasonName: "2025/26", totalPoints: 180, minutes: 2800 }),
        ],
      ],
    ]);
    const rows = buildSeasonTrend([1], metric, seasons, 855);
    const { container } = render(<ComparisonTrend metric={metric} rows={rows} entries={entries} minMinutes={855} />);
    expect(container.querySelectorAll(".small-sample-mark")).toHaveLength(2);
  });

  it("marks one with no dotted line to sit on (his last season) on the chart's floor", () => {
    const seasons = new Map([[1, [makeSeason({ seasonName: "2024/25", totalPoints: 150, minutes: 2500 }), makeSeason({ seasonName: "2025/26", totalPoints: 0, minutes: 0 })]]]);
    const rows = buildSeasonTrend([1], metric, seasons, 855);
    const { container } = render(<ComparisonTrend metric={metric} rows={rows} entries={entries} minMinutes={855} />);
    expect(container.querySelectorAll(".small-sample-mark")).toHaveLength(1);
  });
});
