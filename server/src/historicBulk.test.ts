import { describe, it, expect, vi, beforeEach } from "vitest";

const cachedFetchMock = vi.fn();

vi.mock("./proxy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./proxy.js")>();
  return { ...actual, cachedFetch: cachedFetchMock };
});

const { buildBulkHistoricData, historicBulkRouter } = await import("./routes/historicBulk.js");
const { historicBulkCache } = await import("./cache.js");

function bootstrapResult(playerIds: number[]) {
  return { ok: true, data: { elements: playerIds.map((id) => ({ id })) }, source: "cache", fetchedAt: Date.now() };
}

function elementSummaryResult(historyPast: unknown[] = []) {
  return { ok: true, data: { history_past: historyPast }, source: "cache", fetchedAt: Date.now() };
}

// Pulls the two real route handlers off the router's own internal stack so
// the actual `handle()`/in-flight-coalescing logic is exercised end to end,
// not just buildBulkHistoricData() in isolation (that isolation is exactly
// why the Phase 3 audit's R1 regression — see below — had no test coverage
// in the first place).
function findHandler(path: string, method: "get" | "post"): (req: unknown, res: unknown) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (historicBulkRouter as any).stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`no handler for ${method} ${path}`);
  return layer.route.stack[0].handle;
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  cachedFetchMock.mockReset();
  // historicBulkCache is a real, non-mocked, module-level singleton shared
  // across every test in this file (handle() checks it before ever calling
  // buildBulkHistoricData) — clear it so an earlier test's cached build
  // can't short-circuit a later test that expects a real build to run.
  historicBulkCache.invalidate("historic-bulk");
});

describe("buildBulkHistoricData — L10 regression: a force-refresh build must bypass every nested cache, not just the top-level historic-bulk entry", () => {
  it("passes bypassCache=false through to both the nested bootstrap-static and element-summary cachedFetch calls on a normal (non-refresh) build", async () => {
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string }) => {
      if (opts.cacheKey === "bootstrap-static") return bootstrapResult([1, 2]);
      return elementSummaryResult();
    });

    await buildBulkHistoricData(false);

    for (const call of cachedFetchMock.mock.calls) {
      expect(call[0].bypassCache).toBe(false);
    }
    // One bootstrap call + one fixtures call (for the live season's club figures) + one per player.
    expect(cachedFetchMock).toHaveBeenCalledTimes(4);
  });

  it("passes bypassCache=true through to BOTH the nested bootstrap-static call and every per-player element-summary call when the build was requested as a refresh", async () => {
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string }) => {
      if (opts.cacheKey === "bootstrap-static") return bootstrapResult([1, 2, 3]);
      return elementSummaryResult();
    });

    await buildBulkHistoricData(true);

    expect(cachedFetchMock).toHaveBeenCalledTimes(5); // 1 bootstrap + 1 fixtures + 3 players
    for (const call of cachedFetchMock.mock.calls) {
      expect(call[0].bypassCache).toBe(true);
    }
    const bootstrapCall = cachedFetchMock.mock.calls.find((c) => c[0].cacheKey === "bootstrap-static");
    expect(bootstrapCall?.[0].bypassCache).toBe(true);
    const fixturesCall = cachedFetchMock.mock.calls.find((c) => c[0].cacheKey === "fixtures");
    expect(fixturesCall?.[0].bypassCache).toBe(true);
    const playerCalls = cachedFetchMock.mock.calls.filter((c) => c[0].cacheKey.startsWith("element-summary:"));
    expect(playerCalls).toHaveLength(3);
    for (const call of playerCalls) {
      expect(call[0].bypassCache).toBe(true);
    }
  });
});

describe("handle() in-flight coalescing — Phase 3 audit regression R1: a refresh must never silently ride a concurrent non-refresh build", () => {
  it("a POST /refresh/historic-bulk that arrives while a GET /historic-bulk build is still in flight starts its own bypassed build, not the non-bypassed one", async () => {
    let resolveBootstrap: (v: unknown) => void;
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string; bypassCache?: boolean }) => {
      if (opts.cacheKey === "bootstrap-static") {
        // Only the FIRST (normal) build's bootstrap call hangs — this is what
        // creates the window for the refresh request to land while it's
        // still pending. The refresh's own bootstrap call (once it correctly
        // starts its own build) resolves immediately.
        if (!opts.bypassCache) {
          return new Promise((resolve) => {
            resolveBootstrap = () => resolve(bootstrapResult([1]));
          });
        }
        return bootstrapResult([1]);
      }
      return elementSummaryResult();
    });

    const getHandler = findHandler("/historic-bulk", "get");
    const postHandler = findHandler("/refresh/historic-bulk", "post");
    const normalRes = fakeRes();
    const refreshRes = fakeRes();

    const normalPromise = getHandler({}, normalRes);
    await delay(10); // let the normal build actually start and register itself

    const refreshPromise = postHandler({}, refreshRes);
    await delay(10);

    // Before the fix, the refresh request would never make its own
    // bootstrap-static call at all (it would just await the normal build's
    // still-pending one) — so at this point there'd only be ONE
    // bootstrap-static call on record, with bypassCache: false. After the
    // fix, the refresh's own bypassed call has already fired.
    const bootstrapCallsSoFar = cachedFetchMock.mock.calls.filter((c) => c[0].cacheKey === "bootstrap-static");
    expect(bootstrapCallsSoFar.some((c) => c[0].bypassCache === true)).toBe(true);

    resolveBootstrap!(undefined);
    await Promise.all([normalPromise, refreshPromise]);

    expect((refreshRes.body as { meta: { source: string } }).meta.source).toBe("live");
    const allBootstrapCalls = cachedFetchMock.mock.calls.filter((c) => c[0].cacheKey === "bootstrap-static");
    expect(allBootstrapCalls).toHaveLength(2); // one non-bypassed (the normal build), one bypassed (the refresh) — never coalesced into one
  });

  it("two concurrent normal GET /historic-bulk requests still coalesce into a single build (no regression to the original de-duplication behaviour)", async () => {
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string }) => {
      if (opts.cacheKey === "bootstrap-static") {
        await delay(10);
        return bootstrapResult([1, 2]);
      }
      return elementSummaryResult();
    });

    const getHandler = findHandler("/historic-bulk", "get");
    const [r1, r2] = await Promise.all([getHandler({}, fakeRes()), getHandler({}, fakeRes())]);
    void r1;
    void r2;

    const bootstrapCalls = cachedFetchMock.mock.calls.filter((c) => c[0].cacheKey === "bootstrap-static");
    expect(bootstrapCalls).toHaveLength(1); // still coalesced — this fix only separates refresh from non-refresh, not normal-from-normal
  });
});

describe("buildBulkHistoricData — club seasons", () => {
  it("returns the bundled completed seasons plus the live season built from this season's per-fixture history", async () => {
    cachedFetchMock.mockImplementation(async (opts: { cacheKey: string }) => {
      if (opts.cacheKey === "bootstrap-static") {
        return {
          ok: true,
          data: {
            elements: [
              { id: 1, code: 501, element_type: 1 },
              { id: 2, code: 502, element_type: 1 },
            ],
            teams: [
              { id: 1, code: 3, name: "Arsenal", short_name: "ARS" },
              { id: 2, code: 14, name: "Liverpool", short_name: "LIV" },
            ],
            events: [{ id: 1, deadline_time: "2026-08-14T17:30:00Z" }],
          },
          source: "cache",
          fetchedAt: Date.now(),
        };
      }
      if (opts.cacheKey === "fixtures") {
        return {
          ok: true,
          data: [{ id: 10, event: 1, team_h: 1, team_a: 2, team_h_score: 1, team_a_score: 0, finished: true }],
          source: "cache",
          fetchedAt: Date.now(),
        };
      }
      const home = opts.cacheKey === "element-summary:1";
      return {
        ok: true,
        data: {
          history_past: [],
          // Each side's xG is the other's xGC (<club_xgc_per_match>).
          history: [{ fixture: 10, was_home: home, minutes: 90, total_points: 6, goals_scored: home ? 1 : 0, expected_goals: home ? "1.30" : "0.40", expected_goals_conceded: home ? "0.40" : "1.30" }],
        },
        source: "cache",
        fetchedAt: Date.now(),
      };
    });

    const result = await buildBulkHistoricData(false);
    const live = result.clubSeasons.filter((c) => c.season === "2026/27");
    expect(live.map((c) => [c.shortName, c.goalsFor, c.goalsAgainst, c.xGC])).toEqual([
      ["ARS", 1, 0, 0.4],
      ["LIV", 0, 1, 1.3],
    ]);
    expect(result.clubSeasons.some((c) => c.season === "2025/26" && c.complete)).toBe(true);
  });
});
