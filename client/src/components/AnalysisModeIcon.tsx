import React from "react";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";

/**
 * The icon glyph for each analysis mode — shared by every place that used to
 * spell the mode out as text (the toggle button groups on Dashboard, Player
 * Explorer/Team Explorer, Team Builder, and the per-tile DataViewBadge), so
 * the "trophy / bars+dashed-line / pulse" visual language stays identical
 * everywhere it appears. `currentColor` is used throughout so the icon
 * inherits whatever color the toggle button/badge already applies for its
 * active/inactive state.
 */
export function AnalysisModeIcon({ mode, size = 18 }: { mode: AnalysisMode; size?: number }) {
  switch (mode) {
    case "lastSeason":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" />
          <path d="M7 5H4.75A1.75 1.75 0 0 0 3 6.75v.25A3.5 3.5 0 0 0 6.5 10.5H7" />
          <path d="M17 5h2.25A1.75 1.75 0 0 1 21 6.75v.25a3.5 3.5 0 0 1-3.5 3.5H17" />
          <path d="M12 13v3" />
          <path d="M9.25 19.5h5.5" />
          <path d="M10 16.5h4l.6 3H9.4l.6-3Z" />
        </svg>
      );
    case "historicAverage":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <line x1="3" y1="11.5" x2="21" y2="11.5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.4" strokeLinecap="round" />
          <rect x="5" y="13" width="3.4" height="7" rx="0.6" fill="currentColor" />
          <rect x="10.3" y="6.5" width="3.4" height="13.5" rx="0.6" fill="currentColor" />
          <rect x="15.6" y="9.5" width="3.4" height="10.5" rx="0.6" fill="currentColor" />
        </svg>
      );
    case "live":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="6.2" strokeWidth="1.6" opacity="0.75" />
          <circle cx="12" cy="12" r="10" strokeWidth="1.6" opacity="0.35" />
        </svg>
      );
  }
}
