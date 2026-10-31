import { describe, expect, it } from "vitest";
import type { ExternalStatsSource } from "../extensions/externalStats";
import { HELP_GUIDES } from "../help/guides";
import { buildHelpIndex, searchHelp } from "../help/search";
import { helpStatSections, statisticsGuide } from "../help/statistics";
import { understatPlayerColumns, understatTeamColumns } from "./columns";
import { understatHelpGuides } from "./help";

/** Understat's Help guides and statistics, searched alongside FPL's as the app does (<help_search>). */

const ext = {
  label: "Understat",
  className: "col-source-understat",
  playerColumns: () => understatPlayerColumns(() => null),
  teamColumns: () => understatTeamColumns(new Map(), () => null),
} as unknown as ExternalStatsSource;

const sections = helpStatSections(ext);
const guides = [...HELP_GUIDES, ...understatHelpGuides(null), statisticsGuide(sections)];
const index = buildHelpIndex(guides);
const top = (q: string) => searchHelp(index, q)[0]?.guide.id;

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
    ["understat summary", "understat-profiles"],
    ["win chance", "result-chances"],
    ["deserved result", "result-chances"],
    ["player not matched", "understat-coverage"],
    ["violet title", "source-icons"],
    ["non penalty", "non-penalty"],
    ["why is club xg lower than its players", "club-xg-per-chance"],
    ["rebound", "club-xg-per-chance"],
    ["shots outside the box", "shot-location"],
    ["where does he shoot from", "shot-location"],
    ["what is set piece xg", "set-piece-figures"],
    ["how many corners does he take", "set-piece-figures"],
    ["his deliveries from corners", "set-piece-figures"],
    ["ppda", "statistics"],
    ["xgchain", "statistics"],
  ])("%s → %s", (question, id) => {
    expect(top(question)).toBe(id);
  });

  it("lists Understat's statistics after FPL's, its version of a shared figure under FPL & Understat", () => {
    const headings = sections.map((s) => `${s.scope} · ${s.heading}`);
    expect(headings).toContain("Players · FPL & Understat");
    const shared = sections.find((s) => s.scope === "Players" && s.heading === "FPL & Understat");
    expect(shared?.rows.map((r) => r.name)).toContain("xG");
    expect(sections.flatMap((s) => s.rows).find((r) => r.name === "PPDA")?.meaning).toMatch(/press/);
  });

  it("keeps guide ids unique with FPL's, each with plenty of words to be found by", () => {
    const ids = guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of understatHelpGuides(null)) expect(g.keywords.length, g.id).toBeGreaterThanOrEqual(15);
  });
});
