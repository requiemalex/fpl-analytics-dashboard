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

describe("<whole_numbers>: whole wherever a whole number still tells players apart", () => {
  it("a small count (goals, assists, clean sheets, bonus, cards, pens saved) gets 1 decimal in Historic Average only", () => {
    expect(columnForMode(col("goals"), "historicAverage").format(0.4)).toBe("0.4");
    expect(columnForMode(col("goals"), "historicAverage").decimals).toBe(1);
    expect(columnForMode(col("goals"), "lastSeason").format(4)).toBe("4");
    expect(columnForMode(col("goals"), "live")).toBe(col("goals"));
    for (const key of ["assists", "cleanSheets", "bonus", "yellowCards", "redCards", "penaltiesSaved"]) {
      expect(columnForMode(col(key), "historicAverage").decimals, key).toBe(1);
    }
  });

  it("every other count stays whole when averaged: 141.8 points a season is 142", () => {
    expect(columnForMode(col("totalPoints"), "historicAverage").format(141.8)).toBe("142");
    for (const key of ["totalPoints", "minutes", "starts", "bps", "saves", "goalsConceded", "defensiveContributions", "tackles", "recoveries"]) {
      expect(columnForMode(col(key), "historicAverage"), key).toBe(col(key));
    }
  });

  it("scores that run to hundreds are whole in every Data View; small rates keep their decimals", () => {
    for (const key of ["ictIndex", "influence", "creativity", "threat"]) expect(col(key).format(123.4), key).toBe("123");
    expect(col("pointsPerGame").format(5.34)).toBe("5.3");
    expect(col("xG").format(5.341)).toBe("5.34");
  });

  it("leaves rates and always-live columns alone", () => {
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
    expect(countDecimals("historicAverage", true)).toBe(1);
    expect(countDecimals("historicAverage", false)).toBe(0);
    expect(countDecimals("lastSeason", true)).toBe(0);
  });

  it("club columns: every count stays whole when averaged (a club's run to dozens a season)", () => {
    expect(teamColumnForMode(teamColumnByKey("goalsFor")!, "historicAverage").format(61.75)).toBe("62");
    expect(teamColumnForMode(teamColumnByKey("leaguePoints")!, "historicAverage").format(82.75)).toBe("83");
    expect(teamColumnForMode(teamColumnByKey("goalDifference")!, "historicAverage").format(12.25)).toBe("+12");
    for (const key of ["leaguePosition", "leaguePoints", "played", "wins", "draws", "losses", "points", "goals", "cleanSheets"]) {
      expect(teamColumnForMode(teamColumnByKey(key)!, "historicAverage"), key).toBe(teamColumnByKey(key));
    }
  });

  it("club figures that run to dozens are whole in every Data View", () => {
    expect(teamColumnByKey("cleanSheetRate")!.format(31.58)).toBe("32%");
    expect(teamColumnByKey("pointsPerGame")!.format(48.6)).toBe("49");
    expect(teamColumnByKey("defensiveContributionsPerGame")!.format(55.4)).toBe("55");
  });
});
