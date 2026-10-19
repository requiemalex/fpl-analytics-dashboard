import { describe, expect, it } from "vitest";
import { cellText, columnApplies, columnByKey, columnFormatForMode, columnForMode, countDecimals } from "./playerColumns";
import { teamColumnByKey, teamColumnForMode } from "./teamColumns";
import { PLAYER_TILE_METRICS } from "./summaryTileMetrics";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { makePlayer } from "../test/fixtures";

const col = (key: string) => columnByKey(key)!;

describe("<position_only_figures>: a figure a position can't have is blank, never 0 or —", () => {
  const keeper = makePlayer({ id: 1, position: "GKP", defensiveContributions: 0, defensiveContributionsPerGame: 0, saves: 80, savesPerGame: 2.1, penaltiesSaved: 1 });
  const defender = makePlayer({ id: 2, position: "DEF", defensiveContributions: 120, defensiveContributionsPerGame: 3.2, saves: 0, savesPerGame: 0, penaltiesSaved: 0 });

  it("a goalkeeper's Defensive Contributions and an outfielder's saves", () => {
    for (const key of ["defensiveContributions", "defensiveContributionsPerGame"]) {
      expect(columnApplies(col(key), "GKP")).toBe(false);
      expect(cellText(col(key), keeper, getPlayerDerivedMetrics(keeper))).toBe("");
      // Null, so out of every sort, filter, colour and ranking.
      expect(col(key).getValue(keeper, getPlayerDerivedMetrics(keeper))).toBeNull();
      expect(cellText(col(key), defender, getPlayerDerivedMetrics(defender))).not.toBe("");
    }
    for (const key of ["saves", "savesPerGame", "penaltiesSaved"]) {
      for (const position of ["DEF", "MID", "FWD"] as const) expect(columnApplies(col(key), position)).toBe(false);
      expect(cellText(col(key), defender, getPlayerDerivedMetrics(defender))).toBe("");
      expect(col(key).getValue(defender, getPlayerDerivedMetrics(defender))).toBeNull();
      expect(cellText(col(key), keeper, getPlayerDerivedMetrics(keeper))).not.toBe("");
    }
  });

  it("still shows — for a figure that's missing for a position that can have it", () => {
    const noData = makePlayer({ id: 3, position: "DEF", defensiveContributions: null });
    expect(cellText(col("defensiveContributions"), noData, getPlayerDerivedMetrics(noData))).toBe("—");
  });

  it("every other column applies to every position", () => {
    for (const key of ["goals", "cleanSheets", "tackles", "recoveries", "defensiveRewardPerGame"]) {
      for (const position of ["GKP", "DEF", "MID", "FWD"] as const) expect(columnApplies(col(key), position)).toBe(true);
    }
  });

  it("Dashboard tiles read the same rule (an outfielder never appears in a saves tile)", () => {
    const tile = PLAYER_TILE_METRICS.find((m) => m.key === "saves")!;
    expect(tile.getValue(defender, getPlayerDerivedMetrics(defender))).toBeNull();
    expect(tile.getValue(keeper, getPlayerDerivedMetrics(keeper))).toBe(80);
  });
});

describe("<averaged_counts>: a Historic Average count shows 1 decimal", () => {
  it("a whole-number count gets 1 decimal in Historic Average only", () => {
    expect(columnForMode(col("goals"), "historicAverage").format(0.4)).toBe("0.4");
    expect(columnForMode(col("goals"), "historicAverage").decimals).toBe(1);
    expect(columnForMode(col("goals"), "lastSeason").format(4)).toBe("4");
    expect(columnForMode(col("goals"), "live")).toBe(col("goals"));
  });

  it("leaves minutes, rates and always-live columns alone", () => {
    expect(columnForMode(col("minutes"), "historicAverage")).toBe(col("minutes"));
    expect(columnForMode(col("xG"), "historicAverage")).toBe(col("xG"));
    expect(columnForMode(col("penaltiesOrder"), "historicAverage")).toBe(col("penaltiesOrder"));
  });

  it("is the same column object each time, so rows don't redraw for nothing", () => {
    expect(columnForMode(col("assists"), "historicAverage")).toBe(columnForMode(col("assists"), "historicAverage"));
  });

  it("tiles and cards built from a column follow it; a tile-only figure keeps its own format", () => {
    expect(columnFormatForMode("goals", col("goals").format, "historicAverage")(0.4)).toBe("0.4");
    const own = (v: number | null) => `x${v}`;
    expect(columnFormatForMode("goals", own, "historicAverage")).toBe(own);
    expect(countDecimals("historicAverage")).toBe(1);
    expect(countDecimals("lastSeason")).toBe(0);
  });

  it("club columns: counts get 1 decimal; league position, played and the shared-out W/D/L stay whole", () => {
    expect(teamColumnForMode(teamColumnByKey("goalsFor")!, "historicAverage").format(61.75)).toBe("61.8");
    expect(teamColumnForMode(teamColumnByKey("goalDifference")!, "historicAverage").format(12.25)).toBe("+12.3");
    for (const key of ["leaguePosition", "played", "wins", "draws", "losses"]) {
      expect(teamColumnForMode(teamColumnByKey(key)!, "historicAverage")).toBe(teamColumnByKey(key));
    }
  });
});
