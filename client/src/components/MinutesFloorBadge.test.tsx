import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { isUnderMinimum } from "../metrics/fixedMinutesFloor";
import { RowSmallSampleBadge, smallSampleNote, userMinimumNote } from "./MinutesFloorBadge";
import { AnalysisModeToggle } from "./AnalysisModeToggle";

vi.mock("../state/AppStateContext", () => ({
  useAppState: () => ({
    historicStatus: "ready",
    historicErrorMessage: null,
    historicSkippedPlayerIds: [],
    historicFetchSkippedPlayerIds: [],
    refreshHistoricData: () => {},
    historicRefreshing: false,
  }),
}));

afterEach(cleanup);

describe("<no_data_is_zero>: no minutes for the mode counts as 0 against any minimum", () => {
  it("is under any minimum above 0, and meets a minimum of 0", () => {
    expect(isUnderMinimum(null, 1)).toBe(true);
    expect(isUnderMinimum(null, 0)).toBe(false);
    expect(isUnderMinimum(449, 450)).toBe(true);
    expect(isUnderMinimum(450, 450)).toBe(false);
  });

  it("a row with no minutes carries the amber stopwatch, saying it counts as 0", () => {
    const { container } = render(<RowSmallSampleBadge minutes={null} mode="lastSeason" />);
    expect(container.querySelector(".small-sample-badge")!.getAttribute("title")).toBe(
      "No minutes in this mode (counts as 0), under the 450-minute floor: its figures for this Data View have no percentiles or colours.",
    );
    expect(smallSampleNote(null, "live")).toContain("under the 90-minute floor");
  });

  it("a row at or above the floor has none", () => {
    const { container } = render(<RowSmallSampleBadge minutes={90} mode="live" />);
    expect(container.querySelector(".small-sample-badge")).toBeNull();
  });
});

describe("<minutes_marker>: the amber stopwatch on a view where a threshold is in force", () => {
  it("a player view's Data View toggle shows it in Historic Average (its 450-minute seasons), not in the other two", () => {
    const { container, rerender } = render(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} />);
    expect(container.querySelector(".small-sample-badge")!.getAttribute("title")).toContain("Historic Average counts only seasons of 450+ minutes");
    rerender(<AnalysisModeToggle mode="lastSeason" onChange={() => {}} />);
    expect(container.querySelector(".small-sample-badge")).toBeNull();
  });

  it("a club view's toggle never does: clubs have no minutes floor", () => {
    const { container } = render(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} clubFigures />);
    expect(container.querySelector(".small-sample-badge")).toBeNull();
  });

  it("names the user's own minimum", () => {
    expect(userMinimumNote(270, "live")).toContain("Your minimum minutes: 270");
    expect(userMinimumNote(900, "historicAverage")).toContain("Historic Average also counts only seasons of 450+ minutes");
  });
});
