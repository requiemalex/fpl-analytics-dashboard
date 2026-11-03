import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * <selected_state> (owner's rule, 2026-11-03): anything picked or switched
 * on looks the same everywhere, as the Dashboard's Players/Teams icons do
 * (.icon-toolbar .chip.active): filled soft green (--accent-positive-dim),
 * no green outline. A green border is for a focused text box, never for
 * something picked.
 */

const STYLES = join(__dirname);
const SRC = join(__dirname, "..");
const css = ["components.css", "layout.css"].map((f) => readFileSync(join(STYLES, f), "utf8")).join("\n");

/** The declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`No rule for ${selector}`);
  return m[1];
}

const SELECTED = [
  ".icon-toolbar .chip.active",
  ".chip.active",
  ".segmented-option.active",
  ".topbar-icon-btn.active",
  ".data-view-mode.active",
  ".fixtures-view-picker button.on",
];

describe("<selected_state>: one look for anything picked", () => {
  for (const selector of SELECTED) {
    it(`${selector}: filled soft green, no green outline`, () => {
      const body = rule(selector);
      expect(body).toMatch(/background:\s*var\(--accent-positive-dim\)/);
      expect(body).not.toMatch(/border(-color)?:[^;]*var\(--accent-positive\)/);
    });
  }

  it("no component sets a selection's colour of its own inline", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return files(path);
        return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
      });
    const offenders = files(SRC).filter((path) => /borderColor:\s*"var\(--accent-positive\)"/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
