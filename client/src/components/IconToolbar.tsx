import React from "react";

/**
 * Icon-only chip buttons for table toolbars (Player Explorer, Team
 * Building's Add Players table) — replaces the old text-label chip row.
 * Each button's `title` is its only label, shown as a native tooltip on
 * hover, matching the convention already used by AppShell's refresh/window
 * controls and TeamBuilder's analysis-mode icon buttons.
 */

export function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5c.35 2.4 1.1 3.6 3.5 4C9.1 5.9 8.35 7.1 8 9.5c-.35-2.4-1.1-3.6-3.5-4 2.4-.4 3.15-1.6 3.5-4Z" />
      <path d="M12.6 9.2c.2 1.35.6 2 1.9 2.2-1.3.2-1.7.85-1.9 2.2-.2-1.35-.6-2-1.9-2.2 1.3-.2 1.7-.85 1.9-2.2Z" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8.3" r="5.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.9V8.3l2.6 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8v7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.8 6.6 8 9.8l3.2-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11.5v1.2c0 .72.58 1.3 1.3 1.3h8.4c.72 0 1.3-.58 1.3-1.3v-1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
