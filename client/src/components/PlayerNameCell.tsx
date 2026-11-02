import React from "react";
import type { NormalizedPlayer } from "../types/normalized";
import { fmtPercent, fmtPrice } from "../utils/format";
import { AvailabilityFlag, PositionBadge, TeamBadge, availabilityTextClass, pressable } from "./primitives";
import { SetPieceDutyIcons } from "./SetPieceDuties";

/**
 * A player as the Explorers' Player column shows him: his name (in his
 * availability colour; `onOpen` makes it open his profile), his set-piece
 * duties and availability flag, then ownership · price and his club and
 * position badges. Shared by the Player column and Team Building's Captain
 * figure, so he reads the same way in both. `badge` follows the flag (the
 * Explorers' stopwatch), `action` ends the second line (Add Players' Add).
 */
export function PlayerNameCell({
  player,
  onOpen,
  badge,
  action,
  metaHints,
}: {
  player: NormalizedPlayer;
  onOpen?: (id: number) => void;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  /** His ownership's and price's hovers, as their own columns give them (<stat_hover>). */
  metaHints?: { ownership?: string; price?: string };
}) {
  return (
    <div className="player-name-cell">
      <span className={`name ${availabilityTextClass(player.status)}`} {...(onOpen ? pressable(() => onOpen(player.id), `View ${player.name}'s profile`) : {})}>
        {player.name}
        <SetPieceDutyIcons player={player} />
        <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
        {badge}
      </span>
      <span className="meta">
        <span title={metaHints?.ownership}>{fmtPercent(player.ownership)}</span> · <span title={metaHints?.price}>{fmtPrice(player.price)}</span>
        <TeamBadge teamId={player.teamId} shortName={player.teamShortName} />
        <PositionBadge position={player.position} />
        {action}
      </span>
    </div>
  );
}
