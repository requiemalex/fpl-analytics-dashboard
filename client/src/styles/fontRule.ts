/**
 * <font_families> (owner's rule, 2026-10-21): the app uses exactly three
 * typefaces — Archivo for headings, IBM Plex Sans for body text, JetBrains
 * Mono for figures — each bundled from its @fontsource-variable package
 * (imported once, in main.tsx), never loaded from the network. tokens.css
 * names them once, as --font-display, --font-body and --font-mono; every
 * other font setting in the app is one of those tokens or `inherit`.
 * fontRule.test.ts runs findFontViolations over every source file, so a
 * fourth font, a hard-coded family or a web-font link fails the tests.
 * Only the tests use it.
 */

/** Token → the bundled typeface it names first. */
export const FONT_TOKENS = {
  "--font-display": "Archivo Variable",
  "--font-body": "IBM Plex Sans Variable",
  "--font-mono": "JetBrains Mono Variable",
} as const;

export const FONT_FAMILIES: readonly string[] = Object.values(FONT_TOKENS);

/** The @fontsource-variable packages behind FONT_FAMILIES, in the same order. */
export const FONT_PACKAGES = ["@fontsource-variable/archivo", "@fontsource-variable/ibm-plex-sans", "@fontsource-variable/jetbrains-mono"] as const;

/**
 * Where a file sits:
 * - "app": inside the client bundle — font settings must use a token;
 * - "tokens": tokens.css, the one file that defines the tokens;
 * - "standalone": a page outside the bundle that can't see the tokens (the
 *   Electron update window) — each family list must start with one of the
 *   three typefaces, from a local file.
 */
export type FontFileKind = "app" | "tokens" | "standalone";

export interface FontViolation {
  line: number;
  text: string;
  reason: string;
}

const TOKEN_VALUE = /^var\(\s*--font-(display|body|mono)\s*\)$/;
const ALLOWED_PACKAGE = new RegExp(`^(${FONT_PACKAGES.join("|")})(/|$)`);

/** The first family named in a CSS font-family list, unquoted. */
function firstFamily(list: string): string {
  return list.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

/** Strips a JS/JSX value's quotes and braces: `"var(--font-mono)"` → `var(--font-mono)`. */
function unquote(value: string): string {
  return value.trim().replace(/^\{|\}$/g, "").trim().replace(/^["'`]|["'`]$/g, "").trim();
}

/** Blanks out block comments, keeping line numbers, so a comment can mention fonts freely. */
function withoutBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
}

export function findFontViolations(source: string, kind: FontFileKind): FontViolation[] {
  const violations: FontViolation[] = [];
  const lines = withoutBlockComments(source).split("\n");
  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (text.startsWith("//")) return;
    const flag = (reason: string) => violations.push({ line: i + 1, text, reason });

    if (/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/.test(text)) flag("loads a web font from the network");

    for (const m of text.matchAll(/@fontsource[\w-]*\/[\w-]+[^"'`\s]*/g)) {
      if (!ALLOWED_PACKAGE.test(m[0])) flag(`imports a font package outside the three: ${m[0]}`);
    }

    // Token definitions: only tokens.css, only the three, each naming its own typeface first.
    for (const m of text.matchAll(/(--font-[\w-]+)\s*:\s*([^;]+)/g)) {
      const expected = FONT_TOKENS[m[1] as keyof typeof FONT_TOKENS];
      if (kind !== "tokens") flag(`defines ${m[1]} outside tokens.css`);
      else if (!expected) flag(`defines a font token outside the three: ${m[1]}`);
      else if (firstFamily(m[2]) !== expected) flag(`${m[1]} must name "${expected}" first`);
    }

    // CSS (and SVG/HTML attribute) font-family.
    for (const m of text.matchAll(/font-family\s*[:=]\s*([^;}>]+)/g)) {
      const value = unquote(m[1].replace(/\s*\/?$/, ""));
      if (kind === "standalone") {
        if (!FONT_FAMILIES.includes(firstFamily(value))) flag(`font-family must start with one of ${FONT_FAMILIES.join(", ")}`);
      } else if (!TOKEN_VALUE.test(value) && value !== "inherit") flag("font-family must be var(--font-display|body|mono) or inherit");
    }

    // React style objects and JSX props.
    for (const m of text.matchAll(/fontFamily\s*[:=]\s*(\{[^}]*\}|"[^"]*"|'[^']*'|`[^`]*`|[^,}\s]+)/g)) {
      const value = unquote(m[1]);
      if (!TOKEN_VALUE.test(value) && value !== "inherit") flag("fontFamily must be var(--font-display|body|mono) or inherit");
    }

    // The `font` shorthand sets a family too: a CSS declaration (ends in ; or })
    // or a quoted style-object value — not a TypeScript `font: string` annotation.
    for (const m of text.matchAll(/(?:^|[\s;{,])font\s*:\s*("[^"]*"|'[^']*'|`[^`]*`|[^;}'"`(),]+[;}])/g)) {
      const value = unquote(m[1].replace(/[;}]$/, ""));
      if (value !== "inherit" && !/var\(\s*--font-(display|body|mono)\s*\)/.test(value)) flag("the font shorthand must be inherit or use a font token");
    }

    // A canvas font set from a literal string names its family by hand; build it from a token instead.
    if (/\.font\s*=\s*["'`]/.test(text) && !/\.font\s*=\s*`[^`]*\$\{/.test(text)) flag("canvas font set from a literal; build it from a --font-* token");
  });
  return violations;
}
