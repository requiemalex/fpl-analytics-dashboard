import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadVersioned, saveVersioned, type VersionedStore } from "./persistentStorage";

interface Shape {
  value: number;
}

const STORE: VersionedStore<Shape> = {
  version: 2,
  fallback: { value: -1 },
  migrate(data, storedVersion) {
    if (data === null || typeof data !== "object") return null;
    // version 1 shape was { oldValue: number }; version 2 renamed it to { value }
    if (storedVersion === 1) {
      const d = data as { oldValue?: number };
      if (typeof d.oldValue !== "number") return null;
      return { value: d.oldValue };
    }
    const d = data as Partial<Shape>;
    if (typeof d.value !== "number") return null;
    return { value: d.value };
  },
};

beforeEach(() => {
  localStorage.clear();
});

describe("loadVersioned", () => {
  it("returns the fallback when nothing is stored", () => {
    expect(loadVersioned("k", STORE)).toEqual({ value: -1 });
  });

  it("round-trips current-version data written via saveVersioned", () => {
    saveVersioned("k", 2, { value: 42 });
    expect(loadVersioned("k", STORE)).toEqual({ value: 42 });
  });

  it("<update_safety>: migrates OLD-SHAPE data forward, not just round-tripping new-shape data — this is the actual regression this project's migration pattern exists to prevent", () => {
    // Simulate a pre-existing localStorage entry written under version 1's shape.
    localStorage.setItem("k", JSON.stringify({ version: 1, data: { oldValue: 99 } }));
    const result = loadVersioned("k", STORE);
    expect(result).toEqual({ value: 99 }); // migrated, not dropped to fallback
  });

  it("data written before the envelope pattern existed (no {version,data} wrapper at all) is passed to migrate() with storedVersion=null", () => {
    // Raw un-enveloped payload, matching "every pre-existing key in this app" per the file's own docs.
    localStorage.setItem("k", JSON.stringify({ value: 7 }));
    const result = loadVersioned("k", STORE);
    expect(result).toEqual({ value: 7 });
  });

  it("falls back to `fallback`, not a crash, when migrate() returns null for unsalvageable data", () => {
    localStorage.setItem("k", JSON.stringify({ version: 1, data: { somethingElseEntirely: true } }));
    expect(loadVersioned("k", STORE)).toEqual({ value: -1 });
  });

  it("falls back gracefully on corrupt/non-JSON localStorage content rather than throwing", () => {
    localStorage.setItem("k", "{not valid json");
    expect(loadVersioned("k", STORE)).toEqual({ value: -1 });
  });

  it("falls back gracefully when localStorage.getItem throws (e.g. private browsing restrictions)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadVersioned("k", STORE)).toEqual({ value: -1 });
    spy.mockRestore();
  });
});

describe("saveVersioned", () => {
  it("wraps data in a {version, data} envelope", () => {
    saveVersioned("k", 5, { value: 1 });
    const raw = JSON.parse(localStorage.getItem("k")!);
    expect(raw).toEqual({ version: 5, data: { value: 1 } });
  });

  it("does not throw when localStorage.setItem throws (quota exceeded etc.)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveVersioned("k", 1, { value: 1 })).not.toThrow();
    spy.mockRestore();
  });
});
