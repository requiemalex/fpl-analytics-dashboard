import React, { useEffect, useRef, useState } from "react";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { CreateViewIcon, TrashIcon } from "./IconToolbar";
import { PickerChevron } from "./GroupedPicker";
import { MAX_NAME_LENGTH } from "./MenuControls";

export interface SquadOption {
  id: string;
  /** As shown in the list: a blank name reads "Untitled squad". */
  title: string;
}

/**
 * <squad_picker>: Team Building's squad box, under the section heading, as
 * the Dashboard's view picker is under its: the box, then New Squad and
 * Delete as icons. The box holds the open squad's name, typed over to
 * rename it (saved as it changes); its ▾ lists every saved squad to switch
 * to. The list closes on Escape, a click outside it or a pick; arrows and
 * Enter work it from the keyboard, ↓ in the name opening it.
 */
export function SquadPicker({
  squads,
  activeId,
  name,
  onSelect,
  onRename,
  onNew,
  onDelete,
}: {
  squads: SquadOption[];
  /** Null before any squad exists: only New Squad can be used. */
  activeId: string | null;
  /** The open squad's name as saved, blank included. */
  name: string;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasSquad = activeId !== null;

  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    setHighlight(Math.max(0, squads.findIndex((s) => s.id === activeId)));
    listRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // Only on opening: the list starts on the open squad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(id: string) {
    setOpen(false);
    if (id !== activeId) onSelect(id);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setHighlight((i) => Math.min(squads.length - 1, i + 1));
    else if (e.key === "ArrowUp") setHighlight((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" || e.key === " ") {
      if (squads[highlight]) pick(squads[highlight].id);
    } else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  }

  return (
    <div className="chip-row squad-picker-row">
      {hasSquad && (
        <div className="squad-picker" ref={wrapRef}>
          <input
            type="text"
            className="squad-picker-name"
            aria-label="Squad name: type to rename it"
            title="Type to rename this squad"
            placeholder="Untitled squad"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
              }
            }}
          />
          <button
            type="button"
            className="squad-picker-toggle"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Switch squad"
            title="Switch to another saved squad"
            onClick={() => setOpen((o) => !o)}
          >
            <PickerChevron open={open} />
          </button>
          {open && (
            <div ref={listRef} className="popover squad-picker-menu" role="listbox" aria-label="Saved squads" tabIndex={-1} onKeyDown={onListKeyDown}>
              {squads.map((s, i) => (
                <div
                  key={s.id}
                  role="option"
                  aria-selected={s.id === activeId}
                  className={`grouped-picker-option${i === highlight ? " active" : ""}${s.id === activeId ? " selected" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(s.id)}
                >
                  {s.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button type="button" className="chip chip-icon" title="New Squad: a blank one, or import yours from its FPL team ID" aria-label="New Squad" onClick={onNew}>
        <CreateViewIcon />
      </button>
      <button type="button" className="chip chip-icon" disabled={!hasSquad} title="Delete Squad" aria-label="Delete Squad" onClick={onDelete}>
        <TrashIcon />
      </button>
    </div>
  );
}
