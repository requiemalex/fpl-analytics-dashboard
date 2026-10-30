import React from "react";

/**
 * Icon-only chip buttons for table toolbars (Player Explorer, Team
 * Building's Add Players table) — replaces the old text-label chip row.
 * Each button's `title` is its only label, shown as a native tooltip on
 * hover, matching the convention already used by AppShell's notepad/window
 * controls and TeamBuilder's analysis-mode icon buttons.
 */

/** An X: closes a panel or overlay (profiles, the notepad). */
export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.2 8a4.8 4.8 0 1 1 1.5 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 4.6V8h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ColumnsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

/** Predictive columns: a solid line of past form running on into a dashed projection. */
export function ForecastIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.8 11.5 4.6 8.6l2.2 1.6 2.4-3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.2 6.8 14.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="1.2 1.9" />
      <path d="M1.8 14h12.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8.3" r="5.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.9V8.3l2.6 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilterIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3h12l-4.5 5.2v4.1l-3 1.4V8.2L2 3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8v7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.8 6.6 8 9.8l3.2-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11.5v1.2c0 .72.58 1.3 1.3 1.3h8.4c.72 0 1.3-.58 1.3-1.3v-1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 4.5 5 13a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="6.5" y1="7" x2="6.7" y2="11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="9.5" y1="7" x2="9.3" y2="11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** A pencil — edit an existing Dashboard tile/graph. */
export function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10.6 2.6a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L6 12.8l-3.3.8.8-3.3 7.1-7.7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <line x1="9.4" y1="3.9" x2="12.1" y2="6.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Scatter dots with a dashed diagonal through them — the Add Graph dialog's trend (reference) line toggle. */
export function TrendLineIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2" />
      <circle cx="4.5" cy="9" r="1.2" fill="currentColor" />
      <circle cx="8" cy="10.5" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="4.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** A page with ruled lines and a folded corner — the notepad. */
export function NotepadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2.2h7.2L13 5v8.8H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M10 2.2V5.2h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="5.2" y1="8" x2="10.8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.2" y1="10.7" x2="9.4" y2="10.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** A painter's palette — the top bar's comparative-colouring switch; struck through while it's off. */
export function ComparativeColourIcon({ off = false, size = 15 }: { off?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.8a6.2 6.2 0 1 0 0 12.4c.9 0 1.4-.6 1.4-1.3 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.6-1.3 1.4-1.3h1.6a2.9 2.9 0 0 0 2.9-2.9c0-2.5-2.9-4.9-6.5-4.9z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="4.7" cy="8" r="1" fill="currentColor" />
      <circle cx="5.7" cy="4.9" r="1" fill="currentColor" />
      <circle cx="8.9" cy="4.1" r="1" fill="currentColor" />
      <circle cx="11.4" cy="6" r="1" fill="currentColor" />
      {off && <path d="M2.2 1.8l11.6 11.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}

/** A chevron pointing left (back) or right (on): the gameweek arrows. */
export function ChevronIcon({ direction, size = 14 }: { direction: "left" | "right"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={direction === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A plus — the Add card at the end of a Dashboard or Player Comparison grid. */
export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A view (window) with a "+" badge — Create View, distinct from the bare "+" used for adding a single tile. */
export function CreateViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.3" y="2.3" width="10.4" height="8.4" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.3" y1="4.7" x2="11.7" y2="4.7" stroke="currentColor" strokeWidth="1" />
      <circle cx="11.6" cy="11.6" r="3.2" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.2" />
      <line x1="11.6" y1="10.1" x2="11.6" y2="13.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="10.1" y1="11.6" x2="13.1" y2="11.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** A magnifying glass: Help, the top bar's search of how the app works (help/HelpPanel.tsx). */
export function HelpIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A view stacked over another: saved views. The same drawing as SectionHeading's "views" (the Dashboard's and Player Comparison's Saved Views heading); here the Explorers' save/load menu. */
export function SavedViewsIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 2.5h8a1.2 1.2 0 0 1 1.2 1.2v6.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2.3" y="5" width="9.4" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="2.3" y1="7.6" x2="11.7" y2="7.6" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

/** A floppy disk — save what's on screen over a saved Explorer view. */
export function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 3.5a1 1 0 0 1 1-1h7.3l2.7 2.7v7.3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 2.5v3h5v-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="5" y="9" width="6" height="4.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Edit + Remove icon buttons for a Dashboard or Player Comparison card header. Either is omitted when its handler isn't set (e.g. the immutable Starter view). Their hover names the card (`name`): "Edit "Top xGI"". */
export function CardEditRemoveButtons({
  noun,
  name,
  onEdit,
  onRemove,
}: {
  noun: "tile" | "graph" | "chart" | "panel";
  /** The card's title, for the hover text. */
  name?: string;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const which = name?.trim() ? `"${name.trim()}"` : `this ${noun}`;
  return (
    <>
      {onEdit && (
        <button
          type="button"
          className="chip chip-icon"
          title={`Edit ${which}`}
          aria-label={`Edit ${noun}`}
          onClick={onEdit}
        >
          <EditIcon />
        </button>
      )}
      {onRemove && (
        <button type="button" className="chip chip-icon" title={`Remove ${which}`} aria-label={`Remove ${noun}`} onClick={onRemove}>
          <TrashIcon />
        </button>
      )}
    </>
  );
}

/** Icon-only chip button — pairs with `.icon-toolbar` as the wrapping container. `badge` renders a small count bubble (visible-column count, active-filter count, etc.) in the corner. */
export function IconChipButton({
  icon,
  label,
  badge,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="chip chip-icon" title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      {icon}
      {badge !== undefined && <span className="chip-icon-badge">{badge}</span>}
    </button>
  );
}
