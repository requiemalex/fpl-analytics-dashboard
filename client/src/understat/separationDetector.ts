/**
 * How separation.test.ts decides that a file depends on Understat code
 * (<understat_separation>). Any way of loading a module whose path has an
 * `understat` folder in it counts: `import … from`, `export … from`, a
 * side-effect `import "…"` (a stylesheet, say), CSS `@import`, `import(…)`
 * with any spacing or a template literal, and `require(…)` (audit
 * 2026-10-18 M20: only the first two and a tightly spaced `import("…")`
 * were caught). Only the tests use it.
 */
export const IMPORTS_UNDERSTAT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`][^"'`\n]*\/understat(?:\/|["'`])/;

/** The source files the separation test scans: code and stylesheets, never tests. */
export const SCANNED_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|css)$/;
export const TEST_FILE = /\.test\.(ts|tsx|js|jsx)$/;
