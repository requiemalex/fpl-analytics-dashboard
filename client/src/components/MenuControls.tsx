import React, { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * The building blocks every dialog and column menu is made from, so they
 * all read as one set: a segmented picker for a short list of choices, a
 * group heading (icon, name, hairline — a smaller SectionHeading) over a
 * list of options, a selection meter for a capped multi-pick, and a Min
 * Minutes slider. Selected states use the same green as `.chip.active`.
 */

export interface SegmentOption<T extends string> {
  value: T;
  /** Shown on the segment. Omit with `icon` for an icon-only segment. */
  label?: string;
  icon?: React.ReactNode;
  /** Hover text and accessible name; defaults to `label`. */
  title?: string;
}

/** One-of-a-few choice (Data View, Order, Graph Type…) as a row of segments. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  compact = false,
}: {
  label?: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Smaller segments, to sit inside a tile's label row (the Projected tile). */
  compact?: boolean;
}) {
  const labelId = useId();
  const iconOnly = options.every((o) => !o.label);
  return (
    <div className="field">
      {label && (
        <span className="field-label" id={labelId}>
          {label}
        </span>
      )}
      <div className={`segmented${iconOnly ? " icon-only" : ""}${compact ? " compact" : ""}`} role="radiogroup" aria-labelledby={label ? labelId : undefined}>
        {options.map((o) => {
          const on = o.value === value;
          const name = o.title ?? o.label;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={name}
              title={name}
              className={`segmented-option${on ? " active" : ""}`}
              onClick={() => onChange(o.value)}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Heading over one group of options in a picker or column menu. */
export function MenuGroupHeading({ group, label, icon, className }: { group: string; label?: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `menu-group-heading ${className}` : "menu-group-heading"}>
      <span className="menu-group-icon" aria-hidden="true">
        {icon ?? groupIcon(group)}
      </span>
      {label ?? titleCase(group)}
    </div>
  );
}

/** An Explorer's FPL-only Columns-picker heading, "FPL · Actual Output" — named by source like Understat's "Understat · Shooting". */
export function fplHeading(group: string): string {
  return `FPL · ${titleCase(group)}`;
}

/** "ACTUAL OUTPUT" → "Actual Output" — the column catalogue's group keys are upper case. */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function svg(children: React.ReactNode) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      {children}
    </svg>
  );
}

/** Every column/metric group across the catalogues, keyed by lower-case name (both the Player Explorer and Player Comparison spellings). */
function groupIcon(group: string): React.ReactNode {
  switch (group.toLowerCase()) {
    case "actual output":
    case "output":
      // Target.
      return svg(
        <>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="8" r="0.9" fill="currentColor" />
        </>,
      );
    case "underlying performance":
    case "underlying":
      // Axes with a plotted line.
      return svg(
        <>
          <path d="M2 2.5V13.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 10.5 7 7.5l2.2 1.8L13 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </>,
      );
    case "value":
    case "price":
      return <span className="menu-group-glyph">£</span>;
    case "advanced":
      // Mixer sliders.
      return svg(
        <>
          <path d="M4 2v12M8 2v12M12 2v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M2.5 10h3M6.5 5h3M10.5 9h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>,
      );
    case "playing time":
      // Clock.
      return svg(
        <>
          <circle cx="8" cy="8.3" r="5.8" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 4.9V8.3l2.6 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </>,
      );
    case "results":
      // League table.
      return svg(
        <>
          <rect x="2" y="2.5" width="12" height="11" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
          <path d="M2 6.2h12M2 9.8h12M5.5 2.5v11" stroke="currentColor" strokeWidth="1.1" />
        </>,
      );
    default:
      // Anything else ("Other"): a small grid.
      return svg(
        <>
          <circle cx="4.5" cy="4.5" r="1.3" fill="currentColor" />
          <circle cx="11.5" cy="4.5" r="1.3" fill="currentColor" />
          <circle cx="4.5" cy="11.5" r="1.3" fill="currentColor" />
          <circle cx="11.5" cy="11.5" r="1.3" fill="currentColor" />
        </>,
      );
  }
}

/** Title, "n of max selected", and one segment per slot, filled for each pick. */
export function SelectionMeter({ title, count, max }: { title: string; count: number; max: number }) {
  return (
    <div className="selection-meter">
      <div className="selection-meter-head">
        <span className="selection-meter-title">{title}</span>
        <span className="selection-meter-count">
          <strong className="num">{count}</strong> of {max} selected
        </span>
      </div>
      <div className="selection-meter-track" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < count ? "filled" : undefined} />
        ))}
      </div>
    </div>
  );
}

/** A full season: 38 matches of 90. */
export const MINUTES_SLIDER_MAX = 3420;
/** One match: the step every minutes control moves in. */
export const MINUTES_STEP = 90;

/** Longest custom name a tile, graph, card or view takes — past this it's no longer a title. */
export const MAX_NAME_LENGTH = 60;

/**
 * Min Minutes as a slider (whole matches) with the exact figure beside it,
 * which can still be typed — any whole number, not only a multiple of 90,
 * and past a season's worth if wanted. Shows "Any" at 0.
 */
export function MinutesSlider({
  id,
  label = "Min minutes",
  value,
  onChange,
  disabled,
  note,
  title,
}: {
  /** Put on the typed box, so a `<label>` or test can reach it. */
  id: string;
  label?: React.ReactNode;
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  /** Muted text after the label, e.g. "(bypassed)". */
  note?: string;
  title?: string;
}) {
  // What's typed, kept while editing so a blank or part-typed number isn't
  // snapped back; every keystroke still applies straight away.
  const [draft, setDraft] = useState<string | null>(null);

  function type(raw: string) {
    setDraft(raw);
    const n = Math.floor(Number(raw));
    onChange(raw.trim() === "" || !Number.isFinite(n) ? 0 : Math.max(0, n));
  }

  const fill = `${(Math.min(value, MINUTES_SLIDER_MAX) / MINUTES_SLIDER_MAX) * 100}%`;
  return (
    <div className={`field minutes-slider${disabled ? " is-disabled" : ""}`} title={title}>
      <div className="minutes-slider-head">
        <label htmlFor={id}>
          {label} {note && <span className="minutes-slider-note">{note}</span>}
        </label>
        <input
          id={id}
          className="minutes-slider-value num"
          type="number"
          min={0}
          step={MINUTES_STEP}
          placeholder="Any"
          disabled={disabled}
          value={draft ?? (value === 0 ? "" : String(value))}
          onChange={(e) => type(e.target.value)}
          onBlur={() => setDraft(null)}
        />
      </div>
      <input
        type="range"
        aria-label={typeof label === "string" ? label : "Min minutes"}
        min={0}
        max={MINUTES_SLIDER_MAX}
        step={MINUTES_STEP}
        disabled={disabled}
        value={Math.min(value, MINUTES_SLIDER_MAX)}
        style={{ "--fill": fill } as React.CSSProperties}
        onChange={(e) => {
          setDraft(null);
          onChange(Number(e.target.value));
        }}
      />
      <div className="minutes-slider-scale num" aria-hidden="true">
        <span>0</span>
        <span>{MINUTES_SLIDER_MAX.toLocaleString("en-GB")}</span>
      </div>
    </div>
  );
}

/** Lower case without accents, so "creat" finds "Creativity": the Columns and Statistic pickers' filters. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * <text_filter>: after every render, hides the items in `list` (matched by
 * `itemSelector`, e.g. "label" or "button.chip") whose text doesn't contain
 * `filter` (accents and case aside), and while filtering hides each of the
 * list's groups (its direct children) with nothing left, heading and all.
 * Returns nothing; `empty`, if given, is shown only when nothing matches.
 * Shared by the Columns pickers and Player Comparison's statistic chips.
 */
export function useTextFilter(list: React.RefObject<HTMLElement>, filter: string, itemSelector: string, empty?: React.RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const needle = foldText(filter.trim());
    let shown = 0;
    for (const group of root.children) {
      const items = [...group.querySelectorAll<HTMLElement>(itemSelector)];
      let groupShown = 0;
      for (const item of items) {
        const hide = needle !== "" && !foldText(item.textContent ?? "").includes(needle);
        item.style.display = hide ? "none" : "";
        if (!hide) groupShown += 1;
      }
      // While filtering, a heading with nothing under it that matches goes too.
      (group as HTMLElement).style.display = needle !== "" && groupShown === 0 ? "none" : "";
      shown += groupShown;
    }
    if (empty?.current) empty.current.style.display = shown === 0 ? "" : "none";
  });
}

/**
 * The Explorers' and Add Players' Columns picker: its checkboxes under
 * their group headings, with a filter box on top that has the focus and
 * leaves only the columns whose name contains what's typed, and the
 * headings that still have one (<text_filter>; audit 2026-10-23 in-app:
 * the list runs to about ninety). Pages pass their own groups (a div per
 * group, a label per column) as children, so each keeps its own headings
 * and order.
 */
export function ColumnsPopover({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  useTextFilter(listRef, filter, "label", emptyRef);

  return (
    <div className="popover columns-popover" style={style}>
      <input
        type="text"
        className="columns-popover-filter"
        placeholder="Type to filter…"
        aria-label="Filter the columns"
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div ref={emptyRef} className="columns-popover-empty" style={{ display: "none" }}>
        No column matches "{filter.trim()}".
      </div>
      <div ref={listRef}>{children}</div>
    </div>
  );
}
