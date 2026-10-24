import React, { useId } from "react";
import { teamDisplayColors } from "../utils/teamColors";

/**
 * <club_kit>: the shirt every pitch draws a player or slot as — Team
 * Building's squad and the Team Profile's Formations section. Body and
 * sleeves in the club's colour, collar and cuffs in its second colour: the
 * same pair TeamBadge's swatch shows (utils/teamColors.ts), so a club
 * reads the same on a pill and on a shirt. A goalkeeper's shirt swaps the
 * two, so he stands apart from his outfielders as he does on a real pitch.
 * A plain, generic silhouette, not any club's real kit design.
 *
 * `colours` instead of `club` paints it in fixed colours (the Formations
 * section's Understat violet). `children` sit on the chest (its slot badge).
 */
export function Kit({
  club,
  colours,
  goalkeeper = false,
  title,
  children,
}: {
  club?: { id: number; shortName: string };
  colours?: { body: string; trim: string };
  goalkeeper?: boolean;
  /** Hover text; defaults to the club's short name. */
  title?: string;
  children?: React.ReactNode;
}) {
  const shadeId = useId();
  const clubColours = club ? teamDisplayColors(club.id, club.shortName) : null;
  const body = colours?.body ?? (goalkeeper ? clubColours?.secondary : clubColours?.primary);
  const trim = colours?.trim ?? (goalkeeper ? clubColours?.primary : clubColours?.secondary);
  return (
    <div className="pitch-card-jersey" title={title ?? club?.shortName}>
      <svg className="kit-svg" viewBox="0 0 64 60" aria-hidden="true">
        <defs>
          <linearGradient id={shadeId} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
        </defs>
        <path d={SHIRT} style={{ fill: body }} />
        <path d={SHIRT} fill={`url(#${shadeId})`} />
        <path d="M1 22 L9 28 L11.6 25.4 L3.6 18.6 Z M63 22 L55 28 L52.4 25.4 L60.4 18.6 Z" style={{ fill: trim }} />
        <path d="M22 4 Q32 12 42 4" fill="none" style={{ stroke: trim }} strokeWidth="3" strokeLinejoin="round" />
        <path d={SHIRT} fill="none" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      {children && <span className="pitch-card-jersey-position">{children}</span>}
    </div>
  );
}

/** Body and both sleeves in one outline, neck to hem. */
const SHIRT = "M22 4 L10 9 L1 22 L9 28 L14 23.5 L14 57 L50 57 L50 23.5 L55 28 L63 22 L54 9 L42 4 Q32 12 22 4 Z";
