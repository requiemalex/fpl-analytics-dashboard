import React from "react";
import { percentileTint } from "../../utils/colorScale";
import { playerRankHint } from "../hoverText";
import type { Position } from "../../types/normalized";

/**
 * The player profile's Summary card — one per source's Views (FPL's in
 * PlayerDetailOverlay, a second source's through ExternalProfiles), so both
 * read the same way: titled groups of label-above-value tiles on one grid.
 * A group of 6 fills a row, a group of 3 half of one (two side by side);
 * every tile is the same width, so the columns line up down the card. Three
 * to a row on a narrow screen.
 */

/** One tile. `percentile`: this player's within-position percentile for the figure shown (higher already better) — omitted or null, no tint (under the floor, or nothing to compare with). */
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

/** `position` words the percentile on hover: "Top 8% of midfielders" (<hover_text>). */
export function StatTile({ label, value, percentile, position, title }: SummaryFigure & { position: Position }) {
  const hint = [title, playerRankHint(percentile, position)].filter(Boolean).join(". ") || undefined;
  return (
    <div className="stat-tile" style={tileTint(percentileTint(percentile ?? null))} title={hint}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value num">{value}</span>
    </div>
  );
}

/** `badge`: the amber stopwatch when the figures are left uncoloured for being under the minutes floor (<minutes_marker>). */
export function ProfileSummary({ groups, position, badge }: { groups: SummaryGroup[]; position: Position; badge?: React.ReactNode }) {
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
                <StatTile key={f.label} position={position} {...f} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
