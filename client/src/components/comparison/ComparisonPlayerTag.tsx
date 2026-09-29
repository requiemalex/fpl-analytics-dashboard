import React from "react";
import { AvailabilityFlag, PositionBadge, TeamBadge, availabilityTextClass } from "../primitives";
import { fmtPercent, fmtPrice } from "../../utils/format";
import type { ComparedPlayer } from "./seriesColors";

/**
 * How a compared player is presented on Player Comparison: name (in his
 * availability colour, opens his profile), then ownership · price and his
 * club and position badges — with his chart colour as the tag's left edge,
 * the same flush-left flag shape the app's badges use, so the tag doubles
 * as the key for every chart below.
 */
export function ComparisonPlayerTag({ entry, onOpen, onRemove }: { entry: ComparedPlayer; onOpen: (id: number) => void; onRemove: (id: number) => void }) {
  const { player: p, color } = entry;
  return (
    <div className="cmp-player-tag" style={{ borderLeftColor: color }}>
      <div className="cmp-player-tag-top">
        <button type="button" className="cmp-player-tag-name" onClick={() => onOpen(p.id)} title={`View ${p.name}'s profile`}>
          <span className={availabilityTextClass(p.status)}>{p.name}</span>
        </button>
        <AvailabilityFlag status={p.status} news={p.news} chanceOfPlayingNextRound={p.chanceOfPlayingNextRound} />
        <button type="button" className="cmp-player-tag-remove" onClick={() => onRemove(p.id)} title={`Remove ${p.name} from the comparison`} aria-label={`Remove ${p.name}`}>
          ×
        </button>
      </div>
      <div className="cmp-player-tag-meta">
        <span className="mono" title="Selected by · price (today's figures)">
          {fmtPercent(p.ownership, 1)} · {fmtPrice(p.price)}
        </span>
        <TeamBadge teamId={p.teamId} shortName={p.teamShortName} />
        <PositionBadge position={p.position} />
      </div>
    </div>
  );
}
