import { describe, expect, it } from "vitest";
import { attemptsFailed, describeFetchError } from "./fetchError.js";

// The shapes Node 24's fetch() really throws (recorded 2026-11-02): a bare
// "fetch failed" TypeError with the reason in its cause.
const fetchFailed = (cause: unknown) => new TypeError("fetch failed", { cause });
const withCode = (message: string, code: string, name = "Error") => Object.assign(new Error(message), { code, name });

describe("describeFetchError", () => {
  it("says the site didn't accept the connection, keeping undici's detail (the 2026-11-02 Understat failure)", () => {
    const err = fetchFailed(withCode("Connect Timeout Error (attempted address: understat.com:443, timeout: 10000ms)", "UND_ERR_CONNECT_TIMEOUT", "ConnectTimeoutError"));
    expect(describeFetchError(err)).toBe(
      "couldn't connect in time (the site didn't accept the connection) — fetch failed: Connect Timeout Error (attempted address: understat.com:443, timeout: 10000ms)",
    );
  });

  it("names a failed address lookup", () => {
    const err = fetchFailed(withCode("getaddrinfo ENOTFOUND understat.com", "ENOTFOUND"));
    expect(describeFetchError(err)).toBe("the site's address couldn't be looked up (DNS) — fetch failed: getaddrinfo ENOTFOUND understat.com");
  });

  it("looks inside an AggregateError (one error per address tried)", () => {
    const err = fetchFailed(
      Object.assign(new AggregateError([withCode("connect ECONNREFUSED ::1:443", "ECONNREFUSED"), withCode("connect ECONNREFUSED 127.0.0.1:443", "ECONNREFUSED")], ""), { code: "ECONNREFUSED" }),
    );
    expect(describeFetchError(err)).toBe("the connection was refused — fetch failed: connect ECONNREFUSED ::1:443: connect ECONNREFUSED 127.0.0.1:443");
  });

  it("names the caller's own time limit when that's what fired", () => {
    const err = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(describeFetchError(err, { timeoutMs: 20_000 })).toBe("no reply within 20s (timed out) — The operation was aborted due to timeout");
  });

  it("names dropped connections and certificate failures", () => {
    expect(describeFetchError(fetchFailed(withCode("read ECONNRESET", "ECONNRESET")))).toMatch(/^the connection was dropped — /);
    expect(describeFetchError(fetchFailed(withCode("certificate has expired", "CERT_HAS_EXPIRED")))).toMatch(/^the secure \(HTTPS\) connection failed — /);
  });

  it("gives an unrecognised failure's own messages, without guessing a reason", () => {
    expect(describeFetchError(fetchFailed(new Error("bad port")))).toBe("fetch failed: bad port");
    expect(describeFetchError(new SyntaxError("Unexpected token < in JSON"))).toBe("Unexpected token < in JSON");
    expect(describeFetchError("nope")).toBe("nope");
  });
});

describe("attemptsFailed", () => {
  it("lists each attempt under what was asked for", () => {
    expect(attemptsFailed("FPL bootstrap-static", ["06:00:01 UTC: HTTP 503", "06:00:03 UTC: HTTP 503"])).toBe(
      "FPL bootstrap-static: no usable answer after 2 attempts:\n  - attempt 1 at 06:00:01 UTC: HTTP 503\n  - attempt 2 at 06:00:03 UTC: HTTP 503",
    );
  });
});
