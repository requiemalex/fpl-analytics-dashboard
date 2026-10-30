import { describe, expect, it } from "vitest";
import type { ExternalStatsSource } from "../extensions/externalStats";
import { HELP_GUIDES } from "../help/guides";
import { buildHelpIndex, searchHelp } from "../help/search";
import { helpStatistics } from "../help/statistics";
import type { HelpEntry } from "../help/types";
import { understatPlayerColumns, understatTeamColumns } from "./columns";
import { understatHelpGuides } from "./help";

/** Understat's Help guides and statistic entries, searched alongside FPL's as the app does (<help_search>). */

const ext = {
  label: "Understat",
  className: "col-source-understat",
  playerColumns: () => understatPlayerColumns(() => null),
  teamColumns: () => understatTeamColumns(new Map(), () => null),
} as unknown as ExternalStatsSource;

const guides = [...HELP_GUIDES, ...understatHelpGuides(null)];
const index = buildHelpIndex([
  ...guides.map((g): HelpEntry => ({ kind: "guide", ...g })),
  ...helpStatistics(ext).map((s): HelpEntry => ({ kind: "statistic", ...s })),
]);
const top = (q: string) => searchHelp(index, q)[0]?.entry.id;

describe("Understat in Help", () => {
  it.each([
    ["why do understat and fpl disagree", "understat"],
    ["purple columns", "understat"],
    ["what is understat", "understat"],
    ["⇄", "source-switch"],
    ["swap to understat xg", "source-switch"],
    ["shot map", "shot-maps"],
    ["where are his shots from", "shot-maps"],
    ["formation", "formations"],
    ["who starts in the lineup", "formations"],
    ["ppda", "stat-understat-ppda"],
    ["xgchain", "stat-understat-xgchain"],
  ])("%s → %s", (question, id) => {
    expect(top(question)).toBe(id);
  });

  it("gives Understat's version of a shared figure its own entry, beside FPL's", () => {
    const xg = searchHelp(index, "xg").map((r) => r.entry.id);
    expect(xg).toContain("stat-fpl-xg");
    expect(xg).toContain("stat-understat-xg");
  });

  it("keeps guide ids unique with FPL's", () => {
    const ids = guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of understatHelpGuides(null)) expect(g.keywords.length, g.id).toBeGreaterThanOrEqual(15);
  });
});
