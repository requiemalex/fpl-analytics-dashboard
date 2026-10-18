import { describe, expect, it } from "vitest";
import { IMPORTS_UNDERSTAT as DETECTOR } from "./separationDetector";

/**
 * Audit 2026-10-18: separation.test.ts decides "imports Understat" with this
 * detector (Phase 2: now the very one it uses, not a copy). These import
 * forms all create a real dependency on client/src/understat/ and must be
 * caught.
 */

describe("separation detector catches every import form", () => {
  it("catches a normal named import", () => {
    expect(DETECTOR.test('import { x } from "../understat/columns";')).toBe(true);
  });
  it("[UNDERSTAT-SEP] catches a side-effect import (e.g. its CSS)", () => {
    expect(DETECTOR.test('import "../understat/understat.css";')).toBe(true);
  });
  it("[UNDERSTAT-SEP] catches a template-literal dynamic import", () => {
    expect(DETECTOR.test("const m = await import(`../understat/columns`);")).toBe(true);
  });
  it("[UNDERSTAT-SEP] catches a dynamic import with whitespace", () => {
    expect(DETECTOR.test('const m = await import( "../understat/columns");')).toBe(true);
  });
  it("[UNDERSTAT-SEP] catches require()", () => {
    expect(DETECTOR.test('const m = require("../understat/columns");')).toBe(true);
  });
  it("[UNDERSTAT-SEP] catches export-from and a CSS @import", () => {
    expect(DETECTOR.test('export { x } from "../understat/columns";')).toBe(true);
    expect(DETECTOR.test('@import "../understat/understat.css";')).toBe(true);
  });
  it("doesn't flag a plain string that merely mentions the folder (server/src/index.ts's data path)", () => {
    expect(DETECTOR.test('const dir = path.join(root, "../../data/understat");')).toBe(false);
    expect(DETECTOR.test('const understatColumns = 1;')).toBe(false);
  });
});
