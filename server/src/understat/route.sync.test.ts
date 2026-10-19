import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";

// The remote path (GitHub), with fetchJson standing in for it: what each
// file holds right now, and every read made.
const remote = vi.hoisted(() => ({ files: new Map<string, unknown>(), reads: [] as string[] }));
vi.mock("../httpClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../httpClient.js")>()),
  fetchJson: async (url: string) => {
    const rel = url.split("/data/understat/")[1];
    remote.reads.push(rel);
    if (!remote.files.has(rel)) throw new Error(`no ${rel}`);
    return structuredClone(remote.files.get(rel));
  },
}));

const { createUnderstatRouter } = await import("./route.js");

let close: (() => void) | undefined;
afterEach(() => {
  close?.();
  vi.useRealTimers();
  remote.files.clear();
  remote.reads.length = 0;
});

async function start(): Promise<string> {
  const app = express();
  app.use("/api", createUnderstatRouter());
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const PROFILE = "app/profile/2026-27.json";
const profileFile = (minutes: number) => ({ schema: 1, season: "2026/27", players: { "1001": { matches: [[1, "FW", minutes]], shots: [] } }, clubs: {} });
const status = (generatedAt: string) => ({ generatedAt, liveSeason: "2026/27", seasons: ["2026/27"], latestMatchDate: null, missingFixtures: {} });
const at = (time: string) => vi.setSystemTime(new Date(`2026-10-19T${time}:00Z`));

describe("Understat live files follow the sync", () => {
  it("a live file cached under an older sync is read again once the newer sync's status arrives — once, not per request", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    remote.files.set("control.json", { enabled: true });
    remote.files.set("status.json", status("2026-10-18T06:10:00Z"));
    remote.files.set("app/2026-27.json", { schema: 1, season: "2026/27", complete: false, matchesIncluded: 70, latestMatchDate: null, players: {}, clubs: {} });
    remote.files.set(PROFILE, profileFile(70));
    const base = await start();
    const minutes = async () => {
      const body = (await (await fetch(`${base}/api/understat/profile/player/1001/2026-27`)).json()) as { data: { matches: { minutes: number }[] } };
      return body.data.matches[0].minutes;
    };
    const profileReads = () => remote.reads.filter((r) => r === PROFILE).length;

    at("05:00");
    await fetch(`${base}/api/understat`); // status cached at 05:00
    at("05:20");
    expect(await minutes()).toBe(70); // profile file cached at 05:20, until 05:50
    // The next sync lands on GitHub.
    remote.files.set("status.json", status("2026-10-19T06:10:00Z"));
    remote.files.set(PROFILE, profileFile(90));
    at("05:25");
    expect(await minutes()).toBe(70); // status still cached: nothing to say a sync happened
    at("05:31");
    // Status re-read (newer sync): the profile file, still within its 30 minutes, is read again.
    expect(await minutes()).toBe(90);
    expect(profileReads()).toBe(2);
    at("05:35");
    expect(await minutes()).toBe(90);
    expect(profileReads()).toBe(2);
  });
});
