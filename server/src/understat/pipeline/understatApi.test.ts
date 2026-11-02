import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnderstatClient, parseTeam, UnderstatBlockedError, UnderstatFormatError, UnderstatUnreachableError } from "./understatApi.js";

// The shape of Understat's /getTeamData reply, trimmed to what parseTeam reads.
const page = (h: string, a: string) => ({
  dates: [
    { id: "31180", isResult: true, h: { id: h }, a: { id: a } },
    { id: "31254", isResult: false, h: { id: "83" }, a: { id: "72" } },
  ],
  statistics: {
    formation: {
      "4-2-3-1": { stat: "4-2-3-1", time: 669, shots: 87, goals: 11, xG: 12.75, against: { shots: 78, goals: 5, xG: 7.53 } },
    },
  },
});

describe("parseTeam", () => {
  it("reads each formation's time and shots for and against, and the played matches", () => {
    const t = parseTeam(page("83", "294"), "83", 2026);
    expect(t.playedMatchIds).toEqual(["31180"]);
    expect(t.formations).toEqual([{ teamId: "83", formation: "4-2-3-1", minutes: 669, shots: 87, goals: 11, xG: 12.75, shotsAgainst: 78, goalsAgainst: 5, xGA: 7.53 }]);
  });

  it("refuses another club's page", () => {
    expect(() => parseTeam(page("71", "294"), "83", 2026)).toThrow(UnderstatFormatError);
  });
});

describe("when Understat doesn't answer properly", () => {
  // No pauses between attempts, and fetch() replaced by the given replies in turn.
  function clientWith(replies: (() => Promise<Response>)[]) {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => replies[Math.min(call++, replies.length - 1)]()));
    return createUnderstatClient({ delayMs: 0, attempts: 3 });
  }
  const connectTimeout = async (): Promise<Response> => {
    const cause = Object.assign(new Error("Connect Timeout Error (attempted address: understat.com:443, timeout: 10000ms)"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    throw new TypeError("fetch failed", { cause });
  };
  const status = (code: number) => async () => new Response("", { status: code });

  afterEach(() => vi.unstubAllGlobals());

  it("names what it asked for and why each attempt failed (the 2026-11-02 failure)", async () => {
    const err = await clientWith([connectTimeout]).league(2026).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnderstatUnreachableError);
    const message = (err as Error).message;
    expect(message).toMatch(/^Understat's 2026\/27 season data \(\/getLeagueData\/EPL\/2026\): no usable answer after 3 attempts:\n/);
    expect(message.match(/ {2}- attempt \d at \d\d:\d\d:\d\d UTC: couldn't connect in time .*understat\.com:443/g)).toHaveLength(3);
  });

  it("counts a server error on every attempt as unreachable", async () => {
    const err = await clientWith([status(503)]).team("Arsenal", "83", 2026).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnderstatUnreachableError);
    expect((err as Error).message).toContain("Understat's Arsenal 2026/27 team page (/getTeamData/Arsenal/2026)");
    expect((err as Error).message).toContain("HTTP 503 (Understat's server had a problem)");
  });

  it("is a block, with every attempt listed, if Understat refused any attempt", async () => {
    const err = await clientWith([connectTimeout, status(429), status(503)]).match("31180").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnderstatBlockedError);
    expect((err as Error).message).toMatch(/attempt 1 .*couldn't connect.*\n.*attempt 2 .*HTTP 429 \(refused\)\n.*attempt 3 .*HTTP 503/);
  });

  it("is neither for an answer like 404, which may mean Understat moved its data", async () => {
    const err = await clientWith([status(404)]).match("31180").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnderstatUnreachableError);
    expect(err).not.toBeInstanceOf(UnderstatBlockedError);
    expect((err as Error).message).toContain("Understat's match 31180 (/getMatchData/31180)");
  });

  it("uses a later attempt that works", async () => {
    const t = await clientWith([connectTimeout, async () => new Response(JSON.stringify(page("83", "294")))]).team("Arsenal", "83", 2026);
    expect(t.playedMatchIds).toEqual(["31180"]);
  });
});
