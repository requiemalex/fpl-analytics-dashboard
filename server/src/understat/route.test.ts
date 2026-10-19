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

describe("GET /api/understat/profile", () => {
  const shot = (fixture: number, minute: number) => [fixture, minute, 0.9, 0.5, 0.2, "Goal", "OpenPlay", "Head"];
  beforeEach(() => {
    writeFileSync(join(dir, "status.json"), JSON.stringify({ liveSeason: "2026/27", seasons: ["2026/27"] }));
    mkdirSync(join(dir, "app", "profile"));
    writeFileSync(
      join(dir, "app", "profile", "2026-27.json"),
      JSON.stringify({
        schema: 1,
        season: "2026/27",
        players: { "1001": { matches: [[1, "FW", 90]], shots: [shot(1, 10)] } },
        clubs: {
          "11": { matches: [[1, 0.5, 0.3, 0.2]], shots: [shot(1, 10)], formations: [{ formation: "4-3-3", minutes: 90 }] },
          "22": { matches: [[1, 0.2, 0.3, 0.5]], shots: [shot(1, 50)], formations: null },
          "33": { matches: [[2, 0.1, 0.1, 0.8]], shots: [shot(2, 5)], formations: null },
        },
      }),
    );
  });

  it("serves one player's matches and shots", async () => {
    await start(dir);
    const body = await json(await fetch(`${base}/api/understat/profile/player/1001/2026-27`));
    expect(body.data).toMatchObject({ enabled: true, available: true, found: true, matches: [{ fixture: 1, position: "FW", minutes: 90 }] });
    expect(body.data.shots).toEqual([{ fixture: 1, minute: 10, x: 0.9, y: 0.5, xG: 0.2, result: "Goal", situation: "OpenPlay", shotType: "Head" }]);
  });

  it("serves a club's shots against from its opponents in its own matches only", async () => {
    await start(dir);
    const body = await json(await fetch(`${base}/api/understat/profile/club/11/2026-27`));
    expect(body.data.matches).toEqual([{ fixture: 1, win: 0.5, draw: 0.3, loss: 0.2 }]);
    expect(body.data.shotsAgainst.map((s: { minute: number }) => s.minute)).toEqual([50]);
    expect(body.data.formations).toEqual([{ formation: "4-3-3", minutes: 90 }]);
  });

  it("tells apart a code with no record and a season with no file", async () => {
    await start(dir);
    expect((await json(await fetch(`${base}/api/understat/profile/player/9999/2026-27`))).data).toEqual({ enabled: true, available: true, found: false });
    expect((await json(await fetch(`${base}/api/understat/profile/player/1001/2019-20`))).data).toEqual({ enabled: true, available: false });
  });

  it("rejects a malformed request", async () => {
    await start(dir);
    expect((await fetch(`${base}/api/understat/profile/team/11/2026-27`)).status).toBe(400);
    expect((await fetch(`${base}/api/understat/profile/player/11/2026`)).status).toBe(400);
  });
});
