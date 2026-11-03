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

/** Header view toggle: a two-person mark for "Players". */
export function PlayersViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5.5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.6 14c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11.6" cy="6.2" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.3 9.3c1.9-.2 3.7.9 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Header view toggle — a club-badge/shield silhouette, pairing with PlayersViewIcon above for "Teams". */
export function TeamsViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5 13.5 3.5V7.5C13.5 11 11.2 13.4 8 14.5C4.8 13.4 2.5 11 2.5 7.5V3.5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Double chevrons pointing left (widen the panel to fill the page) or right (shrink it back to the side). */
export function ChevronsIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={direction === "right" ? { transform: "scaleX(-1)" } : undefined}>
      <polyline points="8,3.5 3.5,8 8,12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="12.5,3.5 8,8 12.5,12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

/** One player: head and shoulders — the top bar's count of players loaded. */
export function PersonIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 14c0-2.9 2.3-4.9 5.2-4.9s5.2 2 5.2 4.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

/** An armband with its letter: Team Building's Captain (C) and Vice-Captain (V), drawn as the pitch's armbands read; with a 3, the Triple Captain chip. */
export function ArmbandIcon({ letter, size = 16 }: { letter: "C" | "V" | "3"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.8" y="3.3" width="12.4" height="9.4" rx="2.2" stroke="currentColor" strokeWidth="1.3" />
      <text x="8" y="10.9" textAnchor="middle" fontSize="7.6" fontWeight="700" fill="currentColor" fontFamily="inherit">
        {letter}
      </text>
    </svg>
  );
}

/** An eraser wiping a line clean: Clear Draft, every player off the squad. */
export function ClearDraftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.6 2.6 13.4 6.4a1 1 0 0 1 0 1.4L8 13.2H5.2L2.6 10.6a1 1 0 0 1 0-1.4l5.6-6.6a1 1 0 0 1 1.4 0Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.6 6.4l4 4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 13.2h5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** A four-point spark: Best Draft, the XI and armbands picked for you. */
export function BestDraftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7 1.8 8.3 5.7l3.9 1.3-3.9 1.3L7 12.2 5.7 8.3 1.8 7l3.9-1.3L7 1.8Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M12.4 10.2l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8Z" fill="currentColor" />
    </svg>
  );
}

/** Two bars side by side over a baseline: the Gameweek Summary, the squad against every manager. */
export function GameweekSummaryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.2" y="4" width="3.6" height="8.6" rx="0.8" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9.2" y="7" width="3.6" height="5.6" rx="0.8" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1.8 14.2h12.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Rows, each with its gameweek dot: the Gameweek Log. */
export function GameweekLogIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3.2" cy="4" r="1.1" fill="currentColor" />
      <circle cx="3.2" cy="8" r="1.1" fill="currentColor" />
      <circle cx="3.2" cy="12" r="1.1" fill="currentColor" />
      <path d="M6.2 4h7.6M6.2 8h7.6M6.2 12h7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** A tick: confirm (Team Building's transfers). */
export function ConfirmIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.4 6.4 11.6 13 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A coin with a pound sign: a player's price (Team Building's Highlight → Price). */
export function PriceIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.9 5.6a1.9 1.9 0 0 0-3.6.8v4.8M5.4 8.6h3.4M5.4 11.2h5.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A pie with a slice out: the share of FPL managers who own a player (Highlight → Owned). */
export function OwnershipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7 2.6a5.6 5.6 0 1 0 6.4 6.4H7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.2 1.4a5.6 5.6 0 0 1 5.4 5.4H9.2Z" fill="currentColor" />
    </svg>
  );
}

/** Three linked nodes: Scoutline's own points model (Exp. Pts, Model Predicted). */
export function ModelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 11.6 7.6 4.4 12 11.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="7.6" cy="4.4" r="2.1" fill="currentColor" />
      <circle cx="4" cy="11.6" r="2.1" fill="currentColor" />
      <circle cx="12" cy="11.4" r="2.1" fill="currentColor" />
    </svg>
  );
}

/** A strip of fixture chips: who a player plays (Fixtures → Games). */
export function GamesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.4" y="5" width="3.6" height="6" rx="0.9" fill="currentColor" />
      <rect x="6.2" y="5" width="3.6" height="6" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
      <rect x="11" y="5" width="3.6" height="6" rx="0.9" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

/** A percent sign: each match's forecast odds (Fixtures → Odds). */
export function OddsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12.6 3.4 3.4 12.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="4.6" cy="4.6" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.4" cy="11.4" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** A shield with a tick: a club's chance of a clean sheet (Fixtures → Odds, for goalkeepers and defenders). */
export function CleanSheetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.8 13 3.6v4c0 3.1-2.1 5.3-5 6.6-2.9-1.3-5-3.5-5-6.6v-4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.6 7.9 7.3 9.6l3.1-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A ball in flight, streaks behind it: the goals a club can expect (Fixtures → Odds, for midfielders and forwards). */
export function GoalsExpectedIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="10.4" cy="8" r="3.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10.4" cy="8" r="1.2" fill="currentColor" />
      <path d="M1.6 5.6h3.2M1 8h3.2M1.6 10.4h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** A price tag: today's price (Price → Current). */
export function PriceTagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 3.2a1.2 1.2 0 0 1 1.2-1.2h4.3l6.5 6.5-5.5 5.5L2 7.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="5.2" cy="5.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** A bag: what a player cost when he joined the squad (Price → Purchase). */
export function PurchaseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5.4h10l-.8 8.2H3.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.8 5.4V4.2a2.2 2.2 0 0 1 4.4 0v1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Coins with an arrow leaving: what FPL would pay for a player (Price → Sell). */
export function SellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="6" cy="11.6" rx="4.2" ry="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.8 11.6V9c0-1 1.9-1.8 4.2-1.8s4.2.8 4.2 1.8v2.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.4 5.2h4M12.6 3l2 2.2-2 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A meter part filled, the threshold at its end: FPL's price change progress (Price → Progress); dashed on toward it, the predicted progress. */
export function ProgressIcon({ predicted = false, size = 16 }: { predicted?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.6" y="5.6" width="11.4" height="4.8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="3" y="7" width="4.8" height="2" rx="0.5" fill="currentColor" />
      {predicted && <path d="M8.8 8h3" stroke="currentColor" strokeWidth="2" strokeDasharray="1 0.9" />}
      <path d="M14.6 3.4v9.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** A card with a star: the Wildcard chip. */
export function WildcardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="1.8" width="10" height="12.4" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="m8 5 .9 1.9 2 .3-1.5 1.4.4 2L8 9.6l-1.8 1 .4-2-1.5-1.4 2-.3Z" fill="currentColor" />
    </svg>
  );
}

/** A lightning bolt: the Free Hit chip, a squad for one gameweek. */
export function FreeHitIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.4 1.6 3.6 9h4l-1 5.4L12.4 7h-4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/** A bench with an arrow up: the Bench Boost chip. */
export function BenchBoostIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.8 10.4h12.4M3.4 10.4v3.4M12.6 10.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 8V2.2M5.6 4.6 8 2.2l2.4 2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An infinity loop, drawn rather than typed (no font need carry the sign): unlimited transfers. */
export function InfinityIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 8c-1.4-1.9-2.5-2.8-3.8-2.8a2.8 2.8 0 0 0 0 5.6C5.5 10.8 6.6 9.9 8 8Zm0 0c1.4 1.9 2.5 2.8 3.8 2.8a2.8 2.8 0 0 0 0-5.6C10.5 5.2 9.4 6.1 8 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Each chip's icon, by FPL's chip name. */
export function ChipIcon({ chip, size = 16 }: { chip: "wildcard" | "freehit" | "bboost" | "3xc"; size?: number }) {
  if (chip === "wildcard") return <WildcardIcon size={size} />;
  if (chip === "freehit") return <FreeHitIcon size={size} />;
  if (chip === "bboost") return <BenchBoostIcon size={size} />;
  return <ArmbandIcon letter="3" size={size} />;
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
  title,
  badge,
  onClick,
  disabled,
  pressed,
}: {
  icon: React.ReactNode;
  /** Its name; also its hover unless `title` says more. */
  label: string;
  title?: string;
  badge?: number;
  onClick: () => void;
  disabled?: boolean;
  /** A switch-like button (Team Building's Captain): on shows as `.chip.active`. */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip chip-icon${pressed ? " active" : ""}`}
      title={title ?? label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {badge !== undefined && <span className="chip-icon-badge">{badge}</span>}
    </button>
  );
}
