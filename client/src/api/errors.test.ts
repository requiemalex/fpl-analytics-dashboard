import { afterEach, describe, expect, it, vi } from "vitest";
import { describeLoadError } from "./errors";
import { ApiRequestError } from "./client";
import { SchemaValidationError } from "../validation/schema";

afterEach(() => vi.restoreAllMocks());

describe("<plain_errors> describeLoadError", () => {
  it("never shows an internal address or raw status line, and keeps the detail for the log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new ApiRequestError("Request to /api/element-summary/411 failed (500)", 500);
    const text = describeLoadError(err);
    expect(text).not.toContain("/api/");
    expect(text).toContain("error 500");
    expect(log).toHaveBeenCalledWith("Load failed:", err);
  });

  it("names each kind of failure in plain words", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(describeLoadError(new TypeError("Failed to fetch"))).toMatch(/internet connection/);
    expect(describeLoadError(new ApiRequestError("x", 404))).toBe("FPL has no record of it.");
    expect(describeLoadError(new SchemaValidationError("bootstrap-static", []))).toMatch(/doesn't recognise/);
    expect(describeLoadError("??")).toMatch(/unexpected/);
  });
});
