import React from "react";
import type { SeasonTrend } from "../../metrics/careerMetrics";
import { fmtDecimal, fmtSigned } from "../../utils/format";
import { MinutesFloorIcon } from "../MinutesFloorBadge";

/**
 * Deliberately narrower than PlayerSeasonHistory — the chart only ever
 * reads seasonName/totalPoints, so it works equally for a single player's
 * real season history and for a club's season totals (Team Profile,
 * metrics/teamStats.ts clubSeasonHistory), without either caller needing to
 * pad out fields it doesn't have.
 */
export interface SeasonPointsEntry {
  seasonName: string;
  totalPoints: number;
}

/** Height (px) of the tallest bar; the plot adds room above it for the value label. */
const BAR_AREA_PX = 128;

/** "2025/26" → "25/26" — the axis only has room for the short form; hover shows the full name. */
function shortSeason(seasonName: string): string {
  return /^\d{4}\//.test(seasonName) ? seasonName.slice(2) : seasonName;
}

function TrendUpIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.8 11.5 6 7.3l2.7 2.7 5.2-5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 4.8h3.7v3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendDownIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.8 4.5 6 8.7l2.7-2.7 5.2 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 11.2h3.7V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendFlatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.3 5.3 13 8l-2.7 2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A short level line — the same mark as the chart's average line. */
export function AverageLineIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A target — goals. */
export function GoalsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** A pass curving up and on — assists. */
export function AssistsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 13.5c0-4.5 3-7.5 9.5-7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.3 3.3 12 6l-2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The section heading above the card — the same heading every profile
 * section uses — with the latest season-on-season change at the right as an
 * icon and a signed figure; hovering it says which two seasons it compares.
 * `titleHint` is optional hover text on the title itself; `className`
 * colours the heading by its data source (col-source-fpl).
 */
export function PointsHistoryHeader({ trend, titleHint, title = "Points History", className }: { trend: SeasonTrend | null; titleHint?: string; title?: string; className?: string }) {
  const showTrend = trend !== null && trend.direction !== "unknown";
  const trendText = showTrend ? `${fmtSigned(trend.pointsDelta, 0)} pts, ${trend.previousSeason} → ${trend.latestSeason}` : "";
  return (
    <div className={`profile-section-heading points-history-head${className ? ` ${className}` : ""}`}>
      <h3 title={titleHint}>{title}</h3>
      {showTrend && (
        <span className={`points-trend is-${trend.direction}`} title={trendText} aria-label={trendText}>
          {trend.direction === "up" ? <TrendUpIcon /> : trend.direction === "down" ? <TrendDownIcon /> : <TrendFlatIcon />}
          {fmtSigned(trend.pointsDelta, 0)}
        </span>
      )}
    </div>
  );
}

/**
 * One season per column: the points above a bar, the season beneath it, and
 * a level line across the counted seasons at their average. No axis or
 * gridlines — every bar carries its own figure.
 *
 * Colour tracks whether a season is counted in the average shown, not
 * minutes played: every season inside the rolling window counts
 * (<no_survivorship_bias>, historicAnalysis.ts — a light, injury-hit season
 * pulls the average down rather than being dropped from it), so it draws
 * green. A season outside the window (and in the player profile, a window
 * season under the fixed minutes floor — <fixed_minutes_floor>) draws grey,
 * its figure and season muted. Hovering a season outside the window marks
 * it "†", as the season table does; a season under the floor
 * (`smallSampleSeasonNames`) carries the amber small-sample stopwatch under
 * its bar instead (<minutes_marker>), its hover text saying why.
 * The current season draws as an outline — real,
 * but not complete, so not counted until it is. The latest completed
 * season's figure is bold.
 *
 * With `onSelectSeason`, each column is a button that picks its season
 * (the profile's Match Log follows it); the picked one is outlined.
 *
 * `countedSeasonNames` null means the averaging window isn't known (the
 * historic dataset failed to load): every completed season draws the same
 * neutral colour, with nothing marked counted or uncounted.
 */
export function PointsHistoryChart({
  seasons,
  countedSeasonNames,
  currentSeasonName,
  averagePoints,
  selectedSeasonName = null,
  onSelectSeason,
  smallSampleSeasonNames,
  smallSampleNote,
}: {
  seasons: SeasonPointsEntry[];
  countedSeasonNames: Set<string> | null;
  currentSeasonName: string | null;
  averagePoints: number | null;
  selectedSeasonName?: string | null;
  onSelectSeason?: (seasonName: string) => void;
  /** Seasons not counted because they're under the fixed minutes floor: marked with the amber stopwatch. */
  smallSampleSeasonNames?: Set<string>;
  /** The hover text for that marker. */
  smallSampleNote?: string;
}) {
  const max = Math.max(0, ...seasons.map((s) => s.totalPoints));
  const heightFor = (points: number) => (max > 0 ? (Math.max(0, points) / max) * BAR_AREA_PX : 0);
  const latestCompleted = [...seasons].reverse().find((s) => s.seasonName !== currentSeasonName)?.seasonName ?? null;
  const n = seasons.length;

  const countedIdx = seasons.flatMap((s, i) => (countedSeasonNames?.has(s.seasonName) ? [i] : []));
  // The average line runs from just outside the first counted bar to just
  // outside the last. A bar is min(44px, 60% of its column) wide, so its
  // edge sits half that from the column's centre.
  const halfBar = `min(22px, ${30 / Math.max(n, 1)}%)`;
  const avgLine =
    averagePoints !== null && max > 0 && countedIdx.length > 0
      ? {
          left: `calc(${((countedIdx[0] + 0.5) / n) * 100}% - ${halfBar} - 6px)`,
          right: `calc(${((n - countedIdx[countedIdx.length - 1] - 0.5) / n) * 100}% - ${halfBar} - 6px)`,
          bottom: heightFor(averagePoints),
        }
      : null;

  const columns = seasons.map((s) => {
    const isLive = s.seasonName === currentSeasonName;
    const counted = countedSeasonNames === null ? null : countedSeasonNames.has(s.seasonName);
    const state = isLive ? "live" : counted === null ? "neutral" : counted ? "counted" : "uncounted";
    const smallSample = !isLive && smallSampleSeasonNames?.has(s.seasonName) === true;
    const mark = isLive ? " (current season)" : smallSample && smallSampleNote ? ` (${smallSampleNote})` : counted === false ? " †" : "";
    const hover = `${s.seasonName}${mark}: ${fmtDecimal(s.totalPoints, 0)} pts`;
    return { s, state, hover, smallSample, isLatest: s.seasonName === latestCompleted };
  });

  return (
    <div className="points-history">
      <div className="points-history-plot" style={{ height: BAR_AREA_PX + 24 }}>
        {columns.map(({ s, state, hover, isLatest }) => {
          const selected = onSelectSeason !== undefined && s.seasonName === selectedSeasonName;
          const content = (
            <>
              <span className={`points-history-value${state === "uncounted" ? " is-muted" : ""}${isLatest ? " is-latest" : ""}`}>
                {fmtDecimal(s.totalPoints, 0)}
              </span>
              <span className={`points-history-bar is-${state}`} style={{ height: heightFor(s.totalPoints) }} />
            </>
          );
          if (!onSelectSeason) {
            return (
              <div key={s.seasonName} className="points-history-col" title={hover} aria-label={hover}>
                {content}
              </div>
            );
          }
          const label = `${hover}. ${selected ? "Its matches are shown below" : "Show its matches below"}`;
          return (
            <button
              key={s.seasonName}
              type="button"
              className={`points-history-col is-selectable${selected ? " is-selected" : ""}`}
              title={label}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onSelectSeason(s.seasonName)}
            >
              {content}
            </button>
          );
        })}
        {avgLine && <span className="points-history-avg" style={{ left: avgLine.left, right: avgLine.right, bottom: avgLine.bottom }} />}
      </div>
      <div className="points-history-axis">
        {columns.map(({ s, state, smallSample }) => (
          <span
            key={s.seasonName}
            className={[state === "uncounted" ? "is-muted" : "", onSelectSeason && s.seasonName === selectedSeasonName ? "is-selected" : ""].filter(Boolean).join(" ") || undefined}
          >
            {shortSeason(s.seasonName)}
            {smallSample && (
              <span className="small-sample-mark" aria-hidden="true">
                <MinutesFloorIcon size={10} />
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The summary row under the chart: icon + figure pairs, each explained on hover. `children` (e.g. a toggle) sits at the far right. */
export function PointsHistoryStats({ items, children }: { items: { icon: React.ReactNode; value: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <div className="points-history-stats">
      {items.map((item) => (
        <span key={item.label} className="points-history-stat" title={item.label} aria-label={item.label}>
          {item.icon}
          <span>{item.value}</span>
        </span>
      ))}
      {children && <span className="points-history-stats-end">{children}</span>}
    </div>
  );
}
