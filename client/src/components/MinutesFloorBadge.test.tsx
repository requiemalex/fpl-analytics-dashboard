import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { isUnderMinimum } from "../metrics/fixedMinutesFloor";
import { HideSmallSamplesButton, isSmallSample, MinutesFloorBadge, profileFloorNote, RowSmallSampleBadge, smallSampleNote, smallSamplesShownNote, userMinimumNote } from "./MinutesFloorBadge";
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
    expect(isUnderMinimum(854, 855)).toBe(true);
    expect(isUnderMinimum(855, 855)).toBe(false);
  });

  it("a row with no minutes carries the amber stopwatch, saying it counts as 0", () => {
    const { container } = render(<RowSmallSampleBadge minutes={null} mode="lastSeason" />);
    expect(container.querySelector(".small-sample-badge")!.getAttribute("title")).toBe(
      "No minutes in this mode (counts as 0), under the 855-minute floor: its figures for this Data View have no percentiles or colours.",
    );
    expect(smallSampleNote(null, "live")).toContain("under the 90-minute floor");
  });

  it("a row at or above the floor has none", () => {
    const { container } = render(<RowSmallSampleBadge minutes={90} mode="live" />);
    expect(container.querySelector(".small-sample-badge")).toBeNull();
  });
});

describe("<minutes_marker>: the stopwatch on a view where a threshold is in force", () => {
  it("a Data View toggle shows it only where a section passes a floor: Historic Average's 855-minute seasons alone don't (the owner's rule, 2026-10-24)", () => {
    const { container, rerender } = render(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} />);
    expect(container.querySelector(".minutes-floor-badge")).toBeNull();
    rerender(<AnalysisModeToggle mode="lastSeason" onChange={() => {}} />);
    expect(container.querySelector(".minutes-floor-badge")).toBeNull();
    rerender(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} floorNote={profileFloorNote("historicAverage")} />);
    expect(container.querySelector(".minutes-floor-badge")!.getAttribute("title")).toContain("Historic Average counts only seasons of 855+ minutes");
  });

  it("a club view's toggle never does: clubs have no minutes floor", () => {
    const { container } = render(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} clubFigures />);
    expect(container.querySelector(".minutes-floor-badge")).toBeNull();
  });

  it("<marker_follows_data>: grey while nothing shown is under the threshold, amber once something is", () => {
    const note = profileFloorNote("historicAverage");
    const { container, rerender } = render(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} floorNote={note} />);
    const badge = () => container.querySelector(".minutes-floor-badge")!;
    expect(badge().classList.contains("small-sample-badge")).toBe(false);
    expect(badge().getAttribute("title")).toContain("Nothing shown here is under it.");
    rerender(<AnalysisModeToggle mode="historicAverage" onChange={() => {}} floorNote={note} floorActive />);
    expect(badge().classList.contains("small-sample-badge")).toBe(true);
    expect(badge().getAttribute("title")).not.toContain("Nothing shown here");
  });

  it("<marker_follows_data>: a view's badge says how many shown are under it", () => {
    const { container } = render(<MinutesFloorBadge note={smallSamplesShownNote("Your minimum minutes: 0.", 2, "lastSeason")} active />);
    expect(container.querySelector(".small-sample-badge")!.getAttribute("title")).toBe("Your minimum minutes: 0. 2 players shown here are under the 855-minute floor.");
  });

  it("an entry's stopwatch is always amber", () => {
    const { container } = render(<RowSmallSampleBadge minutes={10} mode="live" />);
    expect(container.querySelector(".minutes-floor-badge")!.classList.contains("small-sample-badge")).toBe(true);
  });

  it("names the user's own minimum", () => {
    expect(userMinimumNote(270, "live")).toContain("Your minimum minutes: 270");
    expect(userMinimumNote(900, "historicAverage")).toContain("Historic Average also counts only seasons of 855+ minutes");
  });
});

describe("<hide_small_samples>: the Hide button", () => {
  it("is the same test as the entry stopwatch: under the fixed floor, no minutes counting as 0", () => {
    expect(isSmallSample(89, "live")).toBe(true);
    expect(isSmallSample(90, "live")).toBe(false);
    expect(isSmallSample(null, "historicAverage")).toBe(true);
    expect(isSmallSample(854, "lastSeason")).toBe(true);
    expect(isSmallSample(855, "lastSeason")).toBe(false);
  });

  it("appears only when there's something to hide, or while it's on, and toggles", () => {
    let toggled = 0;
    const { container, rerender } = render(<HideSmallSamplesButton hidden={false} count={0} mode="live" onToggle={() => toggled++} />);
    expect(container.querySelector("button")).toBeNull();
    rerender(<HideSmallSamplesButton hidden={false} count={3} mode="live" onToggle={() => toggled++} />);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Hide the 3 players under the 90-minute floor (marked with the amber stopwatch)");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(toggled).toBe(1);
    rerender(<HideSmallSamplesButton hidden count={0} mode="lastSeason" onToggle={() => toggled++} />);
    expect(container.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("button")!.getAttribute("aria-label")).toContain("Show the players under the 855-minute floor again");
  });
});
