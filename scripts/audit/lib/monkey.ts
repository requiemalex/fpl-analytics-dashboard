/**
 * A seeded "impatient user": clicks whatever is clickable, types awkward
 * values key by key, presses Escape, resizes the window and moves between
 * pages, checking after each step for crashes and bad values. The same seed
 * replays the same steps, so every problem comes with its repro.
 */
import type { Locator, Page } from "playwright";
import { navigate, PAGES, scan, type Session } from "./browser";
import type { Report } from "./report";

/** Values a user might type, including the awkward ones. */
const TYPED = ["0", "-5", "1.5", "99999999", "1e9", "abc", "   ", "Ødegaard", "Son Heung-min", "😀", "x".repeat(80), "<b>x</b>", "12abc", "."];
const WIDTHS = [1100, 1366, 1920];
/** Left alone: calls the live FPL API without its cache, or leaves the app. */
const SKIP_LABEL = /refresh|quit|exit|close app|decline|download|export|github|privacy policy/i;

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; };
}

interface Target { id: number; kind: "click" | "type" | "select"; label: string }

async function targets(page: Page): Promise<Target[]> {
  return page.evaluate((skip) => {
    const skipRe = new RegExp(skip, "i");
    const out: { id: number; kind: "click" | "type" | "select"; label: string }[] = [];
    const els = document.querySelectorAll<HTMLElement>(
      "button, [role=button], [role=tab], [role=switch], [role=checkbox], [role=menuitem], [role=option], [role=radio], summary, th, input, select, textarea",
    );
    for (const old of document.querySelectorAll("[data-probe]")) old.removeAttribute("data-probe");
    // An open dialog takes the clicks; behind it, nothing is reachable.
    const modals = [...document.querySelectorAll<HTMLElement>("[aria-modal=true], dialog[open]")].filter((m) => m.checkVisibility());
    const scope = modals[modals.length - 1];
    let id = 0;
    for (const el of els) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || (el as HTMLButtonElement).disabled) continue;
      if (el.closest("[aria-disabled=true], fieldset:disabled")) continue;
      if (scope && !scope.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // On screen, it must be the thing on top where a user would click.
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && !el.contains(top) && !top.contains(el)) continue;
      }
      const label = (el.getAttribute("aria-label") || el.title || el.innerText || (el as HTMLInputElement).placeholder || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
      if (skipRe.test(label)) continue;
      const type = (el as HTMLInputElement).type;
      let kind: "click" | "type" | "select" = "click";
      if (el.tagName === "SELECT") kind = "select";
      else if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|number|email|url|tel|)$/.test(type))) kind = "type";
      el.setAttribute("data-probe", String(id));
      out.push({ id: id++, kind, label: `${el.tagName.toLowerCase()} "${label}"` });
    }
    return out;
  }, SKIP_LABEL.source);
}

/** Scrolled into view, is it what a click there would land on? */
async function reachable(el: Locator): Promise<boolean> {
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 1000 });
    return await el.evaluate((n) => {
      const r = n.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (n.contains(top) || top.contains(n));
    });
  } catch {
    return false;
  }
}

export interface MonkeyOptions { seed: number; actions: number; pages?: readonly string[]; label: string }

/** Runs the steps; returns the problems found, each with the steps that led to it. */
export async function monkey(session: Session, report: Report, probe: string, opts: MonkeyOptions) {
  const { page, capture } = session;
  const rand = rng(opts.seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const trail: string[] = [];
  const seenErrors = { page: capture.pageErrors.length, console: capture.consoleErrors.length };
  const reported = new Set<string>();
  const pages = opts.pages ?? PAGES;
  let current = page.url();

  for (let step = 1; step <= opts.actions; step++) {
    const roll = rand();
    let action = "";
    try {
      if (roll < 0.06) {
        const to = pick(pages);
        action = `go to ${to}`;
        await navigate(page, to);
      } else if (roll < 0.1) {
        const w = pick(WIDTHS);
        action = `resize to ${w}px`;
        await page.setViewportSize({ width: w, height: 800 });
      } else if (roll < 0.16) {
        action = "press Escape";
        await page.keyboard.press("Escape");
      } else {
        const all = await targets(page);
        if (!all.length) { action = "nothing to click"; continue; }
        // Off-screen targets are only checked once scrolled into view: a
        // panel or overlay may cover them there. Try a few before giving up.
        let t = pick(all);
        let el = page.locator(`[data-probe="${t.id}"]`);
        for (let tries = 0; tries < 5 && !(await reachable(el)); tries++) {
          t = pick(all);
          el = page.locator(`[data-probe="${t.id}"]`);
        }
        if (t.kind === "type") {
          const value = pick(TYPED);
          action = `type "${value.length > 20 ? value.slice(0, 8) + "…×" + value.length : value}" into ${t.label}`;
          await el.click({ timeout: 1500 });
          await el.fill("").catch(() => {});
          await el.pressSequentially(value, { delay: 5, timeout: 4000 });
          if (rand() < 0.5) await page.keyboard.press(rand() < 0.5 ? "Enter" : "Tab");
        } else if (t.kind === "select") {
          const options = await el.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
          const value = options.length ? pick(options) : "";
          action = `choose "${value}" in ${t.label}`;
          await el.selectOption(value, { timeout: 1500 });
        } else {
          action = `click ${t.label}`;
          await el.click({ timeout: 1500 });
        }
      }
    } catch (e) {
      // Playwright's call log says why, e.g. "<div> intercepts pointer events";
      // its retry lines ("waiting 500ms") don't.
      const log = String((e as Error).message ?? e).replace(/\x1b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ") && !/^- (waiting|retrying)/.test(l));
      action += ` (couldn't: ${log.length ? log[log.length - 1].slice(2, 90) : "timed out"})`;
    }
    trail.push(`${step}. ${action} [${new URL(page.url()).pathname}]`);
    await page.waitForTimeout(120);
    if (page.url() !== current) { current = page.url(); await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {}); }

    const newErrors = capture.pageErrors.length > seenErrors.page || capture.consoleErrors.length > seenErrors.console;
    if (newErrors || step % 5 === 0 || step === opts.actions) {
      const s = await scan(page);
      const fresh = {
        pageErrors: capture.pageErrors.slice(seenErrors.page),
        consoleErrors: capture.consoleErrors.slice(seenErrors.console),
        failedRequests: [], apiRequests: [],
      };
      seenErrors.page = capture.pageErrors.length;
      seenErrors.console = capture.consoleErrors.length;
      // Report each distinct problem once, with the last steps before it.
      const before = report.issues.length;
      report.fromPage(probe, `${opts.label} ${new URL(page.url()).pathname}`, s, fresh, [`seed ${opts.seed}`, ...trail.slice(-8)]);
      report.issues.splice(before, report.issues.length - before, ...report.issues.slice(before).filter((i) => {
        const k = `${i.kind}|${i.detail}`;
        if (reported.has(k)) return false;
        reported.add(k);
        return true;
      }));
      if (s.crashed || s.blank) {
        // A crashed page has nothing left to click; start it again.
        await page.goto(new URL(page.url()).origin + pick(pages)).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      }
    }
  }
  const blocked = trail.filter((t) => t.includes("(couldn't")).length;
  report.measure({ probe, label: opts.label, seed: opts.seed, blocked, steps: trail });
  return trail;
}
