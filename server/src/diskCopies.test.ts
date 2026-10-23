import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const fetchJsonMock = vi.fn();
vi.mock("./httpClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./httpClient.js")>();
  return { ...actual, fetchJson: fetchJsonMock };
});

const { cachedFetch } = await import("./proxy.js");
const { TtlCache } = await import("./cache.js");
const { UpstreamError } = await import("./httpClient.js");
const { useDiskCopies, MAX_COPY_AGE_MS } = await import("./diskCopies.js");

const TTL = 10 * 60 * 1000;
const NAME = "fpl/bootstrap-static.json";
let dir: string;

/** One launch of the app: a fresh memory cache, the same folder on disk. */
function launch() {
  useDiskCopies(dir);
  const cache = new TtlCache<unknown>();
  return () => cachedFetch({ cache, cacheKey: "bootstrap-static", ttlMs: TTL, url: "http://fpl", persistAs: NAME });
}

beforeEach(() => {
  fetchJsonMock.mockReset();
  dir = mkdtempSync(join(tmpdir(), "disk-copies-"));
});
afterEach(() => {
  vi.useRealTimers();
  useDiskCopies(undefined);
});

describe("<disk_copies>", () => {
  it("a launch with FPL unreachable opens on the last good copy, flagged stale with when it was really fetched", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T09:00:00Z"));
    fetchJsonMock.mockResolvedValueOnce({ elements: [1, 2, 3] });
    expect(await launch()()).toMatchObject({ ok: true, source: "live" });

    vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
    fetchJsonMock.mockRejectedValue(new UpstreamError("FPL API responded 503", 503));
    const result = await launch()();
    expect(result).toMatchObject({ ok: true, source: "stale-cache", data: { elements: [1, 2, 3] } });
    expect(result.ok && new Date(result.fetchedAt).toISOString()).toBe("2026-10-23T09:00:00.000Z");
    expect(fetchJsonMock).toHaveBeenCalledTimes(2); // live was still tried first
  });

  it("a launch soon after the last needs no download: the copy is still within its TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T09:00:00Z"));
    fetchJsonMock.mockResolvedValueOnce({ elements: [1] });
    await launch()();

    vi.setSystemTime(new Date("2026-10-23T09:04:00Z"));
    expect(await launch()()).toMatchObject({ ok: true, source: "cache", data: { elements: [1] } });
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);

    // Past its TTL it's fetched live again, and the new copy replaces it.
    vi.setSystemTime(new Date("2026-10-23T09:11:00Z"));
    fetchJsonMock.mockResolvedValueOnce({ elements: [1, 2] });
    expect(await launch()()).toMatchObject({ ok: true, source: "live", data: { elements: [1, 2] } });
    expect(JSON.parse(readFileSync(join(dir, NAME), "utf8")).value).toEqual({ elements: [1, 2] });
  });

  it("never uses a copy older than a week: no data is an error, as before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    fetchJsonMock.mockResolvedValueOnce({ elements: [1] });
    await launch()();

    vi.setSystemTime(new Date(Date.parse("2026-10-01T09:00:00Z") + MAX_COPY_AGE_MS + 60_000));
    fetchJsonMock.mockRejectedValue(new UpstreamError("Network error", null));
    expect(await launch()()).toMatchObject({ ok: false, status: 502 });
  });

  it("ignores a damaged copy rather than failing on it", async () => {
    mkdirSync(join(dir, "fpl"), { recursive: true });
    writeFileSync(join(dir, NAME), "{half a file");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchJsonMock.mockResolvedValueOnce({ elements: [7] });
    expect(await launch()()).toMatchObject({ ok: true, source: "live", data: { elements: [7] } });
  });

  it("keeps nothing on disk unless given a folder (npm run dev, the Dockerfile)", async () => {
    useDiskCopies(undefined);
    const cache = new TtlCache<unknown>();
    fetchJsonMock.mockResolvedValueOnce({ elements: [1] });
    await cachedFetch({ cache, cacheKey: "bootstrap-static", ttlMs: TTL, url: "http://fpl", persistAs: NAME });
    expect(existsSync(join(dir, NAME))).toBe(false);
  });
});
