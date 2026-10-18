import { describe, expect, it } from "vitest";

/**
 * Audit 2026-10-18: separation.test.ts decides "imports Understat" with this
 * regex (copied verbatim from filesImportingUnderstat). These import forms all
 * create a real dependency on client/src/understat/ and must be caught.
 */
const DETECTOR = /from\s+["'][^"']*\/understat\/|import\(["'][^"']*\/understat\//;

describe("separation detector catches every import form", () => {
  it("catches a normal named import", () => {
    expect(DETECTOR.test('import { x } from "../understat/columns";')).toBe(true);
  });
  it.fails("[UNDERSTAT-SEP] catches a side-effect import (e.g. its CSS)", () => {
    expect(DETECTOR.test('import "../understat/understat.css";')).toBe(true);
  });
  it.fails("[UNDERSTAT-SEP] catches a template-literal dynamic import", () => {
    expect(DETECTOR.test("const m = await import(`../understat/columns`);")).toBe(true);
  });
  it.fails("[UNDERSTAT-SEP] catches a dynamic import with whitespace", () => {
    expect(DETECTOR.test('const m = await import( "../understat/columns");')).toBe(true);
  });
  it.fails("[UNDERSTAT-SEP] catches require()", () => {
    expect(DETECTOR.test('const m = require("../understat/columns");')).toBe(true);
  });
});
