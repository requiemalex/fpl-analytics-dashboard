import { describe, expect, it } from "vitest";
import { dataViewSeasonLabel } from "./AnalysisModeToggle";

describe("the Data View picker's season label", () => {
  it("names the season each view covers", () => {
    expect(dataViewSeasonLabel("live", "2025/26", "2026/27")).toBe("2026/27");
    expect(dataViewSeasonLabel("lastSeason", "2025/26", "2026/27")).toBe("2025/26");
    expect(dataViewSeasonLabel("historicAverage", "2025/26", "2026/27")).toBe("2022/23–2025/26");
  });

  it("labels Current Season before the historic dataset loads, and the other two only after", () => {
    expect(dataViewSeasonLabel("live", null, "2026/27")).toBe("2026/27");
    expect(dataViewSeasonLabel("lastSeason", null, "2026/27")).toBeNull();
    expect(dataViewSeasonLabel("historicAverage", null, "2026/27")).toBeNull();
  });
});
