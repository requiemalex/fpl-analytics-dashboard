import { fmtDecimal, DASH } from "../../utils/format";

/**
 * A glanceable gauge for how heavily a player has actually been used this
 * season — average minutes per completed gameweek so far, filled
 * proportionally against a 90-minute match and color-tiered (regular /
 * rotation risk / fringe) — plus the two figures behind it spelled out as
 * text next to the icon, so the card doesn't read as near-empty once the
 * gauge itself (a small fixed-size circle) is all there is to look at.
 */
export function PlayingTimeIcon({ averageMinutes, gameweeksPlayed }: { averageMinutes: number | null; gameweeksPlayed: number }) {
  if (averageMinutes === null) {
    return (
      <div className="playing-time-row">
        <div className="playing-time-icon tier-none" title="No completed gameweeks yet this season" aria-label="No playing-time data yet this season">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border-strong)" strokeWidth="6" strokeDasharray="4 5" />
          </svg>
        </div>
        <div className="playing-time-summary">
          <div>Completed Gameweeks: {gameweeksPlayed}</div>
          <div>Average Minutes Per Gameweek: {DASH}</div>
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(1, averageMinutes / 90));
  const tier = pct >= 0.75 ? "high" : pct >= 0.4 ? "medium" : "low";
  const tierLabel = tier === "high" ? "Regular starter" : tier === "medium" ? "Rotation risk" : "Fringe player";
  const radius = 22;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="playing-time-row">
      <div
        className={`playing-time-icon tier-${tier}`}
        title={`${tierLabel} — ${fmtDecimal(averageMinutes, 0)} min average across ${gameweeksPlayed} completed gameweek${gameweeksPlayed === 1 ? "" : "s"} this season`}
        aria-label={`${tierLabel}, averaging ${fmtDecimal(averageMinutes, 0)} minutes per gameweek this season`}
      >
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--border-strong)" strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${circumference * pct} ${circumference}`}
            transform="rotate(-90 28 28)"
          />
        </svg>
      </div>
      <div className="playing-time-summary">
        <div>Completed Gameweeks: {gameweeksPlayed}</div>
        <div>Average Minutes Per Gameweek: {fmtDecimal(averageMinutes, 0)}</div>
      </div>
    </div>
  );
}
