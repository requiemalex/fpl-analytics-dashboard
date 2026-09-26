import React, { useMemo, useState } from "react";
import type { NormalizedTeam } from "../types/normalized";

/**
 * "Search a team, pick one from suggestions" control for tracking specific
 * teams on a Dashboard Team Tile — same search-and-add-up-to-N pattern as
 * PlayerSearch, sized for a ~20-team pool (case-insensitive substring match
 * on name/short name, no fuzzy-typo tolerance needed at that scale) and
 * shown in full rather than gated behind a minimum query length.
 */
export function TeamPicker({
  teams,
  excludeIds,
  onPick,
  disabled,
  label = "Add a team",
  disabledLabel = "Add a team (max reached)",
}: {
  teams: NormalizedTeam[];
  excludeIds: number[];
  onPick: (id: number) => void;
  disabled: boolean;
  label?: string;
  disabledLabel?: string;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams
      .filter((t) => !excludeIds.includes(t.id) && (q.length === 0 || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, query, excludeIds]);

  return (
    <div style={{ position: "relative" }}>
      <div className="field">
        <label htmlFor="team-picker-input">{disabled ? disabledLabel : label}</label>
        <input
          id="team-picker-input"
          type="text"
          placeholder={disabled ? "Remove a team to add another" : "Search a team…"}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!disabled && matches.length > 0 && (
        <div className="popover" style={{ left: 0, right: "auto", minWidth: 220 }}>
          {matches.map((t) => (
            <div
              key={t.id}
              className="stat-row"
              style={{ cursor: "pointer" }}
              onClick={() => {
                onPick(t.id);
                setQuery("");
              }}
            >
              <span className="stat-row-name">
                {t.name} <span className="team">{t.shortName}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
