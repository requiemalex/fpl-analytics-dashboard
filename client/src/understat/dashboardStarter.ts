import { externalMetricKey, type ExternalStatsSource } from "../extensions/externalStats";
import { DEFAULT_FILTERS } from "../state/scoutingFilters";
import type { SummaryTileConfig } from "../state/useSummaryTiles";
import type { DashboardGraphConfig } from "../state/useDashboardGraphs";
import { UNDERSTAT_SOURCE_ID } from "./columns";

/**
 * Understat's part of the Dashboard's Starter view (<source_starter_items>),
 * after the packaged FPL tiles and graphs: the figures FPL doesn't have
 * that best answer an FPL manager's questions. Who carries the most threat
 * without penalties (NPxGI/Game), who shoots and who creates (Shots/Game,
 * Key Passes/Game), who's on penalties, whose finishing has fallen short
 * of his chances (likely to bounce back); and for clubs, the strongest by
 * chance difference (xGD), the luckiest against their chances
 * (Pts − xPts), who shoots most and the meanest defences (Shots, Shots
 * Against) and the set-piece threats. Players and clubs get the same
 * number of tiles and graphs, here and in the FPL defaults, so each
 * scope's Starter has the same shape with Understat on or off (owner's
 * call, 2026-10-29). Kept here, not in the FPL defaults, so switching
 * Understat off or removing it takes them with it.
 */

const us = (key: string) => externalMetricKey(UNDERSTAT_SOURCE_ID, key);

function tile(id: string, scope: SummaryTileConfig["scope"], key: string, direction: SummaryTileConfig["direction"] = "desc"): SummaryTileConfig {
  return {
    id: `understat-starter-${id}`,
    scope,
    metricKey: us(key),
    direction,
    dataView: "lastSeason",
    name: null,
    criteria: scope === "player" ? DEFAULT_FILTERS : null,
    playerIds: null,
    teamIds: null,
  };
}

function scatter(id: string, scope: DashboardGraphConfig["scope"], name: string, xMetricKey: string, yMetricKey: string): DashboardGraphConfig {
  return {
    id: `understat-starter-graph-${id}`,
    scope,
    name,
    chartType: "scatter",
    direction: "desc",
    xMetricKey,
    yMetricKey,
    dataView: "lastSeason",
    showReferenceLine: false,
    criteria: scope === "player" ? DEFAULT_FILTERS : null,
    playerIds: null,
    teamIds: null,
  };
}

export const UNDERSTAT_DASHBOARD_STARTER: ExternalStatsSource["dashboardStarter"] = {
  tiles: [
    tile("npxgi-per-game", "player", "us.npxGIPerGame"),
    tile("shots-per-game", "player", "us.shotsPerGame"),
    tile("key-passes-per-game", "player", "us.keyPassesPerGame"),
    tile("penalties-taken", "player", "us.penaltiesTaken"),
    tile("np-goals-below-npxg", "player", "us.npGoalsMinusNpxG", "asc"),
    tile("team-xgd", "team", "us.xGD"),
    tile("team-pts-above-xpts", "team", "us.ptsMinusXPts"),
    tile("team-shots", "team", "us.shots"),
    tile("team-shots-against", "team", "us.shotsAgainst", "asc"),
    tile("team-set-piece-xg", "team", "us.setPieceXG"),
  ],
  graphs: [
    // Volume against quality: many low-value shots, or few good chances.
    scatter("shot-volume-quality", "player", "Shots/Game vs xG/Shot", us("us.shotsPerGame"), us("us.xGPerShot")),
    // FPL's price against Understat's threat: an FPL & Understat graph.
    scatter("price-npxgi", "player", "Price vs NPxGI/Game", "price", us("us.npxGIPerGame")),
    scatter("team-npxg-npxga", "team", "NPxG vs NPxGA", us("us.npxG"), us("us.npxGA")),
    // The players' volume-against-quality question, for clubs.
    scatter("team-shot-volume-quality", "team", "Shots vs xG/Shot", us("us.shots"), us("us.xGPerShot")),
  ],
};
