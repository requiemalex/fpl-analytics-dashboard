import { describe, expect, it } from "vitest";
import { isInsideBox } from "../../../server/src/understat/pipeline/shotLocation";
import { zoneOf } from "./ShotMap";
import type { UsShot } from "./profileData";

/**
 * <shot_location>: the Explorers' inside/outside-box figures are counted by
 * the sync (server pipeline/shotLocation.ts), the shot maps' zones here
 * (ShotMap.tsx zoneOf). The same box in both, so a player's Shots Inside
 * Box always matches what his shot map shows.
 */

const BOX_ZONES = new Set(["six", "centre", "boxLeft", "boxRight"]);

describe("inside the box: the sync and the shot maps agree", () => {
  it("on every point of a fine grid over the attacking half, the lines included", () => {
    let disagreements = 0;
    let inside = 0;
    for (let i = 0; i <= 500; i++) {
      for (let j = 0; j <= 400; j++) {
        const s = { x: 0.5 + (i / 500) * 0.5, y: j / 400 } as UsShot;
        const box = isInsideBox(s);
        if (box) inside++;
        if (box !== BOX_ZONES.has(zoneOf(s))) disagreements++;
      }
    }
    expect(inside).toBeGreaterThan(0);
    expect(disagreements).toBe(0);
  });

  it("puts the penalty spot inside and a shot from 20 m outside", () => {
    expect(isInsideBox({ x: 1 - 11 / 105, y: 0.5 })).toBe(true);
    expect(isInsideBox({ x: 1 - 20 / 105, y: 0.5 })).toBe(false);
  });
});
