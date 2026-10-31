import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

// The remote path (GitHub), with fetchJson standing in for it: what each
// file holds, every read made, and how many are in flight at once.
const remote = vi.hoisted(() => ({ files: new Map<string, unknown>(), reads: [] as string[], inFlight: 0, maxInFlight: 0, offline: false }));
vi.mock("../httpClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../httpClient.js")>()),
  fetchJson: async (url: string) => {
    const rel = url.split("/data/understat/")[1];
    remote.reads.push(rel);
    if (remote.offline) throw new Error("offline");
    remote.inFlight += 1;
    remote.maxInFlight = Math.max(remote.maxInFlight, remote.inFlight);
    await new Promise((r) => setTimeout(r, 20));
    remote.inFlight -= 1;
    if (!remote.files.has(rel)) throw new Error(`no ${rel}`);
    return structuredClone(remote.files.get(rel));
  },
}));

const { useDiskCopies } = await import("../diskCopies.js");

let close: (() => void) | undefined;
let dir: string;

/** One launch of the app: the route module (and its memory cache) loaded afresh, the same folder on disk. */
async function launch(): Promise<string> {
  close?.();
  vi.resetModules();
  const { useDiskCopies: use } = await import("../diskCopies.js");
  use(dir);
  const { createUnderstatRouter } = await import("./route.js");
  const app = express();
  app.use("/api", createUnderstatRouter());
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const SEASONS = ["2022/23", "2023/24", "2024/25", "2025/26", "2026/27"];
const status = (generatedAt: string) => ({ generatedAt, liveSeason: "2026/27", seasons: SEASONS, latestMatchDate: null, missingFixtures: {} });
const seasonFile = (season: string, matches: number) => ({ schema: 1, season, complete: season !== "2026/27", matchesIncluded: matches, latestMatchDate: null, players: {}, clubs: {} });
const at = (time: string) => vi.setSystemTime(new Date(`2026-10-23T${time}:00Z`));
const matchesIncluded = async (base: string) =>
  ((await (await fetch(`${base}/api/understat`)).json()) as { data: { seasons: Record<string, { matchesIncluded: number }> } }).data.seasons["2026/27"].matchesIncluded;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "understat-copies-"));
  remote.files.set("control.json", { enabled: true });
  remote.files.set("status.json", status("2026-10-23T06:10:00Z"));
  for (const s of SEASONS) remote.files.set(`app/${s.replace("/", "-")}.json`, seasonFile(s, 70));
});
afterEach(() => {
  close?.();
  close = undefined;
  vi.useRealTimers();
  useDiskCopies(undefined);
  remote.files.clear();
  remote.reads.length = 0;
  remote.maxInFlight = 0;
  remote.offline = false;
});

describe("Understat at launch (<disk_copies>, Efficiency C)", () => {
  it("fetches the season files side by side, not one after another", async () => {
    const base = await launch();
    expect(await matchesIncluded(base)).toBe(70);
    expect(remote.maxInFlight).toBeGreaterThanOrEqual(SEASONS.length);
  });

  it("a relaunch within the files' times downloads none of them, and one without internet still has them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("09:00");
    await matchesIncluded(await launch());
    const firstReads = remote.reads.length;

    at("09:20");
    expect(await matchesIncluded(await launch())).toBe(70);
    expect(remote.reads.length).toBe(firstReads);

    // A day later, offline: every file is past its time, so each is tried live and the copies stand in, flagged stale.
    vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
    remote.offline = true;
    const body = (await (await fetch(`${await launch()}/api/understat`)).json()) as { meta: { source: string }; data: { enabled: boolean } };
    expect(body.data.enabled).toBe(true);
    expect(body.meta.source).toBe("stale-cache");
  });

  it("a live file restored from disk is read again if it was fetched before the newest sync, and only then", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const liveReads = () => remote.reads.filter((r) => r === "app/2026-27.json").length;
    remote.files.set("status.json", status("2026-10-23T04:00:00Z"));
    at("05:00");
    await matchesIncluded(await launch()); // every copy fetched at 05:00, good until 05:30

    // A sync at 04:50 is older than the copy: within its time, the copy stands.
    remote.files.set("status.json", status("2026-10-23T04:50:00Z"));
    rmSync(join(dir, "understat", "status.json")); // status read afresh, as if its own time had run out
    at("05:10");
    const before = liveReads();
    expect(await matchesIncluded(await launch())).toBe(70);
    expect(liveReads()).toBe(before);

    // A sync at 05:05 landed after the copy was fetched: read again, once.
    remote.files.set("status.json", status("2026-10-23T05:05:00Z"));
    remote.files.set("app/2026-27.json", seasonFile("2026/27", 80));
    rmSync(join(dir, "understat", "status.json"));
    at("05:12");
    const base = await launch();
    expect(await matchesIncluded(base)).toBe(80);
    const after = liveReads();
    expect(after).toBe(before + 1);
    at("05:14");
    expect(await matchesIncluded(base)).toBe(80);
    expect(liveReads()).toBe(after);
  });
});

describe("a saved copy under an old fingerprint (<file_versions>)", () => {
  it("a relaunch reads a completed season again when the sync has rewritten it, and only that one", async () => {
    const { fileVersion } = await import("./fileVersion.js");
    vi.useFakeTimers({ toFake: ["Date"] });
    const rel = (s: string) => `app/${s.replace("/", "-")}.json`;
    const versions = () => Object.fromEntries(SEASONS.map((s) => [rel(s), fileVersion(remote.files.get(rel(s)))]));
    remote.files.set("status.json", { ...status("2026-10-23T06:10:00Z"), fileVersions: versions() });
    at("09:00");
    await matchesIncluded(await launch());
    // The sync rewrites 2025/26 (new figures) and nothing else.
    remote.files.set(rel("2025/26"), seasonFile("2025/26", 71));
    remote.files.set("status.json", { ...status("2026-10-23T09:10:00Z"), fileVersions: versions() });
    remote.reads.length = 0;
    // Status (30 minutes) has run out, so the sync is seen; the completed seasons' copies have 12 hours left.
    at("09:35");
    const body = (await (await fetch(`${await launch()}/api/understat`)).json()) as { data: { seasons: Record<string, { matchesIncluded: number }> } };
    expect(body.data.seasons["2025/26"].matchesIncluded).toBe(71);
    // The live season by its own 30 minutes; of the completed ones, only the one the sync rewrote.
    expect(remote.reads.filter((r) => r.startsWith("app/")).sort()).toEqual([rel("2025/26"), rel("2026/27")]);
  });
});
