import React from "react";
import { fmtDecimal } from "../utils/format";
import type { UsShot } from "./profileData";

/**
 * The attacking end of the pitch, goal at the top, with a set of Understat
 * shots on it.
 *
 * One season: a dot per shot where it was taken — solid for a goal, an
 * outline otherwise (so a goal is never told by colour alone), sized by its
 * xG. Several seasons (a Historic Average): too many dots to read, so the
 * area is cut into zones shaded by shots a season — one hue, light to dark.
 * Every dot and zone says what it is on hover.
 *
 * Drawn in metres on a 105 × 68 pitch, so the box and the arc sit where
 * they really are. Only the last 35 m are drawn (over 99% of shots), which
 * gives the shots room; a shot from further out is marked on the bottom
 * edge where it was taken across the pitch, as a small arrow pointing
 * further away, and counted under the map — never moved into the area.
 *
 * Understat's coordinates are 0–1 along the pitch towards the goal (x) and
 * across it from the shooter's right touchline (y).
 */

const WIDTH = 68;
const LENGTH = 105;
/** Metres from the goal line drawn. */
export const SHOT_MAP_DEPTH = 35;
const PAD = 1.5;
const GOAL_DEPTH = 1.6;

const RESULT_LABEL: Record<string, string> = {
  Goal: "Goal",
  SavedShot: "Saved",
  MissedShots: "Missed",
  BlockedShot: "Blocked",
  ShotOnPost: "Hit the woodwork",
};
const SITUATION_LABEL: Record<string, string> = {
  OpenPlay: "open play",
  FromCorner: "from a corner",
  SetPiece: "set piece",
  DirectFreekick: "direct free kick",
  Penalty: "penalty",
};
const BODY_LABEL: Record<string, string> = { RightFoot: "right foot", LeftFoot: "left foot", Head: "header", OtherBodyPart: "other body part" };

/** Metres across from the left touchline (as the shooter faces the goal) and out from the goal line. */
function place(s: UsShot): { cx: number; out: number } {
  return { cx: (1 - s.y) * WIDTH, out: (1 - s.x) * LENGTH };
}

/** Shots from further out than the map draws. */
export function isBeyondMap(s: UsShot): boolean {
  return place(s).out > SHOT_MAP_DEPTH;
}

function radius(xG: number): number {
  return 0.25 + Math.sqrt(Math.max(0, xG)) * 1.15;
}

function shotHover(s: UsShot): string {
  const metres = Math.round(place(s).out);
  return `${s.minute}' · ${RESULT_LABEL[s.result] ?? s.result} · ${SITUATION_LABEL[s.situation] ?? s.situation}, ${BODY_LABEL[s.shotType] ?? s.shotType} · ${fmtDecimal(s.xG, 2)} xG · ${metres} m out`;
}

function PitchLines() {
  return (
    <g className="shot-map-lines" fill="none">
      <path d={`M 0 ${SHOT_MAP_DEPTH} V 0 H ${WIDTH} V ${SHOT_MAP_DEPTH}`} />
      <path d={`M 0 ${SHOT_MAP_DEPTH} H ${WIDTH}`} className="shot-map-cut" />
      <rect x={34 - 20.16} y={0} width={40.32} height={16.5} />
      <rect x={34 - 9.16} y={0} width={18.32} height={5.5} />
      <rect x={34 - 3.66} y={-GOAL_DEPTH} width={7.32} height={GOAL_DEPTH} />
      <path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" />
      <circle cx={34} cy={11} r={0.3} className="shot-map-spot" />
    </g>
  );
}

const COLS = 12;
const ROWS = 10;

function zones(shots: UsShot[], seasons: number) {
  const cells = Array.from({ length: COLS * ROWS }, () => ({ shots: 0, goals: 0, xG: 0 }));
  for (const s of shots) {
    const { cx, out } = place(s);
    if (out > SHOT_MAP_DEPTH) continue;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor((cx / WIDTH) * COLS)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((out / SHOT_MAP_DEPTH) * ROWS)));
    const c = cells[row * COLS + col];
    c.shots += 1;
    if (s.result === "Goal") c.goals += 1;
    c.xG += s.xG;
  }
  const max = Math.max(0, ...cells.map((c) => c.shots));
  return cells.map((c, i) => ({
    col: i % COLS,
    row: Math.floor(i / COLS),
    shots: c.shots / seasons,
    goals: c.goals / seasons,
    xG: c.xG / seasons,
    share: max > 0 ? c.shots / max : 0,
  }));
}

export function ShotMap({ shots, seasons, label }: { shots: UsShot[]; seasons: number; label: string }) {
  const top = -PAD - GOAL_DEPTH;
  const height = SHOT_MAP_DEPTH + PAD * 2 + GOAL_DEPTH;
  const viewBox = `${-PAD} ${top} ${WIDTH + PAD * 2} ${height}`;
  const density = seasons > 1;
  const cellW = WIDTH / COLS;
  const cellH = SHOT_MAP_DEPTH / ROWS;
  const inside = shots.filter((s) => !isBeyondMap(s));
  const beyond = shots.filter(isBeyondMap);
  // Misses first, so goals are drawn on top; bigger chances under smaller ones.
  const ordered = [...inside].sort((a, b) => Number(a.result === "Goal") - Number(b.result === "Goal") || b.xG - a.xG);
  return (
    <figure className="shot-map">
      <svg viewBox={viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <rect x={-PAD} y={top} width={WIDTH + PAD * 2} height={height} className="shot-map-pitch" />
        {density &&
          zones(shots, seasons)
            .filter((z) => z.shots > 0)
            .map((z) => (
              <rect
                key={`${z.col}-${z.row}`}
                x={z.col * cellW + 0.15}
                y={z.row * cellH + 0.15}
                width={cellW - 0.3}
                height={cellH - 0.3}
                rx={0.35}
                className="shot-map-zone"
                style={{ fillOpacity: 0.1 + 0.8 * z.share }}
              >
                <title>{`${fmtDecimal(z.shots, 1)} shots a season · ${fmtDecimal(z.goals, 1)} goals · ${fmtDecimal(z.xG, 2)} xG`}</title>
              </rect>
            ))}
        <PitchLines />
        {!density &&
          ordered.map((s, i) => {
            const { cx, out } = place(s);
            const goal = s.result === "Goal";
            return (
              <circle key={i} cx={cx} cy={out} r={radius(s.xG)} className={goal ? "shot-map-goal" : "shot-map-miss"}>
                <title>{shotHover(s)}</title>
              </circle>
            );
          })}
        {beyond.map((s, i) => {
          const { cx } = place(s);
          const y = SHOT_MAP_DEPTH + 0.2;
          return (
            <path key={`b${i}`} d={`M ${cx - 0.9} ${y} L ${cx + 0.9} ${y} L ${cx} ${y + 1.2} Z`} className={s.result === "Goal" ? "shot-map-beyond is-goal" : "shot-map-beyond"}>
              <title>{shotHover(s)}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="shot-map-key">
        {density ? (
          <span className="shot-map-key-item">
            Shots a season
            <span className="shot-map-ramp" aria-hidden="true" />
          </span>
        ) : (
          <>
            <span className="shot-map-key-item">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" className="shot-map-goal" />
              </svg>
              Goal
            </span>
            <span className="shot-map-key-item">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" className="shot-map-miss" />
              </svg>
              No goal
            </span>
            <span className="shot-map-key-item">
              <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">
                <circle cx="4" cy="6" r="2" className="shot-map-miss" />
                <circle cx="12" cy="6" r="3.2" className="shot-map-miss" />
                <circle cx="23" cy="6" r="5" className="shot-map-miss" />
              </svg>
              Higher xG
            </span>
          </>
        )}
        {beyond.length > 0 && (
          <span className="shot-map-key-item">
            <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
              <path d="M 1 1 L 9 1 L 5 7 Z" className="shot-map-beyond" />
            </svg>
            Further than {SHOT_MAP_DEPTH} m
          </span>
        )}
      </figcaption>
    </figure>
  );
}
