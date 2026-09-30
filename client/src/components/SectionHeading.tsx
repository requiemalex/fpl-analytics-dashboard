import React from "react";

/**
 * Page-section heading (Dashboard's Summary Tiles / Graphs, Player
 * Comparison's Charts / Outputs / Trends): a tinted icon badge, the title,
 * then a hairline running to the edge that doubles as the section divider.
 * Icons share IconToolbar's 16-unit grid and stroke weights so they read
 * as one set with the app's chip buttons.
 */

export type SectionIcon = "tiles" | "graphs" | "radar" | "outputs" | "trends";

const ICONS: Record<SectionIcon, React.ReactNode> = {
  // 2×2 grid of tiles.
  tiles: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </>
  ),
  // Axes with a line plotted across them.
  graphs: (
    <>
      <path d="M2 2.5V13.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 10.5 7 7.5l2.2 1.8L13 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Percentile radar: hexagonal frame with a filled shape inside.
  radar: (
    <>
      <path d="M8 1.8 13.4 4.9v6.2L8 14.2l-5.4-3.1V4.9L8 1.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path
        d="M8 4.6 11.3 6.6 10.4 10 8 11.4 5 9.8 5.6 6.8Z"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </>
  ),
  // Stat rows of differing length off a shared baseline.
  outputs: (
    <>
      <path d="M2.5 2v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 4.5h8.5M5 8h5.5M5 11.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // Trending-up arrow.
  trends: (
    <>
      <path d="M1.8 12 6 7.8l2.8 2.8 5.2-5.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 5.2H14v3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function SectionHeading({ icon, children }: { icon: SectionIcon; children: React.ReactNode }) {
  return (
    <h2 className="section-heading">
      <span className="section-heading-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          {ICONS[icon]}
        </svg>
      </span>
      {children}
    </h2>
  );
}
