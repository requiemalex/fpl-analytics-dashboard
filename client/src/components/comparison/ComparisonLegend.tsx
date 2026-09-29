import React from "react";
import { SmallSampleBadge } from "../MinutesFloorBadge";
import type { ComparedPlayer } from "./seriesColors";

export interface LegendEntry extends ComparedPlayer {
  /** Hover text for the small-sample badge when he's under the fixed floor for this card (not drawn on it). */
  smallSampleNote?: string | null;
  /** Nothing of his to draw on this card (no data) — shown muted. */
  absent?: boolean;
}

/** The key under a radar or trend graph: each player's colour as a short line, then his name. */
export function ComparisonLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="cmp-legend">
      {entries.map(({ player, color, smallSampleNote, absent }) => {
        const muted = absent || !!smallSampleNote;
        return (
          <span key={player.id} className={`cmp-legend-item${muted ? " muted" : ""}`} title={absent ? `${player.name} — no data here` : undefined}>
            <span className="cmp-legend-swatch" style={{ background: color }} />
            {player.name}
            {smallSampleNote && <SmallSampleBadge note={smallSampleNote} />}
          </span>
        );
      })}
    </div>
  );
}
