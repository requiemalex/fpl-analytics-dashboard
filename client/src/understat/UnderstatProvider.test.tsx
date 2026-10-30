import React, { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { UnderstatProvider } from "./UnderstatProvider";
import { useExternalProfiles, useExternalStats, type ExternalProfiles, type ExternalStatsSource } from "../extensions/externalStats";

// The hourly check, and what it does when the sync has published again:
// the live season's profile figures already loaded are asked for again —
// once — and a completed season's never.

const net = vi.hoisted(() => ({ generatedAt: "2026-10-18T06:10:00Z", detailCalls: [] as string[] }));

// The same objects on every call, as the app's state is between changes.
const appState = vi.hoisted(() => ({
  players: [],
  teams: [],
  teamsById: new Map(),
  historicProfiles: new Map(),
  historicReferenceSeason: "2025/26",
  currentSeasonHasStarted: true,
  fixtures: [],
}));
vi.mock("../state/AppStateContext", () => ({
  useAppState: () => appState,
}));
vi.mock("../api/client", () => ({
  getEnvelope: async () => ({
    data: {
      enabled: true,
      status: { generatedAt: net.generatedAt, liveSeason: "2026/27", seasons: ["2026/27"], latestMatchDate: null, missingFixtures: {} },
      seasons: {},
    },
    meta: { source: "live", fetchedAt: 0 },
  }),
}));
vi.mock("./profileData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./profileData")>()),
  fetchPlayerDetail: async (code: number, season: string) => {
    net.detailCalls.push(`${code}:${season}`);
    return { state: "ready", detail: { matches: [], shots: [] } };
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  net.detailCalls.length = 0;
  net.generatedAt = "2026-10-18T06:10:00Z";
});

/** Stands in for an open player profile: asks for his live and a completed season whenever the source changes. */
function OpenProfile() {
  const ext = useExternalStats();
  useEffect(() => {
    ext?.request();
    ext?.profiles.requestPlayer(500, ["2026/27", "2025/26"]);
  }, [ext]);
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UnderstatProvider — a newer sync refreshes open profiles", () => {
  it("asks for the live season again once after a newer sync, never a completed season; the same sync asks for nothing", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(
      <UnderstatProvider>
        <OpenProfile />
      </UnderstatProvider>,
    );
    await flush();
    await flush();
    expect(net.detailCalls.sort()).toEqual(["500:2025/26", "500:2026/27"]);

    // An hour on, same sync: nothing asked for again.
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    await flush();
    expect(net.detailCalls).toHaveLength(2);

    // The next hour, a newer sync: the live season only, once.
    net.generatedAt = "2026-10-19T06:10:00Z";
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    await flush();
    await flush();
    expect(net.detailCalls.filter((c) => c === "500:2026/27")).toHaveLength(2);
    expect(net.detailCalls.filter((c) => c === "500:2025/26")).toHaveLength(1);
  });
});

describe("UnderstatProvider — a profile's details load apart from the source (<profile_details_apart>)", () => {
  it("changes the profiles as his details load, never the source every page's columns come from", async () => {
    const sources = new Set<ExternalStatsSource | null>();
    const profileSets = new Set<ExternalProfiles | null>();
    let ask: () => void = () => {};
    function Probe() {
      const ext = useExternalStats();
      const profiles = useExternalProfiles();
      sources.add(ext);
      profileSets.add(profiles);
      useEffect(() => {
        ext?.request();
      }, [ext]);
      ask = () => ext?.profiles.requestPlayer(500, ["2025/26"]);
      return null;
    }
    render(
      <UnderstatProvider>
        <Probe />
      </UnderstatProvider>,
    );
    await flush();
    await flush();
    const sourcesBefore = sources.size;
    const profilesBefore = profileSets.size;
    act(() => ask());
    await flush();
    await flush();
    expect(net.detailCalls).toEqual(["500:2025/26"]);
    // Loading, then ready: two new profiles; the same source throughout.
    expect(profileSets.size).toBe(profilesBefore + 2);
    expect(sources.size).toBe(sourcesBefore);
  });
});
