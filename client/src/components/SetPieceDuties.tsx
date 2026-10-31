import React from "react";
import type { NormalizedPlayer } from "../types/normalized";

/**
 * <set_piece_duties>: a player on his club's penalty, direct free-kick or
 * corner list (FPL's own, today's: `penalties_order`,
 * `direct_freekicks_order`, `corners_and_indirect_freekicks_order`) as an
 * icon after his name: one shape per duty, gold for first choice, silver
 * second, bronze third (the owner's decision, 2026-10-31, replacing the
 * Pen Order, FK Order and Corner Order columns). Several duties, several
 * icons. Past third on a list, no icon. Each says on hover what it means for
 * him now.
 */

export type SetPieceDuty = "penalties" | "directFreekicks" | "corners";

export interface DutyBadge {
  duty: SetPieceDuty;
  /** 1–3: his place on the club's list. */
  order: 1 | 2 | 3;
}

/** In the order the icons are drawn. */
const DUTIES: SetPieceDuty[] = ["penalties", "directFreekicks", "corners"];

const ORDER_OF: Record<SetPieceDuty, (p: NormalizedPlayer) => number | null> = {
  penalties: (p) => p.penaltiesOrder,
  directFreekicks: (p) => p.directFreekicksOrder,
  corners: (p) => p.cornersOrder,
};

/** His duties, first choices and all, up to third on each list. */
export function setPieceDuties(p: NormalizedPlayer): DutyBadge[] {
  return DUTIES.flatMap((duty) => {
    const order = ORDER_OF[duty](p);
    return order === 1 || order === 2 || order === 3 ? [{ duty, order }] : [];
  });
}

const WHAT: Record<SetPieceDuty, { name: string; does: string }> = {
  penalties: { name: "Penalties", does: "takes the penalties: extra chances to score" },
  directFreekicks: { name: "Direct free kicks", does: "shoots from free kicks in range of goal: extra chances to score" },
  corners: { name: "Corners and indirect free kicks", does: "delivers them: extra chances to set up goals" },
};

const CHOICE = ["first", "second", "third"] as const;
const WHEN = ["whenever he's on the pitch", "when the first choice is off the pitch", "when the two ahead of him are off the pitch"] as const;

/** The hover: the duty, his place on the list, and what that means for him now. */
export function dutyHint({ duty, order }: DutyBadge, club: string): string {
  const { name, does } = WHAT[duty];
  return `${name}: ${CHOICE[order - 1]} choice for ${club}. He ${does} ${WHEN[order - 1]}. FPL's list today.`;
}

/** One shape per duty, in the badge's colour. */
export function DutyIcon({ duty, size = 12 }: { duty: SetPieceDuty; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      {duty === "penalties" && (
        <>
          <path d="M1.5 7.5V2h9v5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="6" cy="10.2" r="1.4" fill="currentColor" />
        </>
      )}
      {duty === "directFreekicks" &&
        [2.6, 6, 9.4].map((x) => (
          <React.Fragment key={x}>
            <circle cx={x} cy="2.6" r="1.25" fill="currentColor" />
            <rect x={x - 0.95} y="4.6" width="1.9" height="6.4" rx="0.7" fill="currentColor" />
          </React.Fragment>
        ))}
      {duty === "corners" && (
        <>
          <path d="M3 11.2V1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3.6 1.2 10 3.4 3.6 5.6Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** Every duty he has, as icons, after his name. Nothing when he has none. */
export function SetPieceDutyIcons({ player }: { player: NormalizedPlayer }) {
  const badges = setPieceDuties(player);
  if (badges.length === 0) return null;
  return (
    <span className="duty-icons">
      {badges.map((b) => {
        const hint = dutyHint(b, player.teamName);
        return (
          <span key={b.duty} className={`duty-icon duty-${b.order}`} title={hint} aria-label={hint} role="img">
            <DutyIcon duty={b.duty} />
          </span>
        );
      })}
    </span>
  );
}
