import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_FAMILIES, FONT_PACKAGES, FONT_TOKENS, findFontViolations, type FontFileKind } from "./fontRule";

/**
 * <font_families>: the app uses only Archivo, IBM Plex Sans and JetBrains
 * Mono, bundled locally and named once in tokens.css (see fontRule.ts).
 * This scans every client source file, the client's index.html and the
 * Electron pages, and fails on any other font.
 */

const CLIENT = join(__dirname, "..", "..");
const ROOT = join(CLIENT, "..");
const SCANNED = /\.(ts|tsx|js|jsx|css|html)$/;
const SKIPPED = /\.test\.(ts|tsx)$|[\\/]fontRule\.ts$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return SCANNED.test(name) && !SKIPPED.test(path) ? [path] : [];
  });
}

function kindOf(path: string): FontFileKind {
  if (path.endsWith(join("styles", "tokens.css"))) return "tokens";
  if (path.startsWith(join(ROOT, "electron"))) return "standalone";
  return "app";
}

describe("<font_families>: only the three bundled typefaces", () => {
  it("no source file sets a font outside the three tokens", () => {
    const scanned = [...files(join(CLIENT, "src")), join(CLIENT, "index.html"), ...files(join(ROOT, "electron"))];
    const violations = scanned.flatMap((path) =>
      findFontViolations(readFileSync(path, "utf8"), kindOf(path)).map(
        (v) => `${relative(ROOT, path).replace(/\\/g, "/")}:${v.line} ${v.reason} — ${v.text}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("tokens.css defines all three tokens", () => {
    const tokens = readFileSync(join(CLIENT, "src", "styles", "tokens.css"), "utf8");
    for (const token of Object.keys(FONT_TOKENS)) expect(tokens).toMatch(new RegExp(`${token}\\s*:`));
  });

  it("main.tsx bundles all three packages, and the client depends on no other font package", () => {
    const main = readFileSync(join(CLIENT, "src", "main.tsx"), "utf8");
    for (const pkg of FONT_PACKAGES) expect(main).toContain(`import "${pkg}";`);
    const deps = Object.keys((JSON.parse(readFileSync(join(CLIENT, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies);
    expect(deps.filter((d) => d.startsWith("@fontsource"))).toEqual([...FONT_PACKAGES]);
  });

  it("the update window's copy of IBM Plex Sans matches the bundled package", () => {
    const file = "ibm-plex-sans-latin-wght-normal.woff2";
    const local = readFileSync(join(ROOT, "electron", "fonts", file));
    const bundled = readFileSync(join(ROOT, "node_modules", "@fontsource-variable", "ibm-plex-sans", "files", file));
    expect(local.equals(bundled)).toBe(true);
  });
});

describe("findFontViolations", () => {
  const flags = (source: string, kind: FontFileKind = "app") => findFontViolations(source, kind).length > 0;

  it("allows the tokens and inherit", () => {
    expect(flags(".a { font-family: var(--font-mono); }")).toBe(false);
    expect(flags("select { font-family: inherit; font: inherit; }")).toBe(false);
    expect(flags(`<td style={{ fontFamily: "var(--font-body)" }}>`)).toBe(false);
    expect(flags("ctx.font = `600 12px ${family}`;")).toBe(false);
    expect(flags("function estimateTextWidth(text: string, font: string): number {")).toBe(false);
  });

  it("flags a hard-coded family in CSS, a style object, a JSX prop or the font shorthand", () => {
    expect(flags(`.a { font-family: "Inter", var(--font-body); }`)).toBe(true);
    expect(flags(".a { font-family: Georgia, serif; }")).toBe(true);
    expect(flags(`<td style={{ fontFamily: "Roboto" }}>`)).toBe(true);
    expect(flags(`<text fontFamily="Arial">`)).toBe(true);
    expect(flags(".a { font: 600 12px Arial; }")).toBe(true);
    expect(flags(`ctx.font = "600 12px Arial";`)).toBe(true);
  });

  it("flags web-font links and other font packages", () => {
    expect(flags(`<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />`)).toBe(true);
    expect(flags(`import "@fontsource/inter";`)).toBe(true);
    expect(flags(`import "@fontsource-variable/inter";`)).toBe(true);
    expect(flags(`import "@fontsource-variable/jetbrains-mono";`)).toBe(false);
  });

  it("allows font tokens to be defined only in tokens.css, naming their own typeface first", () => {
    expect(flags(`--font-body: "IBM Plex Sans Variable", sans-serif;`, "tokens")).toBe(false);
    expect(flags(`--font-body: "IBM Plex Sans Variable", sans-serif;`, "app")).toBe(true);
    expect(flags(`--font-body: "Inter", sans-serif;`, "tokens")).toBe(true);
    expect(flags(`--font-serif: Georgia;`, "tokens")).toBe(true);
  });

  it("lets a standalone page name one of the three directly, and nothing else", () => {
    expect(flags(`font-family: "IBM Plex Sans Variable", "Segoe UI", sans-serif;`, "standalone")).toBe(false);
    expect(flags(`font-family: "Segoe UI", sans-serif;`, "standalone")).toBe(true);
    expect(FONT_FAMILIES).toHaveLength(3);
  });

  it("ignores fonts named in comments", () => {
    expect(flags(`/* was font-family: "Inter" */\n.a { font-family: var(--font-body); }`)).toBe(false);
  });
});
