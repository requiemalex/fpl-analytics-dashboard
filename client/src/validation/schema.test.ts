import { describe, it, expect } from "vitest";
import { parseBootstrapStatic, SchemaValidationError } from "./schema";
import { makeRawElement, makeRawTeam, RAW_ELEMENT_TYPES } from "../test/rawFixtures";

function makeRawBootstrapPayload(elements: unknown[]) {
  return {
    elements,
    teams: [makeRawTeam({ id: 1 })],
    element_types: RAW_ELEMENT_TYPES,
    events: [],
    element_stats: [],
  };
}

describe("parseBootstrapStatic — M8 regression: one malformed player record must not fail the whole pool", () => {
  it("drops a single schema-invalid record (null now_cost, missing total_points) and keeps every valid record", () => {
    const good1 = makeRawElement({ id: 1 });
    const good2 = makeRawElement({ id: 3 });
    // Reproduces the audit's exact M8 repro: now_cost null (required: number) and total_points absent (required: number).
    const bad = { ...makeRawElement({ id: 2 }), now_cost: null, total_points: undefined };
    const payload = makeRawBootstrapPayload([good1, bad, good2]);

    const { bootstrap, skippedElementCount } = parseBootstrapStatic(payload);

    expect(skippedElementCount).toBe(1);
    expect(bootstrap.elements).toHaveLength(2);
    expect(bootstrap.elements.map((e) => e.id)).toEqual([1, 3]);
  });

  it("returns skippedElementCount 0 when every record is valid", () => {
    const payload = makeRawBootstrapPayload([makeRawElement({ id: 1 }), makeRawElement({ id: 2 })]);
    const { skippedElementCount, bootstrap } = parseBootstrapStatic(payload);
    expect(skippedElementCount).toBe(0);
    expect(bootstrap.elements).toHaveLength(2);
  });

  it("still fails closed when the top-level structure itself is broken (e.g. teams missing entirely)", () => {
    const payload = { elements: [], element_types: RAW_ELEMENT_TYPES, events: [], element_stats: [] };
    expect(() => parseBootstrapStatic(payload)).toThrow(SchemaValidationError);
  });

  it("still fails closed when `elements` itself isn't an array", () => {
    const payload = { ...makeRawBootstrapPayload([]), elements: "not-an-array" };
    expect(() => parseBootstrapStatic(payload)).toThrow(SchemaValidationError);
  });
});
