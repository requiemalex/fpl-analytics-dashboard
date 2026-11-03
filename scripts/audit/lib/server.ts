/**
 * The app an audit probe drives. By default the built app (what users get:
 * no React StrictMode double-runs, real bundle sizes and timings) on its own
 * port, so a copy the owner has open is never touched. `--dev` uses the dev
 * app instead (:5173), reusing one that's already running. Only an app this
 * script started is stopped afterwards.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

const BUILT_PORT = 4199;
const DEV_PORTS = [4000, 5173];
/** Where the probes point their browser; set by ensureApp(). */
export const app = { url: `http://localhost:${BUILT_PORT}` };

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "localhost" });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

export interface RunningApp { reused: boolean; label: string; stop: () => void }

function start(cmd: string, root: string, logDir: string, env: NodeJS.ProcessEnv = {}) {
  mkdirSync(logDir, { recursive: true });
  const out = openSync(join(logDir, "app.log"), "w");
  const child: ChildProcess = spawn(cmd, { cwd: root, shell: true, stdio: ["ignore", out, out], env: { ...process.env, ...env }, detached: process.platform !== "win32" });
  return () => {
    if (!child.pid) return;
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch { /* already gone */ }
  };
}

async function waitFor(ports: number[], stop: () => void, logDir: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if ((await Promise.all(ports.map(portOpen))).every(Boolean)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`The app didn't start within 2 minutes; see ${join(logDir, "app.log")}.`);
}

export async function ensureApp(root: string, logDir: string, opts: { dev: boolean; build: boolean }): Promise<RunningApp> {
  if (opts.dev) {
    app.url = "http://localhost:5173";
    const open = await Promise.all(DEV_PORTS.map(portOpen));
    if (open.every(Boolean)) return { reused: true, label: "dev app, already running (left running)", stop: () => {} };
    if (open.some(Boolean)) throw new Error(`Only one of ports ${DEV_PORTS.join("/")} is in use; stop whatever holds it, then retry.`);
    const stop = start("npm run dev", root, logDir);
    await waitFor(DEV_PORTS, stop, logDir);
    return { reused: false, label: "dev app, started and stopped", stop };
  }
  if (await portOpen(BUILT_PORT)) throw new Error(`Port ${BUILT_PORT} is in use (an earlier probe still running?); stop it, then retry.`);
  if (opts.build) {
    try { execSync("npm run build", { cwd: root, stdio: "pipe" }); }
    catch { throw new Error("npm run build failed; run `npm run check` to see why."); }
  }
  app.url = `http://localhost:${BUILT_PORT}`;
  const stop = start("node server/dist/index.js", root, logDir, { PORT: String(BUILT_PORT) });
  await waitFor([BUILT_PORT], stop, logDir);
  return { reused: false, label: `built app on :${BUILT_PORT}${opts.build ? ", freshly built" : ""}, started and stopped`, stop };
}
