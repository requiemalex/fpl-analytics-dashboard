import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, UpstreamError } from "./httpClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchJson (audit 2026-10-18 L3)", () => {
  it("a 200 whose body isn't JSON fails once, without retrying (only network errors and 5xx are retried)", async () => {
    const upstream = vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const err = await fetchJson("https://example.invalid/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).message).toContain("isn't valid JSON");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("the request timeout also covers reading the body", async () => {
    vi.useFakeTimers();
    // Headers arrive at once; the body never finishes unless the request is aborted.
    const upstream = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })));
        },
      });
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);
    const settled = fetchJson("https://example.invalid/x").then(
      () => "resolved",
      (e: UpstreamError) => (e.isTimeout ? "timed out" : e.message),
    );
    await vi.runAllTimersAsync();
    expect(await settled).toBe("timed out");
  });
});
