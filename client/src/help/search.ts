import { fuzzyWordMatch, normalizeSearchText } from "../utils/playerSearch";
import type { HelpGuide } from "./types";

/**
 * <help_search>: how a question finds its guides. No AI and nothing sent
 * anywhere — each guide lists the words people use for it, and a question
 * is scored against them. Show all to show none (owner's rule,
 * 2026-10-30): with nothing typed every guide shows, and as letters are
 * typed the list narrows to the guides they still match — from the first
 * letter, with no score to reach first. Best first:
 * - a guide's multi-word phrase found in the question ("my team") scores
 *   most, then a keyword (more when it's in the guide's title too), then
 *   a word of its title, then of its answer;
 * - any word matches as the start of a guide's word ("ic" finds icons,
 *   "capt" captain; a trailing * does the same), and a typo matches through
 *   the player search's own edit-distance check ("avrage", "stopwach");
 * - words are compared stemmed ("colours" = "colour", "selling" = "sell")
 *   and through a few synonyms ("clock" = "stopwatch", "color" = "colour");
 * - filler words ("why", "is", "the") are ignored: a question of nothing
 *   else is no question yet, and every guide still shows.
 * A guide with `names` goes first when one is the whole question ("ppda").
 */

const STOP_WORDS = new Set(
  (
    "a an the is are am was were be been being do does did doing i im ive me my mine we us our you your it its this that these those he him his she her they them their " +
    "what whats why how hows when where which who whom whose can could should would will shall may might must of to in on for and or " +
    "with from at as by about into onto than then so if there here some any just also very really please want wanting need get got getting " +
    "show shows shown mean means meaning work works happen happens thing things one not no"
  ).split(" "),
);

/** Words people use for the same thing, folded into the word the guides use. */
const SYNONYMS: Record<string, string> = {
  color: "colour",
  colored: "coloured",
  colors: "colour",
  orange: "amber",
  clock: "stopwatch",
  timer: "stopwatch",
  purple: "violet",
  pink: "rose",
  gray: "grey",
  optimize: "optimise",
  avg: "average",
  pts: "point",
  pt: "point",
  mins: "minute",
  min: "minute",
  gw: "gameweek",
  gws: "gameweek",
  stat: "statistic",
  stats: "statistic",
  metric: "statistic",
  metrics: "statistic",
  wont: "not",
  cant: "not",
  dont: "not",
  doesnt: "not",
  isnt: "not",
  spreadsheet: "excel",
  tooltip: "hover",
  tooltips: "hover",
  mouseover: "hover",
  club: "team",
  clubs: "team",
};

/** Kept whole (searched as typed): symbols that mean something here. */
const KEEP = /[£%⇄—`]/;

/** Words almost every guide could mention: they count for little. */
const WEAK_WORDS = new Set(["fpl", "player", "scoutline", "app", "page", "figure", "number"]);

function stem(word: string): string {
  if (STOP_WORDS.has(word) || KEEP.test(word)) return word;
  if (SYNONYMS[word]) return SYNONYMS[word];
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  return SYNONYMS[w] ?? w;
}

/** A text as the search compares it: accents stripped, lower case, split into stemmed words. */
export function helpWords(text: string): string[] {
  return normalizeSearchText(text)
    .replace(/[−–]/g, "-")
    .replace(/[’']/g, "")
    .split(/[^a-z0-9£%⇄—`]+/)
    .filter(Boolean)
    .map(stem);
}

/** The words of a question that count: none means nothing's been asked yet, so everything shows. */
export function questionTokens(question: string): string[] {
  return [...new Set(helpWords(question.replace(/\*/g, " ")).filter((w) => !STOP_WORDS.has(w)))];
}

/** How well one word of a question matches a set of words: 2 the same, 1.2 the start of one, 1.5 a typo of one, 0 none. */
function wordScore(token: string, words: Set<string>): number {
  if (words.has(token)) return 2;
  for (const w of words) if (w.startsWith(token)) return 1.2;
  for (const w of words) if (fuzzyWordMatch(token, w)) return 1.5;
  return 0;
}

/** Whether any word of a question matches any of these words (exactly, as their start, or as a typo). */
export function matchesAny(tokens: string[], words: Set<string>): boolean {
  return tokens.some((t) => wordScore(t, words) > 0);
}

interface IndexedGuide {
  guide: HelpGuide;
  phrases: string[];
  keywords: Set<string>;
  titleWords: Set<string>;
  answerWords: Set<string>;
  names: Set<string>;
}

export interface HelpIndex {
  guides: IndexedGuide[];
}

export function buildHelpIndex(guides: HelpGuide[]): HelpIndex {
  return {
    guides: guides.map((guide) => {
      const keywordWords = guide.keywords.map(helpWords);
      return {
        guide,
        phrases: keywordWords.filter((w) => w.length > 1).map((w) => w.join(" ")),
        keywords: new Set(keywordWords.flat()),
        titleWords: new Set(helpWords(guide.title).filter((w) => !STOP_WORDS.has(w))),
        answerWords: new Set(helpWords(guide.answer).filter((w) => !STOP_WORDS.has(w) && w.length > 2)),
        names: new Set((guide.names ?? []).map((n) => helpWords(n).join(" "))),
      };
    }),
  };
}

export interface HelpResult {
  guide: HelpGuide;
  score: number;
}

/** Every guide the question matches, best first; empty when nothing's been asked (questionTokens) or nothing matches. */
export function searchHelp(index: HelpIndex, question: string): HelpResult[] {
  const words = helpWords(question.replace(/\*/g, " "));
  const joined = ` ${words.join(" ")} `;
  const tokens = questionTokens(question);
  if (tokens.length === 0) return [];
  const results: HelpResult[] = [];

  for (const e of index.guides) {
    let score = 0;
    let covered = 0;
    for (const p of e.phrases) if (joined.includes(` ${p} `)) score += 3 * p.split(" ").length;
    for (const t of tokens) {
      const weight = WEAK_WORDS.has(t) ? 0.3 : 1;
      let s = 0;
      if (e.keywords.has(t)) s = e.titleWords.has(t) ? 2.5 : 2;
      else if (e.titleWords.has(t)) s = 1.5;
      else s = Math.max(wordScore(t, e.keywords), wordScore(t, e.titleWords) * 0.9, e.answerWords.has(t) ? 0.5 : 0);
      if (s > 0 && weight === 1) covered++;
      score += s * weight;
    }
    // A name alone, or barely more ("what is ppda"): not a longer question that happens to include one ("where are his shots from").
    if (e.names.has(tokens.join(" ")) && words.length <= tokens.length + 2) score += 6;
    const strong = tokens.filter((t) => !WEAK_WORDS.has(t)).length;
    if (strong > 1 && covered === strong) score += 1;
    if (score > 0) results.push({ guide: e.guide, score });
  }

  return results.sort((a, b) => b.score - a.score);
}
