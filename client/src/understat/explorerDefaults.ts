import type { ExternalStatsSource } from "../extensions/externalStats";

/**
 * Understat's part of the Explorers' default columns
 * (<source_explorer_defaults>), shown after FPL's while it's mounted: the
 * figures FPL doesn't have that say most to an FPL manager. Players: how
 * often he shoots and creates (Shots, Key Passes) and his threat without
 * penalties (NPxGI, beside FPL's xGI). Clubs: shots for and against, and
 * how far their points ran ahead of their chances (Pts − xPts). Totals, as
 * FPL's defaults are. Kept here, not in the FPL defaults, so switching
 * Understat off or removing it takes them with it.
 */
export const UNDERSTAT_EXPLORER_DEFAULTS: ExternalStatsSource["explorerDefaults"] = {
  player: ["us.shots", "us.keyPasses", "us.npxGI"],
  team: ["us.shots", "us.shotsAgainst", "us.ptsMinusXPts"],
};
