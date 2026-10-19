import React from "react";
import { fmtDecimal } from "../utils/format";
import type { UsShot } from "./profileData";

/**
 * A half pitch, attacking upwards, with a set of Understat shots on it.
 *
 * One season: a dot per shot where it was taken — filled for a goal,
 * hollow otherwise (so a goal is never told by colour alone), sized by its
 * xG. Several seasons (a Historic Average): too many dots to read, so the
 * half is cut into zones shaded by shots per season — one hue, light to
 * dark. Every dot and zone says what it is on hover.
 *
 * Understat's coordinates are 0–1 along the pitch towards the goal (x) and
 * across it from the shooter's right touchline (y); drawn here in metres on
 * a 105 × 68 pitch, so the box and the arc sit where they really are.
 */

const WIDTH = 68;
const HALF = 52.5;
const LENGTH = 105;
const PAD = 2;

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

/** Screen position in metres: across from the left touchline, down from the goal line. */
function place(s: UsShot): { cx: number; cy: number } {
  return { cx: (1 - s.y) * WIDTH, cy: Math.min(HALF, (1 - s.x) * LENGTH) };
}

function radius(xG: number): number {
  return 0.6 + Math.sqrt(Math.max(0, xG)) * 2.4;
}

function PitchLines() {
  return (
    <g className="shot-map-lines" fill="none">
      <rect x={0} y={0} width={WIDTH} height={HALF} />
      <rect x={34 - 20.16} y={0} width={40.32} height={16.5} />
      <rect x={34 - 9.16} y={0} width={18.32} height={5.5} />
      <rect x={34 - 3.66} y={-1.6} width={7.32} height={1.6} />
      <path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" />
      <path d={`M 24.85 ${HALF} A 9.15 9.15 0 0 1 43.15 ${HALF}`} />
      <circle cx={34} cy={11} r={0.35} className="shot-map-spot" />
    </g>
  );
}

function shotHover(s: UsShot): string {
  return `${s.minute}' · ${RESULT_LABEL[s.result] ?? s.result} · ${SITUATION_LABEL[s.situation] ?? s.situation}, ${BODY_LABEL[s.shotType] ?? s.shotType} · ${fmtDecimal(s.xG, 2)} xG`;
}

const COLS = 8;
const ROWS = 10;

function zones(shots: UsShot[], seasons: number) {
  const cells = Array.from({ length: COLS * ROWS }, () => ({ shots: 0, goals: 0, xG: 0 }));
  for (const s of shots) {
    const { cx, cy } = place(s);
    const col = Math.min(COLS - 1, Math.max(0, Math.floor((cx / WIDTH) * COLS)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((cy / HALF) * ROWS)));
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
  const viewBox = `${-PAD} ${-PAD - 1.6} ${WIDTH + PAD * 2} ${HALF + PAD * 2 + 1.6}`;
  const density = seasons > 1;
  const cellW = WIDTH / COLS;
  const cellH = HALF / ROWS;
  // Hollow (no goal) first, so goals are drawn on top.
  const ordered = [...shots].sort((a, b) => Number(a.result === "Goal") - Number(b.result === "Goal") || b.xG - a.xG);
  return (
    <figure className="shot-map">
      <svg viewBox={viewBox} role="img" aria-label={label}>
        <rect x={-PAD} y={-PAD - 1.6} width={WIDTH + PAD * 2} height={HALF + PAD * 2 + 1.6} className="shot-map-pitch" />
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
                rx={0.6}
                className="shot-map-zone"
                style={{ fillOpacity: 0.12 + 0.78 * z.share }}
              >
                <title>{`${fmtDecimal(z.shots, 1)} shots a season · ${fmtDecimal(z.goals, 1)} goals · ${fmtDecimal(z.xG, 2)} xG`}</title>
              </rect>
            ))}
        <PitchLines />
        {!density &&
          ordered.map((s, i) => {
            const { cx, cy } = place(s);
            const r = radius(s.xG);
            const goal = s.result === "Goal";
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} className={goal ? "shot-map-goal" : "shot-map-miss"} />
                <circle cx={cx} cy={cy} r={r + 0.9} className="shot-map-hit">
                  <title>{shotHover(s)}</title>
                </circle>
              </g>
            );
          })}
      </svg>
      <figcaption className="shot-map-key">
        {density ? (
          <>
            <span>Shots a season</span>
            <span className="shot-map-ramp" aria-hidden="true" />
            <span>fewer → more</span>
          </>
        ) : (
          <>
            <span className="shot-map-key-item">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" className="shot-map-goal" />
              </svg>
              Goal
            </span>
            <span className="shot-map-key-item">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="3.6" className="shot-map-miss" style={{ strokeWidth: 1.2 }} />
              </svg>
              No goal
            </span>
            <span>Bigger = higher xG</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
