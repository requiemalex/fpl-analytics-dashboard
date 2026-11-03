/**
 * `npm run probe -- [pages] [failures] [storage] [monkey] [--seed=N]
 *   [--actions=N] [--pages=players,team-building] [--quick] [--dev] [--no-build]`
 *
 * Puts the running app under pressure in a fresh browser and prints only
 * what went wrong, one line per distinct problem (docs/audits/strategy/
 * TOOLKIT.md). No probe given runs all four. Builds the app and runs it on
 * its own port (lib/server.ts), stopping it afterwards; never touches the
 * owner's running app or saved data.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Route } from "playwright";
import { ensureApp } from "./lib/server";
import { duplicates, gotoApp, launch, navigate, openSession, PAGES, scan } from "./lib/browser";
import { monkey } from "./lib/monkey";
import { Report } from "./lib/report";

const ROOT = resolve(__dirname, "../..");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const quick = args.includes("--quick");
const SEED = Number(flag("seed") ?? 1);
const ACTIONS = Number(flag("actions") ?? (quick ? 15 : 40));
// Pages by name (players, team-building, dashboard): Git Bash rewrites a
// leading "/" into a Windows path, so only the last part is used.
const ONLY_PAGES = flag("pages")?.split(",").map((p) => {
  const name = p.replace(/\\/g, "/").split("/").pop() ?? "";
  return name === "" || name === "dashboard" ? "/" : `/${name}`;
}) ?? [...PAGES];
/** Each page gets its own steps from one --seed, the same whichever pages are chosen. */
const pageSeed = (path: string) => SEED * 1000 + [...path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
const ALL = ["pages", "failures", "storage", "monkey"] as const;
const chosen = args.filter((a) => !a.startsWith("--"));
const probes = chosen.length ? chosen : [...ALL];
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const OUT = join(ROOT, "audit-output", stamp);

// ── pages: every page at laptop and wide widths ─────────────────────────────
async function probePages(browser: Browser, report: Report) {
  for (const width of [1366, 1920]) {
    const s = await openSession(browser, ROOT, { width });
    const ms = await gotoApp(s.page, "/");
    report.measure({ width, page: "/ (first load)", ms, api: s.capture.apiRequests.length });
    report.fromPage("pages", `/ @${width}`, await scan(s.page), s.capture);
    report.issues.push(...duplicates(s.capture.apiRequests).map((d) => ({ probe: "pages", kind: "duplicate requests", where: `first load @${width}`, detail: d })));
    for (const path of ONLY_PAGES.filter((p) => p !== "/")) {
      const before = { api: s.capture.apiRequests.length, page: s.capture.pageErrors.length, console: s.capture.consoleErrors.length };
      const ms = await navigate(s.page, path);
      const api = s.capture.apiRequests.slice(before.api);
      const sc = await scan(s.page);
      report.measure({ width, page: path, ms, api: api.length, nodes: sc.nodes });
      const where = `${path} @${width}`;
      report.fromPage("pages", where, sc, { ...s.capture, pageErrors: s.capture.pageErrors.slice(before.page), consoleErrors: s.capture.consoleErrors.slice(before.console) });
      const refetched = api.filter((r) => /\/api\/(bootstrap-static|fixtures)$/.test(r));
      if (refetched.length) report.add({ probe: "pages", kind: "re-fetched shared data", where, detail: refetched.join(", ") });
      for (const d of duplicates(api)) report.add({ probe: "pages", kind: "duplicate requests", where, detail: d });
      if (ms > 10_000) report.add({ probe: "pages", kind: "slow", where, detail: `${(ms / 1000).toFixed(1)}s to settle` });
    }
    await s.close();
  }
  const m = report.measurements.filter((x) => x.width === 1366).map((x) => `${x.page} ${(Number(x.ms) / 1000).toFixed(1)}s/${x.api} calls`);
  report.note(`load times @1366 (time to settle / API calls): ${m.join(" · ")}`);
}

// ── failures: the API fails, returns rubbish, or is slow ────────────────────
// The app logging a failure the probe caused is expected, so console errors
// aren't reported here: what counts is a crash, silence, or no recovery.
type Mode = "500" | "abort" | "rubbish" | "wrong shape" | "slow";
function failWith(mode: Mode, hits: { n: number }) {
  return async (route: Route) => {
    hits.n++;
    if (mode === "500") return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"probe"}' });
    if (mode === "abort") return route.abort("failed");
    if (mode === "rubbish") return route.fulfill({ status: 200, contentType: "text/html", body: "<html>not json" });
    if (mode === "wrong shape") return route.fulfill({ status: 200, contentType: "application/json", body: '{"data":{"unexpected":[1,"x",null]},"meta":{}}' });
    await new Promise((r) => setTimeout(r, 8000));
    return route.continue().catch(() => {});
  };
}

async function probeFailures(browser: Browser, report: Report) {
  // Shared data: the app must say it couldn't load, offer Try again, and recover.
  for (const family of ["bootstrap-static", "fixtures"]) {
    for (const mode of ["500", "abort", "rubbish", "wrong shape", "slow"] as Mode[]) {
      if (quick && mode !== "500" && mode !== "wrong shape") continue;
      const s = await openSession(browser, ROOT);
      const hits = { n: 0 };
      const pattern = `**/api/${family}`;
      await s.page.route(pattern, failWith(mode, hits));
      await gotoApp(s.page, "/");
      const where = `${family} ${mode}`;
      const sc = await scan(s.page);
      report.fromPage("failures", where, { ...sc, blank: false }, { ...s.capture, consoleErrors: [] });
      const text = await s.page.evaluate(() => document.body.innerText);
      const said = text.split("\n").find((l) => /couldn't|could not|failed|unavailable|error|try again/i.test(l));
      if (mode !== "slow" && !said) {
        report.add({ probe: "failures", kind: "no error shown", where, detail: `${family} failed (${mode}) and the page doesn't say so` });
      }
      if (said) report.note(`${where} → page says "${said.trim().slice(0, 90)}"`);
      await s.page.unroute(pattern);
      const retry = s.page.getByRole("button", { name: /try again|retry/i }).first();
      if (await retry.count()) {
        await retry.click().catch(() => {});
        await gotoApp(s.page, "/").catch(() => {});
      } else if (mode !== "slow") {
        await s.page.reload();
      }
      const after = await s.page.evaluate(() => document.body.innerText);
      if (/Couldn't load live FPL data|Something went wrong/.test(after)) {
        report.add({ probe: "failures", kind: "did not recover", where, detail: "still an error after the API came back and Try again/reload" });
      }
      await s.close();
    }
  }
  // Everything fetched on demand fails at once; the pages and a short burst
  // of use must keep working, with each failure shown, not a crash.
  const lazy = ["element-summary", "historic-bulk", "player-seasons", "understat", "entry", "event"];
  for (const mode of (quick ? ["500"] : ["500", "rubbish", "abort"]) as Mode[]) {
    const s = await openSession(browser, ROOT);
    const hits = Object.fromEntries(lazy.map((f) => [f, { n: 0 }]));
    for (const f of lazy) await s.page.route(`**/api/${f}/**`, failWith(mode, hits[f]));
    await s.page.route("**/api/historic-bulk", failWith(mode, hits["historic-bulk"]));
    await gotoApp(s.page, "/");
    const label = `on-demand data ${mode}`;
    for (const path of ONLY_PAGES) {
      await navigate(s.page, path);
      await monkey(s, report, "failures", { seed: pageSeed(path), actions: quick ? 5 : 10, pages: [path], label });
    }
    report.issues = report.issues.filter((i) => i.kind !== "console error");
    const untouched = lazy.filter((f) => hits[f].n === 0);
    report.note(`on-demand failures (${mode}): exercised ${lazy.filter((f) => hits[f].n).join(", ") || "none"}${untouched.length ? `; not reached by the probe: ${untouched.join(", ")}` : ""}`);
    await s.close();
  }
}

// ── storage: damaged, old-shaped or future saved data ───────────────────────
function storageKeys(): string[] {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
        for (const m of readFileSync(p, "utf8").matchAll(/"((?:fpl-dashboard|scoutline):[a-z0-9:_-]+)"/gi)) keys.add(m[1]);
      }
    }
  };
  walk(join(ROOT, "client/src"));
  keys.delete("scoutline:terms-accepted:v1");
  return [...keys].sort();
}

const DAMAGE: Record<string, string> = {
  "not JSON": "{{{not json",
  "null": "null",
  "text instead of data": JSON.stringify({ version: 1, data: "oops" }),
  "number instead of data": JSON.stringify({ version: 1, data: 42 }),
  "junk items": JSON.stringify({ version: 1, data: [{}, null, "x", 42, { id: -1, name: "" }, { id: "abc", players: "x" }] }),
  "from a newer version": JSON.stringify({ version: 999, data: { futureField: true, views: [{ id: "z" }] } }),
  "unversioned list": JSON.stringify([{ id: 1, name: "old" }]),
};

async function storageRun(browser: Browser, storage: Record<string, string>, label: string, report: Report) {
  const s = await openSession(browser, ROOT, { storage });
  await gotoApp(s.page, "/");
  report.fromPage("storage", `${label} /`, await scan(s.page), s.capture);
  for (const path of ONLY_PAGES.filter((p) => p !== "/")) {
    const before = { page: s.capture.pageErrors.length, console: s.capture.consoleErrors.length };
    await navigate(s.page, path);
    report.fromPage("storage", `${label} ${path}`, await scan(s.page), { ...s.capture, pageErrors: s.capture.pageErrors.slice(before.page), consoleErrors: s.capture.consoleErrors.slice(before.console) });
  }
  await s.close();
}

async function probeStorage(browser: Browser, report: Report) {
  const keys = storageKeys();
  report.note(`saved-data keys damaged: ${keys.length} (${keys.map((k) => k.split(":").slice(1, -1).join(":")).join(", ")})`);
  for (const [name, value] of Object.entries(DAMAGE)) {
    const all = await (async () => { const r = new Report(); await storageRun(browser, Object.fromEntries(keys.map((k) => [k, value])), `every store "${name}"`, r); return r; })();
    if (!all.issues.length) continue;
    // Something broke: find which store(s) by damaging one at a time.
    for (const key of keys) await storageRun(browser, { [key]: value }, `${key} "${name}"`, report);
  }
}

// ── monkey: an impatient user on every page ─────────────────────────────────
async function probeMonkey(browser: Browser, report: Report) {
  for (const path of ONLY_PAGES) {
    const s = await openSession(browser, ROOT);
    await gotoApp(s.page, path);
    await monkey(s, report, "monkey", { seed: pageSeed(path), actions: ACTIONS, label: `start ${path}` });
    await s.close();
  }
  report.note(`monkey: ${ACTIONS} steps from each of ${ONLY_PAGES.length} pages, seed ${SEED} (same seed = same steps)`);
}

const RUN: Record<string, (b: Browser, r: Report) => Promise<void>> = { pages: probePages, failures: probeFailures, storage: probeStorage, monkey: probeMonkey };

(async () => {
  const unknown = probes.filter((p) => !RUN[p]);
  if (unknown.length) { console.error(`Unknown probe(s): ${unknown.join(", ")}. Choose from: ${ALL.join(", ")}.`); process.exit(2); }
  const t0 = Date.now();
  const app = await ensureApp(ROOT, OUT, { dev: args.includes("--dev"), build: !args.includes("--no-build") });
  const browser = await launch();
  let total = 0;
  try {
    for (const name of probes) {
      const t = Date.now();
      const report = new Report();
      console.log(`\n${name}`);
      try { await RUN[name](browser, report); }
      catch (e) { report.add({ probe: name, kind: "probe failed", where: "-", detail: String((e as Error).message ?? e).split("\n")[0] }); }
      total += report.print(name, OUT, { seed: SEED, actions: ACTIONS, pages: ONLY_PAGES });
      console.log(`  (${Math.round((Date.now() - t) / 1000)}s)`);
    }
  } finally {
    await browser.close();
    app.stop();
  }
  console.log(`\nProbes ${probes.join(", ")}: ${total} distinct issue(s) in ${Math.round((Date.now() - t0) / 1000)}s · ${app.label} · ${OUT}`);
})();
