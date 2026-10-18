import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createUnderstatRouter } from "./route.js";

let dir: string;
let close: () => void;
let base: string;

async function start(localDir: string) {
  const app = express();
  app.use("/api", createUnderstatRouter({ localDir }));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response): Promise<any> => res.json();
const seasonFile = (season: string) => ({ schema: 1, season, complete: true, matchesIncluded: 380, latestMatchDate: null, players: {}, clubs: {} });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "understat-route-"));
  mkdirSync(join(dir, "app"));
});
afterEach(() => {
  close?.();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/understat", () => {
  it("serves the status and the last five seasons' summaries", async () => {
    const seasons = ["2020/21", "2021/22", "2022/23", "2023/24", "2024/25", "2025/26"];
    writeFileSync(join(dir, "status.json"), JSON.stringify({ liveSeason: "2025/26", seasons }));
    for (const s of seasons) writeFileSync(join(dir, "app", `${s.replace("/", "-")}.json`), JSON.stringify(seasonFile(s)));
    await start(dir);
    const body = await json(await fetch(`${base}/api/understat`));
    expect(body.data.enabled).toBe(true);
    expect(Object.keys(body.data.seasons)).toEqual(seasons.slice(-5));
  });

  it("says so, and serves nothing else, when switched off", async () => {
    writeFileSync(join(dir, "control.json"), JSON.stringify({ enabled: false, note: "paused" }));
    await start(dir);
    const body = await json(await fetch(`${base}/api/understat`));
    expect(body.data).toEqual({ enabled: false, note: "paused" });
  });

  it("answers with an error, not a crash, when the data isn't there", async () => {
    await start(dir);
    const res = await fetch(`${base}/api/understat`);
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/Understat data unavailable/);
  });
});
