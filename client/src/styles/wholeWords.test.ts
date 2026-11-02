import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * <whole_words> (owner's rule, 2026-11-02): no label, heading or figure is
 * ever split in the middle of a word ("Confirme / d"). Text wraps only
 * between words, and a box holding a label is never narrower than its
 * longest word (the tile grids' columns are minmax(min-content, 1fr)).
 * This scans every client source file and the Electron pages and fails on
 * any rule that lets the browser split a word wherever it likes. The one
 * exception is a URL, which has no words to keep whole (`.help-url`).
 * `overflow-wrap: break-word` is allowed: it splits a word only when no
 * line could ever hold it (a user's own very long name), and never makes a
 * box narrower than its words.
 */

const CLIENT = join(__dirname, "..", "..");
const ROOT = join(CLIENT, "..");
const SCANNED = /\.(ts|tsx|js|jsx|css|html)$/;
const SKIPPED = /\.test\.(ts|tsx|js)$/;

/** Selectors whose text may break anywhere: URLs only. */
const ALLOWED_SELECTORS = [".help-url"];

const SPLITS_WORDS = [
  /overflow-wrap\s*:\s*anywhere/,
  /word-break\s*:\s*(break-all|break-word)/,
  /hyphens\s*:\s*auto/,
  /overflowWrap\s*:\s*["']anywhere["']/,
  /wordBreak\s*:\s*["'](break-all|break-word)["']/,
  /hyphens\s*:\s*["']auto["']/,
  /line-break\s*:\s*anywhere/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return SCANNED.test(name) && !SKIPPED.test(path) ? [path] : [];
  });
}

/** Each line that splits words, unless it sits in an allowed CSS rule. */
function findWordSplits(source: string): { line: number; text: string }[] {
  let selector = "";
  const found: { line: number; text: string }[] = [];
  source.split(/\r?\n/).forEach((text, i) => {
    const opens = text.match(/^\s*([^{}]+?)\s*\{\s*$/);
    if (opens) selector = opens[1];
    if (!SPLITS_WORDS.some((re) => re.test(text))) return;
    if (ALLOWED_SELECTORS.includes(selector.trim())) return;
    found.push({ line: i + 1, text: text.trim() });
  });
  return found;
}

describe("<whole_words>: no word is split across lines", () => {
  it("no source file lets the browser break a word anywhere (URLs aside)", () => {
    const scanned = [...files(join(CLIENT, "src")), join(CLIENT, "index.html"), ...files(join(ROOT, "electron"))];
    const violations = scanned.flatMap((path) =>
      findWordSplits(readFileSync(path, "utf8")).map((v) => `${relative(ROOT, path).replace(/\\/g, "/")}:${v.line} ${v.text}`),
    );
    expect(violations).toEqual([]);
  });

  it("catches a word-splitting rule, and lets a URL's through", () => {
    expect(findWordSplits(".stat-tile-label {\n  overflow-wrap: anywhere;\n}")).toHaveLength(1);
    expect(findWordSplits('<span style={{ wordBreak: "break-all" }}>')).toHaveLength(1);
    expect(findWordSplits(".help-url {\n  overflow-wrap: anywhere;\n}")).toEqual([]);
    expect(findWordSplits(".card-title {\n  overflow-wrap: break-word;\n}")).toEqual([]);
  });

  it("every tile grid's columns are at least as wide as their longest word", () => {
    const css = readFileSync(join(CLIENT, "src", "styles", "components.css"), "utf8");
    for (const grid of [".planning-figures", ".summary-tiles", ".stat-tile-grid", ".summary-grid"]) {
      const rules = [...css.matchAll(new RegExp(`(?:^|\\n)\\s*[^{}\\n]*${grid.replace(".", "\\.")}[^{}\\n]*\\{([^}]*)\\}`, "g"))].map((m) => m[1]);
      const columns = rules.flatMap((body) => [...body.matchAll(/grid-template-columns\s*:\s*([^;]+);/g)].map((m) => m[1]));
      expect(columns.length, grid).toBeGreaterThan(0);
      for (const c of columns) expect(c, grid).toMatch(/minmax\(min-content, 1fr\)/);
    }
  });
});
