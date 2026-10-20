import React, { useEffect, useRef, useState } from "react";
import { useEscapeLayer } from "../state/useEscapeLayer";

export interface PickerOption {
  value: string;
  label: string;
}

export interface PickerGroup {
  key: string;
  /** The group's name in words, for screen readers. */
  label: string;
  /** Its heading as shown: a MenuGroupHeading (icon, source colour), as in the Explorers' Columns picker. */
  heading: React.ReactNode;
  options: PickerOption[];
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined, flexShrink: 0 }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Pick one of many, grouped under the app's own group headings — the
 * Explorers' Columns-picker headings, icon and source colour included
 * (<same_toggle_everywhere>), which the browser's own <select> can't show.
 * Closed, it's a select-like button naming the choice; open, the list
 * unfolds beneath it in the page's flow (so a scrolling dialog never clips
 * it), the choice scrolled into view. Keyboard as a select: arrows, Home
 * and End move, Enter or Space picks, a letter jumps to the next name
 * starting with it, Escape closes only the list (useEscapeLayer), Tab
 * leaves it. A click outside closes it.
 */
export function GroupedPicker({ id, value, groups, onChange }: { id: string; value: string; groups: PickerGroup[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = groups.flatMap((g) => g.options);
  const selected = options.find((o) => o.value === value);
  const optionId = (v: string) => `${id}-option-${options.findIndex((o) => o.value === v)}`;

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  function pick(v: string) {
    if (v !== value) onChange(v);
    close(true);
  }

  useEscapeLayer(open, () => close(true));

  // Opening starts on the current choice, focuses the list and scrolls the choice into view.
  useEffect(() => {
    if (!open) return;
    setActive(value);
    listRef.current?.focus();
    // Only on opening: value is read then, not followed while open.
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = [...listRef.current.querySelectorAll<HTMLElement>("[data-value]")].find((n) => n.dataset.value === active);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onListKeyDown(e: React.KeyboardEvent) {
    const i = Math.max(0, options.findIndex((o) => o.value === active));
    const moveTo = (n: number) => setActive(options[Math.min(options.length - 1, Math.max(0, n))].value);
    if (e.key === "ArrowDown") moveTo(i + 1);
    else if (e.key === "ArrowUp") moveTo(i - 1);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") pick(active);
    else if (e.key === "Tab") {
      close(false);
      return;
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const letter = e.key.toLowerCase();
      const next = [...options.slice(i + 1), ...options.slice(0, i + 1)].find((o) => o.label.toLowerCase().startsWith(letter));
      if (next) setActive(next.value);
    } else return;
    e.preventDefault();
  }

  return (
    <div className="grouped-picker" ref={wrapRef}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        className="grouped-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="grouped-picker-value">{selected?.label ?? "—"}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div
          id={`${id}-list`}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="grouped-picker-list"
          aria-labelledby={id}
          aria-activedescendant={options.some((o) => o.value === active) ? optionId(active) : undefined}
          onKeyDown={onListKeyDown}
        >
          {groups
            .filter((g) => g.options.length > 0)
            .map((g) => (
              <div key={g.key} role="group" aria-label={g.label}>
                {g.heading}
                {g.options.map((o) => (
                  <div
                    key={o.value}
                    id={optionId(o.value)}
                    role="option"
                    aria-selected={o.value === value}
                    data-value={o.value}
                    className={`grouped-picker-option${o.value === active ? " active" : ""}${o.value === value ? " selected" : ""}`}
                    onMouseEnter={() => setActive(o.value)}
                    onClick={() => pick(o.value)}
                  >
                    {o.label}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
