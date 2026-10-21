import React from "react";
import { fmtDecimal, fmtPercent } from "../utils/format";
import type { UsShot } from "./profileData";

/**
 * The attacking end of the pitch, goal at the top, cut into zones that
 * follow its markings — the six-yard box, the middle of the penalty area
 * and its two sides, either side of the box, the edge of the box and
 * further out, left and right — each saying what share of a set of
 * Understat shots came from there, how many shots that was (a season, over
 * a Historic Average) and their average xG. Zones are shaded by share, one
 * hue, light to dark; every zone says the same and its goals on hover.
 * The same map for one season and for several, for a player and a club.
 *
 * Drawn in metres on a 105 × 68 pitch, so the zones sit on the real box
 * and six-yard lines. The last 35 m are drawn (over 99% of shots); shots
 * from further out are a band of their own under that line, so every shot
 * is in one zone and the shares add up to 100%.
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
/** The band under the drawn area for shots from further out. */
const BEYOND_BAND = 4;

const BOX_DEPTH = 16.5;
const SIX_DEPTH = 5.5;
const BOX_LEFT = 34 - 20.16;
const BOX_RIGHT = 34 + 20.16;
const SIX_LEFT = 34 - 9.16;
const SIX_RIGHT = 34 + 9.16;
/** Where the edge of the box gives way to long range. */
const EDGE_DEPTH = 25;

/** Metres across from the left touchline (as the shooter faces the goal) and out from the goal line. */
function place(s: UsShot): { cx: number; out: number } {
  return { cx: (1 - s.y) * WIDTH, out: (1 - s.x) * LENGTH };
}

/** Shots from further out than the map draws. */
export function isBeyondMap(s: UsShot): boolean {
  return place(s).out > SHOT_MAP_DEPTH;
}

interface ZoneArea {
  key: string;
  /** For the hover. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZONE_AREAS: ZoneArea[] = [
  { key: "six", name: "Six-yard box", x: SIX_LEFT, y: 0, w: SIX_RIGHT - SIX_LEFT, h: SIX_DEPTH },
  { key: "centre", name: "Centre of the box", x: SIX_LEFT, y: SIX_DEPTH, w: SIX_RIGHT - SIX_LEFT, h: BOX_DEPTH - SIX_DEPTH },
  { key: "boxLeft", name: "Left of the box", x: BOX_LEFT, y: 0, w: SIX_LEFT - BOX_LEFT, h: BOX_DEPTH },
  { key: "boxRight", name: "Right of the box", x: SIX_RIGHT, y: 0, w: BOX_RIGHT - SIX_RIGHT, h: BOX_DEPTH },
  { key: "wideLeft", name: "Wide left, level with the box", x: 0, y: 0, w: BOX_LEFT, h: BOX_DEPTH },
  { key: "wideRight", name: "Wide right, level with the box", x: BOX_RIGHT, y: 0, w: WIDTH - BOX_RIGHT, h: BOX_DEPTH },
  { key: "edge", name: "Edge of the box", x: BOX_LEFT, y: BOX_DEPTH, w: BOX_RIGHT - BOX_LEFT, h: EDGE_DEPTH - BOX_DEPTH },
  { key: "long", name: "Long range, central", x: BOX_LEFT, y: EDGE_DEPTH, w: BOX_RIGHT - BOX_LEFT, h: SHOT_MAP_DEPTH - EDGE_DEPTH },
  { key: "outsideLeft", name: "Outside the box, left", x: 0, y: BOX_DEPTH, w: BOX_LEFT, h: SHOT_MAP_DEPTH - BOX_DEPTH },
  { key: "outsideRight", name: "Outside the box, right", x: BOX_RIGHT, y: BOX_DEPTH, w: WIDTH - BOX_RIGHT, h: SHOT_MAP_DEPTH - BOX_DEPTH },
];
const BEYOND_AREA: ZoneArea = { key: "beyond", name: `Further than ${SHOT_MAP_DEPTH} m`, x: 0, y: SHOT_MAP_DEPTH, w: WIDTH, h: BEYOND_BAND };

/** The zone a shot was taken in (a shot on a line goes to the zone nearer the goal, or the middle). */
export function zoneOf(s: UsShot): string {
  const { cx, out } = place(s);
  if (out > SHOT_MAP_DEPTH) return "beyond";
  if (out <= BOX_DEPTH) {
    if (cx >= SIX_LEFT && cx <= SIX_RIGHT) return out <= SIX_DEPTH ? "six" : "centre";
    if (cx >= BOX_LEFT && cx < SIX_LEFT) return "boxLeft";
    if (cx > SIX_RIGHT && cx <= BOX_RIGHT) return "boxRight";
    return cx < BOX_LEFT ? "wideLeft" : "wideRight";
  }
  if (cx >= BOX_LEFT && cx <= BOX_RIGHT) return out <= EDGE_DEPTH ? "edge" : "long";
  return cx < BOX_LEFT ? "outsideLeft" : "outsideRight";
}

export interface ShotZone extends ZoneArea {
  /** Shots and goals from here, a season (over `seasons`). */
  shots: number;
  goals: number;
  /** Share of all the shots, 0–1. */
  share: number;
  /** Average xG of a shot from here; null with none. */
  xGPerShot: number | null;
}

export function shotZones(shots: UsShot[], seasons: number): ShotZone[] {
  const tally = new Map<string, { shots: number; goals: number; xG: number }>();
  for (const s of shots) {
    const key = zoneOf(s);
    const t = tally.get(key) ?? { shots: 0, goals: 0, xG: 0 };
    t.shots += 1;
    if (s.result === "Goal") t.goals += 1;
    t.xG += s.xG;
    tally.set(key, t);
  }
  const areas = tally.has("beyond") ? [...ZONE_AREAS, BEYOND_AREA] : ZONE_AREAS;
  return areas.map((a) => {
    const t = tally.get(a.key) ?? { shots: 0, goals: 0, xG: 0 };
    return {
      ...a,
      shots: t.shots / seasons,
      goals: t.goals / seasons,
      share: shots.length > 0 ? t.shots / shots.length : 0,
      xGPerShot: t.shots > 0 ? t.xG / t.shots : null,
    };
  });
}

/** A share as the zone shows it: "<1%" for one that rounds to nothing. */
export function shareText(share: number): string {
  return share > 0 && share < 0.005 ? "<1%" : fmtPercent(share * 100, 0);
}

function PitchLines() {
  return (
    <g className="shot-map-lines" fill="none">
      <path d={`M 0 ${SHOT_MAP_DEPTH} V 0 H ${WIDTH} V ${SHOT_MAP_DEPTH}`} />
      <path d={`M 0 ${SHOT_MAP_DEPTH} H ${WIDTH}`} className="shot-map-cut" />
      <rect x={BOX_LEFT} y={0} width={BOX_RIGHT - BOX_LEFT} height={BOX_DEPTH} />
      <rect x={SIX_LEFT} y={0} width={SIX_RIGHT - SIX_LEFT} height={SIX_DEPTH} />
      <rect x={34 - 3.66} y={-GOAL_DEPTH} width={7.32} height={GOAL_DEPTH} />
      <path d="M 26.69 16.5 A 9.15 9.15 0 0 0 41.31 16.5" />
      <circle cx={34} cy={11} r={0.3} className="shot-map-spot" />
    </g>
  );
}

export function ShotMap({ shots, seasons, label }: { shots: UsShot[]; seasons: number; label: string }) {
  const zones = shotZones(shots, seasons);
  const beyond = zones.some((z) => z.key === "beyond");
  const top = -PAD - GOAL_DEPTH;
  const height = SHOT_MAP_DEPTH + (beyond ? BEYOND_BAND : 0) + PAD * 2 + GOAL_DEPTH;
  const viewBox = `${-PAD} ${top} ${WIDTH + PAD * 2} ${height}`;
  const maxShare = Math.max(0, ...zones.map((z) => z.share));
  const dp = seasons > 1 ? 1 : 0;
  const perSeason = seasons > 1 ? " a season" : "";
  const shotsText = (n: number) => `${fmtDecimal(n, dp)} shot${n === 1 ? "" : "s"}`;
  return (
    <figure className="shot-map">
      <svg viewBox={viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <rect x={-PAD} y={top} width={WIDTH + PAD * 2} height={height} className="shot-map-pitch" />
        {/* Three layers: the zones' shading, the pitch's lines over it, and the zones' text over both, so no line or spot crosses a figure. */}
        {zones.map((z) => {
          const hover =
            z.shots > 0
              ? `${z.name}: ${shotsText(z.shots)}${perSeason} (${shareText(z.share)} of them) · ${fmtDecimal(z.goals, dp)} goal${z.goals === 1 ? "" : "s"} · ${fmtDecimal(z.xGPerShot, 2)} xG per shot`
              : `${z.name}: no shots`;
          return (
            <g key={z.key} className="shot-map-zone" data-zone={z.key}>
              <title>{hover}</title>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                className="shot-map-zone-fill"
                style={{ fillOpacity: z.shots > 0 && maxShare > 0 ? 0.08 + 0.52 * (z.share / maxShare) : 0 }}
              />
            </g>
          );
        })}
        <PitchLines />
        <g className="shot-map-labels">
          {zones.map((z) => {
            if (z.shots === 0) return null;
            const cx = z.x + z.w / 2;
            return z.key === "beyond" ? (
              <text key={z.key} data-zone={z.key} x={cx} y={z.y + z.h / 2} dy="0.35em" textAnchor="middle" className="shot-map-zone-detail">
                {`${z.name} · ${shareText(z.share)} · ${shotsText(z.shots)} · ${fmtDecimal(z.xGPerShot, 2)} xG/shot`}
              </text>
            ) : (
              <text key={z.key} data-zone={z.key} x={cx} y={z.y + z.h / 2} textAnchor="middle">
                <tspan x={cx} dy="-0.9" className="shot-map-zone-share">
                  {shareText(z.share)}
                </tspan>
                <tspan x={cx} dy="1.75" className="shot-map-zone-detail">
                  {shotsText(z.shots)}
                </tspan>
                <tspan x={cx} dy="1.35" className="shot-map-zone-detail">
                  {`${fmtDecimal(z.xGPerShot, 2)} xG/shot`}
                </tspan>
              </text>
            );
          })}
        </g>
      </svg>
      <figcaption className="shot-map-key">
        <span className="shot-map-key-item">
          Share of shots
          <span className="shot-map-ramp" aria-hidden="true" />
        </span>
      </figcaption>
    </figure>
  );
}
