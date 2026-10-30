import { describe, expect, it } from "vitest";
import { HELP_GUIDES } from "./guides";
import { buildHelpIndex, helpWords, searchHelp } from "./search";
import { helpStatistics } from "./statistics";
import type { HelpEntry } from "./types";

/**
 * <help_search>: the questions people ask, and the guide each must put
 * first. When a guide's keywords change, these say whether it can still be
 * found; a new guide adds its own questions here.
 */

const entries: HelpEntry[] = [
  ...HELP_GUIDES.map((g): HelpEntry => ({ kind: "guide", ...g })),
  ...helpStatistics(null).map((s): HelpEntry => ({ kind: "statistic", ...s })),
];
const index = buildHelpIndex(entries);
const top = (q: string) => searchHelp(index, q)[0]?.entry.id;

const QUESTIONS: [string, string][] = [
  // Reading the numbers
  ["why is this player yellow", "stopwatch"],
  ["what does the amber clock mean", "stopwatch"],
  ["stopwach", "stopwatch"],
  ["why isn't this player coloured", "stopwatch"],
  ["small sample", "stopwatch"],
  ["what do green and red mean", "colours"],
  ["turn colours off", "colours"],
  ["colour blind", "colours"],
  ["why is this cell red", "colours"],
  ["how do i hide players with few minutes", "min-minutes"],
  ["set a minimum minutes", "min-minutes"],
  ["min mins", "min-minutes"],
  ["what is historic average", "historic-average"],
  ["historic avrage", "historic-average"],
  ["last season or this season", "data-views"],
  ["change the season", "data-views"],
  ["what does the dash mean", "dash"],
  ["why is it blank", "dash"],
  ["why is xg missing for 2020", "data-history"],
  ["how far back does the data go", "data-history"],
  ["tooltip", "hover"],
  ["what happens when i hover", "hover"],
  ["why doesn't price change between seasons", "today-only"],
  ["what does the red header mean", "today-only"],
  ["how is per game calculated", "per-game"],
  ["why are numbers rounded", "per-game"],
  // Dashboard
  ["create a new dashboard view", "dashboard-views"],
  ["starter view", "dashboard-views"],
  ["add a tile", "dashboard-tiles"],
  ["top 5 leaderboard", "dashboard-tiles"],
  ["scatter plot", "dashboard-graphs"],
  ["add trend line", "dashboard-graphs"],
  // Tables
  ["export to excel", "toolbar"],
  ["download csv", "toolbar"],
  ["reset the table", "toolbar"],
  ["add a column", "columns"],
  ["resize column", "columns"],
  ["sort by price", "sort-filter"],
  ["filter only defenders", "sort-filter"],
  ["save my columns", "saved-views"],
  ["load a saved view", "saved-views"],
  ["cant find a player", "player-search"],
  ["search box typo", "player-search"],
  // Teams & profiles
  ["league table", "team-explorer"],
  ["open a team page", "team-profile"],
  ["clean sheet odds", "fixture-forecast"],
  ["easy fixtures", "fixture-forecast"],
  ["open a player profile", "player-profile"],
  ["match log", "points-history"],
  ["what does the dagger mean", "points-history"],
  // Player Comparison
  ["compare two players", "comparison"],
  ["head to head", "comparison"],
  ["radar chart", "comparison-cards"],
  ["dotted line", "comparison-cards"],
  // Team Building
  ["how do i import my team", "import-team"],
  ["where do i find my team id", "import-team"],
  ["get my team in", "import-team"],
  ["add players to my squad", "build-squad"],
  ["wildcard", "build-squad"],
  ["what's on the shirts", "pitch-highlight"],
  ["show fixtures on the pitch", "pitch-highlight"],
  ["expected points", "expected-points"],
  ["fpl official or model", "expected-points"],
  ["how many points will he get", "expected-points"],
  ["rotation risk", "expected-minutes"],
  ["is he nailed on", "expected-minutes"],
  ["who should i captain", "best-draft"],
  ["pick my best team", "best-draft"],
  ["selling price", "sell-price"],
  ["how much money is in the bank", "sell-price"],
  ["price rise tonight", "price-changes"],
  ["price predictor", "price-changes"],
  // The app
  ["notes", "notepad"],
  ["backtick", "notepad"],
  ["how often does the data update", "updates"],
  ["no internet", "updates"],
  ["app wont load", "problems"],
  ["report a bug", "problems"],
  // Words still being typed, and wildcards
  ["capt", "best-draft"],
  ["notep", "notepad"],
  ["forec*", "fixture-forecast"],
  // Statistics, by name
  ["bps", "stat-fpl-bps"],
  ["pts/£m", "stat-fpl-pts/£m"],
  ["what is ict", "stat-fpl-ict"],
  ["ppg", "stat-fpl-ppg"],
];

describe("Help finds the right guide first", () => {
  it.each(QUESTIONS)("%s → %s", (question, id) => {
    expect(top(question)).toBe(id);
  });

  it("finds a statistic by what it stands for", () => {
    expect(searchHelp(index, "expected goals")[0]?.entry.title).toMatch(/^xG/);
  });

  it("finds nothing for words no guide uses", () => {
    expect(searchHelp(index, "zebra crossing")).toEqual([]);
    expect(searchHelp(index, "why is the")).toEqual([]);
  });
});

describe("helpWords", () => {
  it("folds plurals, endings, accents and synonyms into one word", () => {
    expect(helpWords("Colours")).toEqual(helpWords("colour"));
    expect(helpWords("color")).toEqual(helpWords("colour"));
    expect(helpWords("selling")).toEqual(helpWords("sell"));
    expect(helpWords("orange")).toEqual(helpWords("amber"));
    expect(helpWords("Ødegaard")).toEqual(["odegaard"]);
  });
});

describe("the guides", () => {
  const ids = HELP_GUIDES.map((g) => g.id);

  it("have unique ids, and every related guide exists", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of HELP_GUIDES) for (const r of g.related ?? []) expect(ids, `${g.id} → ${r}`).toContain(r);
  });

  it("keep the answer to one short line, and list plenty of words to be found by", () => {
    for (const g of HELP_GUIDES) {
      expect(g.answer.length, g.id).toBeLessThanOrEqual(110);
      expect(g.keywords.length, g.id).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("statistic entries", () => {
  const stats = helpStatistics(null);

  it("give every statistic its hover's meaning", () => {
    const xg = stats.find((s) => s.id === "stat-fpl-xg");
    expect(xg?.player).toMatch(/^Expected goals/);
    expect(xg?.club).toBeTruthy();
  });

  it("drop the hover's own heading, keeping only the meaning", () => {
    for (const s of stats) for (const m of [s.player, s.club]) if (m) expect(m.startsWith(`${s.title}:`), s.id).toBe(false);
  });
});
