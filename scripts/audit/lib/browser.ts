/**
 * A fresh browser for each probe (never the owner's profile or saved data),
 * with everything an auditor needs captured as compact text: uncaught
 * errors, console errors, failed and duplicate /api requests, and a scan of
 * what the page shows. Nothing here takes screenshots; a probe that needs
 * one asks for it explicitly.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "./server";

export const PAGES = ["/", "/players", "/teams", "/player-comparison", "/team-building"] as const;

export interface Capture {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  apiRequests: string[];
}

export interface Session { context: BrowserContext; page: Page; capture: Capture; close: () => Promise<void> }

/** Terms accepted up front, read from brand.ts so it never goes stale. */
function termsSeed(root: string): Record<string, string> {
  const brand = readFileSync(join(root, "client/src/brand.ts"), "utf8");
  const version = /TERMS_VERSION\s*=\s*"([^"]+)"/.exec(brand)?.[1];
  return version ? { "scoutline:terms-accepted:v1": JSON.stringify({ version: 1, data: version }) } : {};
}

export async function launch(): Promise<Browser> {
  return chromium.launch();
}

export async function openSession(
  browser: Browser,
  root: string,
  opts: { width?: number; height?: number; storage?: Record<string, string> } = {},
): Promise<Session> {
  const context = await browser.newContext({ viewport: { width: opts.width ?? 1366, height: opts.height ?? 800 } });
  // Seed saved data once, before the app first reads it; later reloads keep
  // whatever the app wrote back.
  const seed = { ...termsSeed(root), ...(opts.storage ?? {}) };
  // tsx names functions with a __name helper; code sent into the page needs it too.
  await context.addInitScript("globalThis.__name = (f) => f;");
  await context.addInitScript((s) => {
    if (sessionStorage.getItem("__probeSeeded")) return;
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    sessionStorage.setItem("__probeSeeded", "1");
  }, seed);
  context.on("page", (p) => { if (context.pages().length > 1) p.close().catch(() => {}); });
  const page = await context.newPage();
  const capture: Capture = { pageErrors: [], consoleErrors: [], failedRequests: [], apiRequests: [] };
  page.on("pageerror", (e) => capture.pageErrors.push(String(e.message ?? e).split("\n")[0].slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") capture.consoleErrors.push(m.text().split("\n")[0].slice(0, 300)); });
  page.on("dialog", (d) => d.accept().catch(() => {}));
  page.on("request", (r) => { if (r.url().includes("/api/")) capture.apiRequests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  page.on("requestfailed", (r) => { if (r.url().includes("/api/")) capture.failedRequests.push(`${new URL(r.url()).pathname} ${r.failure()?.errorText ?? ""}`); });
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) capture.failedRequests.push(`${new URL(r.url()).pathname} ${r.status()}`); });
  return { context, page, capture, close: () => context.close() };
}

/** Waits for the app's data to arrive (or fail), then for the network to settle, capped. */
export async function settle(page: Page, capMs = 20_000): Promise<number> {
  const t0 = Date.now();
  await page.waitForFunction(() => !document.body.innerText.includes("Loading live FPL data"), null, { timeout: capMs }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: Math.max(1000, capMs - (Date.now() - t0)) }).catch(() => {});
  return Date.now() - t0;
}

export async function gotoApp(page: Page, path = "/"): Promise<number> {
  await page.goto(app.url + path);
  return settle(page);
}

/** In-app navigation (the nav link, as a user would), so shared data isn't reloaded. */
export async function navigate(page: Page, path: string): Promise<number> {
  const link = page.locator(`a[href="${path}"]`).first();
  if (await link.count()) await link.click({ timeout: 3000 }).catch(() => {});
  else await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
  await page.waitForURL((u) => u.pathname === path, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  return (await settle(page)) + 300;
}

export interface Scan {
  crashed: string | null;
  blank: boolean;
  badText: string[];
  horizontalScroll: number | null;
  clipped: string[];
  nodes: number;
}

/** What the page shows that a user should never see. Runs inside the page. */
export async function scan(page: Page): Promise<Scan> {
  return page.evaluate(() => {
    const visible = (el: Element | null): boolean => {
      if (!el) return false;
      // Hidden-but-rendered (e.g. the closed Help panel) doesn't count.
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    };
    const describe = (el: Element): string => {
      const h = el as HTMLElement;
      const label = h.getAttribute("aria-label") || h.title || "";
      const cls = typeof h.className === "string" && h.className ? "." + h.className.split(/\s+/)[0] : "";
      return `${el.tagName.toLowerCase()}${cls}${label ? `[${label.slice(0, 40)}]` : ""}`;
    };
    const boundary = [...document.querySelectorAll("[role=alert] h3")].find((h) => /Something went wrong/.test(h.textContent ?? ""));
    const BAD = /\b(NaN|Infinity|undefined)\b|\[object Object\]|(^|\s)[-−]0(\.0+)?(?=$|\s|%)/;
    const badText = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && badText.size < 15; n = walker.nextNode()) {
      const t = n.textContent ?? "";
      if (BAD.test(t) && visible(n.parentElement)) badText.add(`"${t.trim().slice(0, 60)}" in ${describe(n.parentElement!)}`);
    }
    for (const el of document.querySelectorAll("[title]")) {
      if (badText.size >= 15) break;
      const t = el.getAttribute("title") ?? "";
      if (BAD.test(t) && visible(el)) badText.add(`hover text "${t.slice(0, 60)}" on ${describe(el)}`);
    }
    // Text cut off inside its box (owner's whole-words rule): labels and
    // headings whose content is wider than the box that hides the rest.
    const clipped = new Set<string>();
    for (const el of document.querySelectorAll("button, th, h1, h2, h3, h4, label, [role=tab], .tile-title, .card-title")) {
      if (clipped.size >= 10) break;
      const h = el as HTMLElement;
      if (!visible(h) || h.scrollWidth <= h.clientWidth + 1) continue;
      const ov = getComputedStyle(h).overflowX;
      if (ov === "hidden" || ov === "clip") clipped.add(`"${(h.innerText || "").trim().slice(0, 40)}" in ${describe(h)}`);
    }
    const sw = document.documentElement.scrollWidth;
    return {
      crashed: boundary ? (boundary.textContent ?? "crash") : null,
      blank: (document.body.innerText || "").trim().length < 40,
      badText: [...badText],
      horizontalScroll: sw > innerWidth + 1 ? sw : null,
      clipped: [...clipped],
      nodes: document.getElementsByTagName("*").length,
    };
  });
}

/** Repeated /api calls in one capture: the same path fetched more than once. */
export function duplicates(requests: string[]): string[] {
  const counts = new Map<string, number>();
  for (const r of requests) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([r, n]) => `${r} ×${n}`);
}
