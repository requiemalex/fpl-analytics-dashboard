/**
 * `npm run probe:selftest` — proves the probes can see what they look for,
 * so "No issues" from `npm run probe` means something. Plants each kind of
 * fault in the running app and checks the scan reports it.
 */
import { resolve } from "node:path";
import { ensureApp } from "./lib/server";
import { gotoApp, launch, openSession, scan } from "./lib/browser";
import { Report } from "./lib/report";

const ROOT = resolve(__dirname, "../..");

(async () => {
  const app = await ensureApp(ROOT, resolve(ROOT, "audit-output", "selftest"), { dev: false, build: !process.argv.includes("--no-build") });
  const browser = await launch();
  const results: string[] = [];
  try {
    const s = await openSession(browser, ROOT);
    await gotoApp(s.page, "/");
    await s.page.evaluate(() => {
      const box = document.createElement("div");
      box.innerHTML = `<span>xG NaN</span><span title="Infinity per game">hover me</span><span>-0.0</span>
        <button style="width:20px;overflow:hidden;white-space:nowrap">Confirmed transfers</button>
        <div style="width:4000px;height:2px"></div>`;
      document.querySelector("main, #root")!.appendChild(box);
      setTimeout(() => { throw new Error("planted uncaught error"); });
      console.error("planted console error");
    });
    await s.page.waitForTimeout(300);
    const report = new Report();
    report.fromPage("selftest", "/", await scan(s.page), s.capture);
    const kinds = report.issues.map((i) => `${i.kind}: ${i.detail}`);
    const expect: [string, RegExp][] = [
      ["NaN shown", /bad value shown: "xG NaN"/],
      ["Infinity in hover text", /hover text "Infinity/],
      ["negative zero", /bad value shown: "-0\.0"/],
      ["text cut off", /text cut off: "Confirmed transfers"/],
      ["sideways scroll", /page scrolls sideways/],
      ["uncaught error", /uncaught error: .*planted uncaught error/],
      ["console error", /console error: planted console error/],
    ];
    for (const [name, re] of expect) results.push(`${kinds.some((k) => re.test(k)) ? "ok  " : "MISS"} ${name}`);
    await s.page.evaluate(() => { document.querySelector("#root")!.innerHTML = "<div role='alert'><h3>Something went wrong on this page</h3></div>"; });
    results.push(`${(await scan(s.page)).crashed ? "ok  " : "MISS"} crash screen`);
    await s.close();
  } finally {
    await browser.close();
    app.stop();
  }
  console.log(results.join("\n"));
  process.exit(results.some((r) => r.startsWith("MISS")) ? 1 : 0);
})();
