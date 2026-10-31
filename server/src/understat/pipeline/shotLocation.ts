/**
 * <shot_location>: whether a shot was taken inside the penalty area, from
 * Understat's coordinates (0–1 along the pitch towards the goal, x, and
 * across it from the shooter's right touchline, y) on a 105 × 68 m pitch's
 * markings. It's the box the profile shot maps draw: their six-yard box,
 * centre and box-left/right zones (client/src/understat/ShotMap.tsx
 * `zoneOf`), a shot on the line counting as inside as it does there, so the
 * Explorers' box figures and the shot maps always agree
 * (client/src/understat/shotLocation.test.ts checks it). Penalties are
 * inside (the owner's decision, 2026-10-31: a penalty is box xG).
 *
 * The app's own count: Understat's zone figures on its player pages can put
 * about 1 shot in 100, one right on a line, on the other side of it (the
 * owner's decision, 2026-10-31, to count from the coordinates rather than
 * wait for those pages).
 */
const WIDTH = 68;
const LENGTH = 105;
const BOX_DEPTH = 16.5;
const BOX_LEFT = 34 - 20.16;
const BOX_RIGHT = 34 + 20.16;

export function isInsideBox(s: { x: number; y: number }): boolean {
  const cx = (1 - s.y) * WIDTH;
  const out = (1 - s.x) * LENGTH;
  return out <= BOX_DEPTH && cx >= BOX_LEFT && cx <= BOX_RIGHT;
}
