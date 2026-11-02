import React, { useRef, useState } from "react";
import { useDialogFocus } from "../../state/useDialogFocus";
import { useEscapeLayer } from "../../state/useEscapeLayer";
import type { NormalizedPlayer, Position } from "../../types/normalized";
import { fmtPrice } from "../../utils/format";
import { CloseIcon } from "../IconToolbar";
import { SegmentedControl, type SegmentOption } from "../MenuControls";
import { PlayerLine } from "./PlayerLine";

/**
 * <price_changes_week>: every player whose FPL price has changed since the
 * current gameweek's deadline (FPL's `cost_change_event`), risers and
 * fallers apart, biggest change first, then dearest. FPL keeps no dated
 * record of past price changes, so it covers this gameweek only, and not
 * which day each happened.
 */

type Direction = "rise" | "fall";
type PositionFilter = "ALL" | Position;

const POSITION_OPTIONS: SegmentOption<PositionFilter>[] = [
  { value: "ALL", label: "All", title: "Every position" },
  { value: "GKP", label: "GKP", title: "Goalkeepers" },
  { value: "DEF", label: "DEF", title: "Defenders" },
  { value: "MID", label: "MID", title: "Midfielders" },
  { value: "FWD", label: "FWD", title: "Forwards" },
];

/** Players whose price has moved this gameweek, `direction`'s way, biggest change first, then dearest. */
export function priceMovers(players: readonly NormalizedPlayer[], direction: Direction): NormalizedPlayer[] {
  return players
    .filter((p) => p.costChangeEvent !== null && (direction === "rise" ? p.costChangeEvent > 0 : p.costChangeEvent < 0))
    .sort((a, b) => Math.abs(b.costChangeEvent!) - Math.abs(a.costChangeEvent!) || b.price - a.price || a.name.localeCompare(b.name));
}

export function PriceChanges({
  open,
  onClose,
  players,
  gameweek,
  onViewProfile,
}: {
  open: boolean;
  onClose: () => void;
  players: NormalizedPlayer[];
  /** The current gameweek, whose deadline the changes are counted from; null before the season. */
  gameweek: number | null;
  onViewProfile: (id: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, onClose);
  useDialogFocus(open, panelRef);
  const [direction, setDirection] = useState<Direction>("rise");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  if (!open) return null;

  const known = players.some((p) => p.costChangeEvent !== null);
  const risers = priceMovers(players, "rise");
  const fallers = priceMovers(players, "fall");
  const list = (direction === "rise" ? risers : fallers).filter((p) => position === "ALL" || p.position === position);
  const directionOptions: SegmentOption<Direction>[] = [
    { value: "rise", label: `Risers ${risers.length}`, title: "Prices up since the deadline" },
    { value: "fall", label: `Fallers ${fallers.length}`, title: "Prices down since the deadline" },
  ];

  return (
    <div className="gw-backdrop" onClick={onClose}>
      <div className="gw-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="price-changes-title" onClick={(e) => e.stopPropagation()}>
        <div className="gw-panel-head">
          <div className="gw-panel-heading">
            <div className="dialog-title" id="price-changes-title">
              Price Changes
            </div>
            <div className="gw-panel-sub">{gameweek === null ? "The season hasn't started" : `Since the GW${gameweek} deadline`}</div>
          </div>
          <button type="button" className="add-players-close" onClick={onClose} title="Close Price Changes" aria-label="Close Price Changes">
            <CloseIcon />
          </button>
        </div>
        <div className="gw-panel-controls">
          <SegmentedControl label="Direction" hideLabel options={directionOptions} value={direction} onChange={setDirection} />
          <SegmentedControl label="Position" hideLabel options={POSITION_OPTIONS} value={position} onChange={setPosition} />
        </div>
        {!known ? (
          <p className="page-subtitle">FPL hasn't sent this gameweek's price changes.</p>
        ) : list.length === 0 ? (
          <p className="page-subtitle">{direction === "rise" ? "No rises" : "No falls"} yet.</p>
        ) : (
          <section className="gw-section gw-lines-prices">
            <div className="gw-line gw-line-head">
              <span>Player</span>
              <span title="His price now">Price</span>
              <span title="Change since the deadline">Change</span>
            </div>
            {list.map((p) => (
              <div className="gw-line" key={p.id}>
                <span className="gw-line-main">
                  <PlayerLine player={p} fallbackId={p.id} onViewProfile={onViewProfile} />
                </span>
                <span className="num gw-line-value">{fmtPrice(p.price)}</span>
                <span className="num gw-line-value">
                  {p.costChangeEvent! > 0 ? "+" : "−"}
                  {fmtPrice(Math.abs(p.costChangeEvent!))}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
