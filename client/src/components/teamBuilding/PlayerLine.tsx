import React from "react";
import type { NormalizedPlayer } from "../../types/normalized";
import { availabilityTextClass, PositionBadge, pressable, TeamBadge } from "../primitives";

/**
 * A player in the Gameweek Log, Gameweek Summary and Price Changes: his
 * name (opening his profile, as everywhere), then his club pill and
 * position, as the player tables' name cell shows them. `fallbackId` names
 * a player FPL no longer lists.
 */
export function PlayerLine({ player, fallbackId, onViewProfile }: { player: NormalizedPlayer | undefined; fallbackId: number; onViewProfile: (id: number) => void }) {
  if (!player) return <span className="gw-player value-muted">Player {fallbackId}</span>;
  return (
    <span className="gw-player">
      <span className={`gw-player-name ${availabilityTextClass(player.status)}`} {...pressable(() => onViewProfile(player.id), `View ${player.name}'s profile`)}>
        {player.name}
      </span>
      <TeamBadge teamId={player.teamId} shortName={player.teamShortName} />
      <PositionBadge position={player.position} />
    </span>
  );
}
