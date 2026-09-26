import React, { useMemo, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { PositionBadge, TeamBadge } from "./primitives";
import type { NormalizedPlayer } from "../types/normalized";
import { matchesPlayerSearch } from "../utils/playerSearch";

/**
 * Shared "search a player, pick one from suggestions" control — first
 * built for Player Comparison, reused by that page's own Player Trends
 * (also a search-and-add-up-to-N picker) so both share the same
 * matching/rendering logic rather than a second, potentially-diverging
 * implementation.
 */
export function PlayerSearch({
  excludeIds,
  onPick,
  disabled,
  candidates,
  label = "Add a player",
  disabledLabel = "Add a player (max reached)",
}: {
  excludeIds: number[];
  onPick: (id: number) => void;
  disabled: boolean;
  /** Defaults to the full live player pool; pass a narrower list (e.g. only players with career history) to scope suggestions. */
  candidates?: NormalizedPlayer[];
  label?: string;
  disabledLabel?: string;
}) {
  const { players } = useAppState();
  const pool = candidates ?? players;
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (query.trim().length < 2) return [];
    return pool.filter((p) => !excludeIds.includes(p.id) && matchesPlayerSearch(p, query)).slice(0, 8);
  }, [pool, query, excludeIds]);

  return (
    <div style={{ position: "relative" }}>
      <div className="field">
        <label htmlFor="player-search-input">{disabled ? disabledLabel : label}</label>
        <input
          id="player-search-input"
          type="text"
          placeholder={disabled ? "Remove someone to add another" : "Search a player…"}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!disabled && matches.length > 0 && (
        <div className="popover" style={{ left: 0, right: "auto", minWidth: 260 }}>
          {matches.map((m) => (
            <div
              key={m.id}
              className="stat-row"
              style={{ cursor: "pointer" }}
              onClick={() => {
                onPick(m.id);
                setQuery("");
              }}
            >
              <span className="stat-row-name">
                <TeamBadge teamId={m.teamId} shortName={m.teamShortName} linked={false} />
                <PositionBadge position={m.position} />
                {m.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
