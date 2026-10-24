import React from "react";
import { percentileTint } from "../../utils/colorScale";

/**
 * The profiles' Summary card — one per source's Views on the player profile
 * (FPL's in PlayerDetailOverlay, a second source's through
 * ExternalProfiles) and the Team Profile's, so all read the same way:
 * titled groups of label-above-value tiles on one grid. A group of 6 fills a row, a group of 3 half of one (two side by side);
 * every tile is the same width, so the columns line up down the card. Three
 * to a row on a narrow screen.
 */

/** One tile. `percentile`: the figure's comparative rank (higher already better) — a player's within his position, a club's among every club; omitted or null, no tint (under the floor, or nothing to compare with). */
export interface SummaryFigure {
  label: string;
  value: React.ReactNode;
  percentile?: number | null;
  /** What the figure is, on hover, when its label doesn't say. */
  title?: string;
}

/** A titled group of 3 or 6 tiles. */
export interface SummaryGroup {
  title: string;
  figures: SummaryFigure[];
}

/** A tile's comparative colour, laid over its surface (`.stat-tile`), so a faint one never reads as a hole in the grid. */
export function tileTint(tint: string | undefined): React.CSSProperties | undefined {
  return tint ? ({ "--tile-tint": tint } as React.CSSProperties) : undefined;
}

/** Words a tile's rank on hover (<hover_text>): "Top 8% of midfielders", "4th of 20 clubs". */
export type RankHint = (percentile: number | null | undefined) => string | undefined;

export function StatTile({ label, value, percentile, rankHint, title }: SummaryFigure & { rankHint?: RankHint }) {
  const hint = [title, rankHint?.(percentile)].filter(Boolean).join(". ") || undefined;
  return (
    <div className="stat-tile" style={tileTint(percentileTint(percentile ?? null))} title={hint}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

/**
 * `rankHint`: words every tile's rank the same way (a player's); without it, a tile's `title` carries its own (a club's,
 * whose pool can differ by figure). `badge`: the amber stopwatch when the figures are left uncoloured for being under the
 * minutes floor (<minutes_marker>).
 */
export function ProfileSummary({ groups, rankHint, badge }: { groups: SummaryGroup[]; rankHint?: RankHint; badge?: React.ReactNode }) {
  return (
    <div className="card profile-span-2">
      <div className="card-title">
        Summary
        {badge}
      </div>
      <div className="summary-grid">
        {groups.map((g) => (
          <div className={g.figures.length > 3 ? "summary-group is-full" : "summary-group"} key={g.title}>
            <div className="stat-group-title">{g.title}</div>
            <div className="summary-tiles">
              {g.figures.map((f) => (
                <StatTile key={f.label} rankHint={rankHint} {...f} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
