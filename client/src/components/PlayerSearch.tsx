import React, { useId, useMemo, useState } from "react";
import { useAppState } from "../state/AppStateContext";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { PositionBadge } from "./primitives";
import type { NormalizedPlayer } from "../types/normalized";
import { filterBySearch, rankBySearch } from "../utils/playerSearch";

/**
 * Shared "search a player, pick one from suggestions" control — first
 * built for Player Comparison, reused by that page's own Player Trends
 * (also a search-and-add-up-to-N picker) so both share the same
 * matching/rendering logic rather than a second, potentially-diverging
 * implementation.
 *
 * Suggestions are the exact matches if there are any, typo matches only
 * otherwise (<exact_before_typos>), with a player whose FPL name is the
 * query first (rankBySearch). The keyboard works the list like any
 * combobox: ↓/↑ move through it, Enter picks (the first suggestion if
 * none is highlighted), Escape closes just the list (useEscapeLayer, so a
 * dialog it sits in stays open), and so does clicking away.
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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const matches = useMemo(() => {
    if (query.trim().length < 2) return [];
    const available = pool.filter((p) => !excludeIds.includes(p.id));
    return rankBySearch(filterBySearch(available, query, (p) => p), query, (p) => p).slice(0, 8);
  }, [pool, query, excludeIds]);

  const showList = open && !disabled && matches.length > 0;
  useEscapeLayer(showList, () => setOpen(false));

  function pick(player: NormalizedPlayer) {
    onPick(player.id);
    setQuery("");
    setActive(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (matches.length === 0) return;
      e.preventDefault();
      setOpen(true);
      if (!showList) return setActive(0);
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % matches.length : (i - 1 + matches.length) % matches.length));
    } else if (e.key === "Enter" && showList) {
      e.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div className="field">
        <label htmlFor="player-search-input">{disabled ? disabledLabel : label}</label>
        <input
          id="player-search-input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${Math.min(active, matches.length - 1)}` : undefined}
          placeholder={disabled ? "Remove someone to add another" : "Search a player…"}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {showList && (
        <div className="popover" id={listId} role="listbox" style={{ left: 0, right: "auto", minWidth: 260 }}>
          {matches.map((m, i) => (
            <div
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`stat-row${i === active ? " is-active" : ""}`}
              style={{ cursor: "pointer" }}
              // mousedown, not click: picking happens before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="stat-row-name">
                <PositionBadge position={m.position} />
                {m.name}
                <span className="team">{m.teamShortName}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
