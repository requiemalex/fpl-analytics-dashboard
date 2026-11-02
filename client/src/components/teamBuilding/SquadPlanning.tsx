import React, { useEffect, useRef, useState } from "react";
import { CHIP_NAME } from "../../metrics/gameweekSummary";
import type { ChipStatus, TransferStanding } from "../../metrics/squadTransfers";
import { useEscapeLayer } from "../../state/useEscapeLayer";
import type { NormalizedPlayer } from "../../types/normalized";
import { SQUAD_RULES, type ChipName } from "../../types/team";
import { DASH } from "../../utils/format";
import { ChipIcon, ConfirmIcon, IconChipButton, InfinityIcon } from "../IconToolbar";
import { MenuGroupHeading, SegmentedControl, type SegmentOption } from "../MenuControls";
import { PlayerLine } from "./PlayerLine";

/**
 * <squad_transfers>, <squad_chips>: the summary card's Transfers and Chips
 * figures, after Bank, each opening a small menu. Both are for the
 * gameweek open for picks. An import's free transfers and spent chips come
 * from FPL; a squad built here's are Scoutline's own record, set by hand
 * once (its free transfers, the chips it has left) and kept from then on.
 * Either can plan this gameweek's transfers (confirmed with the tick, as
 * FPL's own confirm) and play a chip.
 */

/** Closes a menu on Escape or a press outside `ref`. */
function useMenu(): { open: boolean; setOpen: (open: boolean) => void; ref: React.RefObject<HTMLDivElement> } {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return { open, setOpen, ref };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The free transfers a squad built here can be set to: unlimited, or 0 to FPL's cap. */
const FREE_OPTIONS: SegmentOption<string>[] = [
  { value: "unlimited", icon: <InfinityIcon size={14} />, title: "Unlimited: every transfer free, as in a squad's first gameweek" },
  ...Array.from({ length: SQUAD_RULES.maxFreeTransfers + 1 }, (_, n) => ({ value: String(n), label: String(n), title: plural(n, "free transfer") })),
];

/** Why every transfer is free this gameweek, in words. */
function freeReason(standing: TransferStanding): string {
  if (standing.freeBecause === "wildcard") return "Wildcard: every transfer free this gameweek, and the free ones banked stay as they were";
  if (standing.freeBecause === "freehit") return "Free Hit: every transfer free this gameweek, and the squad goes back after it";
  return "Unlimited: a squad's first gameweek, every transfer free";
}

/** The figure's hover: where the gameweek's transfers stand. */
function transfersHint(standing: TransferStanding | null, isImport: boolean): string {
  if (!standing) return isImport ? "This team's transfers are read from FPL after each deadline: not read yet" : "No gameweek left to make transfers for";
  const parts = [standing.free === null ? freeReason(standing) : `${plural(standing.free, "free transfer")} for GW${standing.event}`];
  if (standing.made > 0) parts.push(`${standing.made} confirmed`);
  if (standing.inIds.length > 0) parts.push(`${standing.inIds.length} not confirmed yet`);
  if (standing.left !== null) parts.push(`${standing.left} left`);
  if (standing.cost > 0) parts.push(`${plural(standing.extra, "transfer")} past the free ones: −${standing.cost} points`);
  return parts.join(". ") + (isImport ? ". The free transfers are worked out from FPL's history of the team: FPL's public data doesn't send them." : ".");
}

export function TransfersFigure({
  standing,
  isImport,
  playersById,
  onConfirm,
  onSetFree,
  onViewProfile,
}: {
  /** Null when not known for the gameweek open for picks. */
  standing: TransferStanding | null;
  isImport: boolean;
  playersById: ReadonlyMap<number, NormalizedPlayer>;
  onConfirm: () => void;
  /** A squad built here: sets its free transfers (null: unlimited). */
  onSetFree: (free: number | null) => void;
  onViewProfile: (id: number) => void;
}) {
  const menu = useMenu();
  const pending = standing ? standing.inIds.length + standing.outIds.length : 0;
  const canConfirm = !!standing && standing.free !== null && pending > 0;
  const hint = transfersHint(standing, isImport);
  return (
    <div className="squad-summary-figure is-split is-planning" ref={menu.ref}>
      <button
        type="button"
        className="squad-summary-figure squad-summary-button"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        title={hint}
        onClick={() => menu.setOpen(!menu.open)}
      >
        <span className="squad-summary-label">Transfers</span>
        <span className="squad-summary-value num">
          {standing === null ? DASH : standing.left === null ? <InfinityIcon size={30} /> : standing.left}
          {standing && standing.cost > 0 && <span className="squad-summary-hit">−{standing.cost}</span>}
        </span>
      </button>
      {canConfirm && (
        <IconChipButton
          icon={<ConfirmIcon />}
          label="Confirm transfers"
          title={`Confirm ${plural(standing.inIds.length, "transfer")}: they count from now on, as FPL's confirm does (undoing one later is another transfer)`}
          onClick={onConfirm}
        />
      )}
      {menu.open && (
        <div className="popover planning-popover" role="dialog" aria-label="Transfers">
          <MenuGroupHeading group="transfers" label={standing ? `GW${standing.event} transfers` : "Transfers"} icon={<ConfirmIcon size={14} />} />
          {!isImport && standing && (
            <div className="planning-row" title="How many free transfers this squad has: tracking starts from the squad as it stands, nothing counted yet">
              <span className="planning-row-label">Free transfers</span>
              <SegmentedControl
                label="Free transfers"
                hideLabel
                options={FREE_OPTIONS}
                value={standing.banked === null ? "unlimited" : String(standing.banked)}
                onChange={(v) => onSetFree(v === "unlimited" ? null : Number(v))}
              />
            </div>
          )}
          {standing ? (
            <>
              <div className="planning-figures">
                <PlanningFigure label="Free" value={standing.free === null ? <InfinityIcon size={14} /> : String(standing.free)} title={standing.free === null ? freeReason(standing) : "Free transfers at the gameweek's start"} />
                <PlanningFigure label="Confirmed" value={String(standing.made)} title="Transfers confirmed this gameweek" />
                <PlanningFigure label="Pending" value={String(standing.inIds.length)} title="Players brought in since the last confirm" />
                <PlanningFigure label="Hits" value={standing.cost > 0 ? `−${standing.cost}` : "0"} negative={standing.cost > 0} title={`${SQUAD_RULES.hitCost} points for each transfer past the free ones, taken off the gameweek's score`} />
              </div>
              {pending > 0 && (
                <div className="planning-moves">
                  {standing.outIds.map((id) => (
                    <div className="planning-move" key={`out-${id}`}>
                      <span className="planning-move-dir is-out">Out</span>
                      <PlayerLine player={playersById.get(id)} fallbackId={id} onViewProfile={onViewProfile} />
                    </div>
                  ))}
                  {standing.inIds.map((id) => (
                    <div className="planning-move" key={`in-${id}`}>
                      <span className="planning-move-dir is-in">In</span>
                      <PlayerLine player={playersById.get(id)} fallbackId={id} onViewProfile={onViewProfile} />
                    </div>
                  ))}
                </div>
              )}
              {canConfirm && (
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      onConfirm();
                      menu.setOpen(false);
                    }}
                  >
                    Confirm {plural(standing.inIds.length, "transfer")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="planning-empty">{hint}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PlanningFigure({ label, value, title, negative }: { label: string; value: React.ReactNode; title: string; negative?: boolean }) {
  return (
    <div className="stat-tile" title={title}>
      <span className="stat-tile-label">{label}</span>
      <span className={`stat-tile-value num${negative ? " value-negative" : ""}`}>{value}</span>
    </div>
  );
}

/** One chip's state, in words. */
function chipState(c: ChipStatus, event: number | null): string {
  if (c.playing) return `Played for GW${event}`;
  if (c.used) return c.used.event !== null ? `Played in GW${c.used.event}` : "Used this half of the season";
  if (!c.window) return c.blocked ?? "Can't be played now";
  return c.blocked ?? `Available until GW${c.window.stopEvent}`;
}

export function ChipsFigure({
  statuses,
  event,
  isImport,
  onPlay,
  onMarkUsed,
}: {
  statuses: ChipStatus[];
  /** The gameweek open for picks; null with none left. */
  event: number | null;
  isImport: boolean;
  /** Plays a chip for `event`, or cancels the one played (null). */
  onPlay: (chip: ChipName | null) => void;
  /** A squad built here: marks a chip used (or not) this half of the season by hand. */
  onMarkUsed: (chip: ChipName, used: boolean) => void;
}) {
  const menu = useMenu();
  const playing = statuses.find((c) => c.playing) ?? null;
  const left = statuses.filter((c) => c.window && !c.used).length;
  const hint = `${plural(left, "chip")} left this half of the season${playing ? `; ${CHIP_NAME[playing.chip]} played for GW${event}` : ""}. ${
    isImport ? "From FPL's history of the team." : "Mark the ones already used here; a chip played is spent at the deadline."
  }`;
  return (
    <div className="squad-summary-figure is-planning" ref={menu.ref}>
      <button type="button" className="squad-summary-figure squad-summary-button" aria-haspopup="dialog" aria-expanded={menu.open} title={hint} onClick={() => menu.setOpen(!menu.open)}>
        <span className="squad-summary-label">Chips</span>
        <span className="squad-chip-icons">
          {statuses.map((c) => (
            <span key={c.chip} className={`squad-chip-icon${c.playing ? " is-playing" : c.used || !c.window ? " is-spent" : ""}`} aria-label={`${CHIP_NAME[c.chip]}: ${chipState(c, event)}`} role="img">
              <ChipIcon chip={c.chip} size={18} />
            </span>
          ))}
        </span>
      </button>
      {menu.open && (
        <div className="popover planning-popover" role="dialog" aria-label="Chips">
          <MenuGroupHeading group="chips" label={event === null ? "Chips" : `GW${event} chips`} icon={<ChipIcon chip="wildcard" size={14} />} />
          {statuses.map((c) => {
            const canPlay = c.blocked === null;
            const manual = !isImport && (!c.used || c.used.event === null) && !c.playing && c.window !== null;
            return (
              <div className="planning-chip" key={c.chip}>
                <button
                  type="button"
                  className={`chip planning-chip-play${c.playing ? " active" : ""}`}
                  aria-pressed={c.playing}
                  disabled={!canPlay}
                  title={c.playing ? `Cancel ${CHIP_NAME[c.chip]} for GW${event}` : canPlay ? `Play ${CHIP_NAME[c.chip]} in GW${event}` : (c.blocked ?? "")}
                  onClick={() => onPlay(c.playing ? null : c.chip)}
                >
                  <ChipIcon chip={c.chip} size={15} />
                  {CHIP_NAME[c.chip]}
                </button>
                <span className="planning-chip-state">{chipState(c, event)}</span>
                {manual && (
                  <label className="planning-chip-used" title="Already used this half of the season, before Scoutline kept this squad's chips">
                    <input type="checkbox" checked={!!c.used} onChange={(e) => onMarkUsed(c.chip, e.target.checked)} />
                    Used
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
