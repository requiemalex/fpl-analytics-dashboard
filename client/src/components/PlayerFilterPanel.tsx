import React from "react";
import type { PlayerFilter } from "../state/useColumnFilters";
import { AVAILABILITY_OPTIONS, POSITIONS } from "./playerFilter";
import { PositionBadge, TeamBadgeLook } from "./primitives";
import { CHOICE, DUTIES, DutyIcon, dutyFilterValue, dutyName, type SetPieceDuty } from "./SetPieceDuties";

/**
 * <player_filter>: the Player header's ▾ — who a player is, in four
 * sections: Position, Club, Availability (each a row of toggles, the app's
 * own badges and dots, dim until picked) and Set-piece duty (a duty per
 * row, its first, second and third choice as the duty's icon in gold,
 * silver and bronze; a duty's name picks its whole row). Several picks in
 * a section: any of them. Several sections: all of them.
 */

const ORDERS = [1, 2, 3] as const;
const AVAILABILITY_DOT: Record<string, string> = { available: "flag-available", doubtful: "flag-doubtful", out: "flag-unavailable" };

export interface ClubOption {
  teamId: number;
  shortName: string;
}

function Toggle({ on, label, onClick, children, className = "" }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" className={`filter-toggle${on ? " on" : ""} ${className}`} aria-pressed={on} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function DutyGrid({ picked, onChange }: { picked: string[]; onChange: (duties: string[]) => void }) {
  const has = (v: string) => picked.includes(v);
  const toggle = (values: string[], on: boolean) => onChange(on ? [...new Set([...picked, ...values])] : picked.filter((v) => !values.includes(v)));
  const row = (d: SetPieceDuty) => ORDERS.map((o) => dutyFilterValue(d, o));
  return (
    <div className="duty-filter" role="group" aria-label="Set-piece duty">
      <span />
      {ORDERS.map((o) => (
        <span key={o} className="duty-filter-head">
          {o === 1 ? "1st" : o === 2 ? "2nd" : "3rd"}
        </span>
      ))}
      {DUTIES.map((d) => {
        const values = row(d);
        const whole = values.every(has);
        const rowLabel = `${dutyName(d)}: ${whole ? "clear" : "pick"} all three`;
        return (
          <React.Fragment key={d}>
            <button type="button" className="duty-filter-row" onClick={() => toggle(values, !whole)} title={rowLabel} aria-label={rowLabel}>
              {dutyName(d)}
            </button>
            {ORDERS.map((o) => {
              const v = dutyFilterValue(d, o);
              const label = `${dutyName(d)}: ${CHOICE[o - 1]} choice`;
              return (
                <button
                  key={o}
                  type="button"
                  className={`duty-filter-cell duty-icon duty-${o}${has(v) ? " on" : ""}`}
                  aria-pressed={has(v)}
                  aria-label={label}
                  title={label}
                  onClick={() => toggle([v], !has(v))}
                >
                  <DutyIcon duty={d} size={14} />
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function PlayerFilterPanel({ filter, clubs, onChange }: { filter: PlayerFilter; clubs: ClubOption[]; onChange: (f: PlayerFilter) => void }) {
  const flip = (section: keyof PlayerFilter, value: string) => {
    const now = filter[section];
    onChange({ ...filter, [section]: now.includes(value) ? now.filter((v) => v !== value) : [...now, value] });
  };
  return (
    <div className="player-filter">
      <div className="player-filter-label">Position</div>
      <div className="player-filter-row" role="group" aria-label="Position">
        {POSITIONS.map((p) => (
          <Toggle key={p} on={filter.positions.includes(p)} label={`Position: ${p}`} onClick={() => flip("positions", p)}>
            <PositionBadge position={p} />
          </Toggle>
        ))}
      </div>
      <div className="player-filter-label">Club</div>
      <div className="player-filter-clubs" role="group" aria-label="Club">
        {clubs.map((c) => (
          <Toggle key={c.shortName} on={filter.clubs.includes(c.shortName)} label={`Club: ${c.shortName}`} onClick={() => flip("clubs", c.shortName)}>
            <TeamBadgeLook teamId={c.teamId} shortName={c.shortName} />
          </Toggle>
        ))}
      </div>
      <div className="player-filter-label">Availability</div>
      <div className="player-filter-row" role="group" aria-label="Availability">
        {AVAILABILITY_OPTIONS.map((a) => (
          <Toggle key={a.value} on={filter.availability.includes(a.value)} label={`Availability: ${a.label}`} onClick={() => flip("availability", a.value)} className="filter-toggle-text">
            <span className={`availability-flag ${AVAILABILITY_DOT[a.value]}`} />
            {a.label}
          </Toggle>
        ))}
      </div>
      <div className="player-filter-label">Set-piece duty</div>
      <DutyGrid picked={filter.duties} onChange={(duties) => onChange({ ...filter, duties })} />
    </div>
  );
}
