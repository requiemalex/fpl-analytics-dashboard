import React from "react";

/**
 * The FPL / second-source switch on a column header, for a figure both
 * sources have but disagree on (xG, assists, minutes…; see
 * extensions/externalStats.ts). Defaults to FPL. The header's own colour
 * says which source is showing, so this is only an icon: two arrows
 * swapping places, with hover text naming both sources.
 */
export function SourceToggle({ showingExternal, externalLabel, onToggle }: { showingExternal: boolean; externalLabel: string; onToggle: () => void }) {
  const label = showingExternal ? `Showing ${externalLabel}'s figure · Click to show FPL's` : `Showing FPL's figure · Click to show ${externalLabel}'s`;
  return (
    <button
      type="button"
      className={`source-toggle${showingExternal ? " on" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={showingExternal}
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** A small marker on a second source's column headers when its figures are out of date or couldn't be loaded — the reason is its hover text. */
export function SourceStaleMarker({ note }: { note: string }) {
  return <span className="source-stale-marker" title={note} aria-label={note} role="img" />;
}
