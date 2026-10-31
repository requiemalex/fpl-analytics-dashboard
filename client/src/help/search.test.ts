import { describe, expect, it } from "vitest";
import { HELP_GUIDES } from "./guides";
import { buildHelpIndex, helpWords, questionTokens, searchHelp } from "./search";
import { helpStatSections, statisticsGuide } from "./statistics";

/**
 * <help_search>: the questions people ask, and the guide each must put
 * first. When a guide's keywords change, these say whether it can still be
 * found; a new guide adds its own questions here.
 */

const sections = helpStatSections(null);
const guides = [...HELP_GUIDES, statisticsGuide(sections)];
const index = buildHelpIndex(guides);
const ids = (q: string) => searchHelp(index, q).map((r) => r.guide.id);
const top = (q: string) => ids(q)[0];

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
  ["icons", "icons"],
  ["what does this button do", "icons"],
  ["what does the green dot mean", "top-bar"],
  ["players loaded", "top-bar"],
  ["what colour is a defender", "positions"],
  ["club badge", "club-pills"],
  ["what is xg", "xg-basics"],
  ["expected assists", "xg-basics"],
  ["is he overperforming", "over-under"],
  ["unlucky finishing", "over-under"],
  ["defcon points", "defensive-contributions"],
  ["how do defenders get 2 points", "defensive-contributions"],
  ["how does bonus work", "bonus-bps"],
  ["who takes penalties", "set-pieces"],
  ["what does the gold icon mean", "set-pieces"],
  ["corner taker icon", "set-pieces"],
  ["stats", "statistics"],
  ["glossary", "statistics"],
  // Finding players
  ["cheap midfielders", "find-value"],
  ["best value", "find-value"],
  ["differentials", "find-differentials"],
  ["low owned players", "find-differentials"],
  ["who will score", "find-attackers"],
  ["best defenders", "find-defenders"],
  ["which keeper", "find-keepers"],
  // Fixtures & gameweeks
  ["fdr", "fixture-difficulty"],
  ["fixture ticker", "fixture-difficulty"],
  ["double gameweek", "double-blank"],
  ["blank gameweek", "double-blank"],
  ["when is the deadline", "gameweeks"],
  ["why is the league table behind", "live-gameweek"],
  ["matches in progress", "live-gameweek"],
  ["everything is blank before the season", "pre-season"],
  ["preseason", "pre-season"],
  // Dashboard
  ["create a new dashboard view", "dashboard-views"],
  ["add a tile", "dashboard-tiles"],
  ["top 5 leaderboard", "dashboard-tiles"],
  ["scatter plot", "dashboard-graphs"],
  ["add trend line", "dashboard-graphs"],
  ["log scale", "graph-axes"],
  ["graph looks squashed", "graph-axes"],
  ["team tiles", "dashboard-teams"],
  ["can't edit the starter view", "dashboard-starter"],
  ["can't add another tile", "dashboard-limits"],
  ["how many graphs can i have", "dashboard-limits"],
  ["tile says unavailable", "unavailable-card"],
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
  ["find tottenham", "find-club"],
  ["saved view loaded without a column", "view-notice"],
  // Teams
  ["league table", "team-explorer"],
  ["open a team page", "team-profile"],
  ["clean sheet odds", "fixture-forecast"],
  ["easy fixtures", "fixture-forecast"],
  ["new signing club figures", "club-figures"],
  ["team radar", "team-summary"],
  ["club results", "team-match-log"],
  // Player Profile
  ["open a player profile", "player-profile"],
  ["match log", "match-log"],
  ["what does the dagger mean", "points-history"],
  ["profile tiles", "profile-summary"],
  ["spider chart", "percentile-radar"],
  ["minutes gauge", "playing-time"],
  ["profile is empty", "profile-no-data"],
  ["match log totals don't add up", "match-record-check"],
  // Player Comparison
  ["compare two players", "comparison"],
  ["head to head", "comparison"],
  ["radar chart", "comparison-cards"],
  ["reorder cards", "comparison-build"],
  ["outputs bar", "outputs-bars"],
  ["season by season", "trends"],
  // Team Building
  ["how do i import my team", "import-team"],
  ["where do i find my team id", "import-team"],
  ["get my team in", "import-team"],
  ["add players to my squad", "build-squad"],
  ["wildcard", "build-squad"],
  ["what's on the shirts", "pitch-highlight"],
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
  ["who to buy", "add-players"],
  ["why is my projected points red", "projected-points"],
  ["rename squad", "manage-squads"],
  ["3 per club", "squad-rules"],
  ["can i afford", "plan-transfer"],
  ["what did i pay for him", "purchase-prices"],
  ["why is the purchase price missing", "purchase-prices"],
  ["my bank doesn't match fpl", "imported-budget"],
  ["free hit", "chip-weeks"],
  ["bench boost", "chip-weeks"],
  ["price locked", "price-locked"],
  ["calibrating", "price-locked"],
  ["how accurate are the predictions", "prediction-accuracy"],
  ["can i trust the model", "prediction-accuracy"],
  // The app
  ["notes", "notepad"],
  ["backtick", "notepad"],
  ["how often does the data update", "updates"],
  ["no internet", "updates"],
  ["app wont load", "problems"],
  ["report a bug", "problems"],
  ["keyboard shortcuts", "keyboard"],
  ["lost my views", "saved-data"],
  ["privacy", "about-legal"],
  ["windows protected your pc", "install"],
  ["how do i install it", "install"],
  ["restart now or later", "update-ready"],
  ["player no longer in fpl", "left-fpl"],
  ["my tile was renamed", "left-fpl"],
  // Words still being typed, and wildcards
  ["capt", "best-draft"],
  ["notep", "notepad"],
  ["forec*", "fixture-forecast"],
  // Statistics, by name: the Statistics guide first
  ["bps", "statistics"],
  ["pts/£m", "statistics"],
  ["what is ict", "statistics"],
  ["ppg", "statistics"],
];

describe("Help finds the right guide first", () => {
  it.each(QUESTIONS)("%s → %s", (question, id) => {
    expect(top(question)).toBe(id);
  });
});

describe("show all to show none", () => {
  it("lists guides from the first letters typed", () => {
    for (const prefix of ["ic", "ico", "icon", "icons"]) expect(ids(prefix), prefix).toContain("icons");
    expect(ids("x").length).toBeGreaterThan(0);
  });

  it("each letter of a word narrows the list, never widens it", () => {
    for (const word of ["captain", "fixtures", "stopwatch"]) {
      let previous = guides.map((g) => g.id);
      for (let n = 1; n <= word.length; n++) {
        const typed = word.slice(0, n);
        if (questionTokens(typed).length === 0) continue;
        const now = ids(typed);
        // Only a typo match (from 5 letters) can bring a guide in late.
        if (n < 5) for (const id of now) expect(previous, `${typed} → ${id}`).toContain(id);
        previous = now;
      }
    }
  });

  it("a question of filler words alone isn't a question yet", () => {
    expect(questionTokens("why is the")).toEqual([]);
  });

  it("finds nothing for words no guide uses", () => {
    expect(ids("zebra crossing")).toEqual([]);
  });
});

describe("helpWords", () => {
  it("folds plurals, endings, accents and synonyms into one word", () => {
    expect(helpWords("Colours")).toEqual(helpWords("colour"));
    expect(helpWords("color")).toEqual(helpWords("colour"));
    expect(helpWords("selling")).toEqual(helpWords("sell"));
    expect(helpWords("orange")).toEqual(helpWords("amber"));
    expect(helpWords("stats")).toEqual(helpWords("statistic"));
    expect(helpWords("Ødegaard")).toEqual(["odegaard"]);
  });
});

describe("the guides", () => {
  const all = guides.map((g) => g.id);

  it("have unique ids, and every related guide exists", () => {
    expect(new Set(all).size).toBe(all.length);
    for (const g of guides) for (const r of g.related ?? []) expect(all, `${g.id} → ${r}`).toContain(r);
  });

  it("keep the answer to one short line, and list plenty of words to be found by", () => {
    for (const g of HELP_GUIDES) {
      expect(g.answer.length, g.id).toBeLessThanOrEqual(120);
      expect(g.keywords.length, g.id).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("the Statistics guide", () => {
  const rows = sections.flatMap((s) => s.rows);

  it("gives every statistic its hover's meaning, without the hover's own heading", () => {
    const xg = rows.find((r) => r.name === "xG");
    expect(xg?.meaning).toMatch(/^Expected goals/);
    for (const r of rows) expect(r.meaning.startsWith(`${r.name}:`), r.id).toBe(false);
  });

  it("lists players and clubs under the Columns picker's headings", () => {
    expect(sections.map((s) => `${s.scope} · ${s.heading}`)).toContain("Players · FPL · Actual Output");
    expect(sections.some((s) => s.scope === "Clubs")).toBe(true);
  });

  it("is found by what a short name stands for", () => {
    expect(ids("points per million")).toContain("statistics");
    expect(ids("bonus points system")).toContain("statistics");
  });
});
