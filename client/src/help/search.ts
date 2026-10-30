import { fuzzyWordMatch, normalizeSearchText } from "../utils/playerSearch";
import type { HelpEntry } from "./types";

/**
 * <help_search>: how a question finds its guides. No AI and nothing sent
 * anywhere — each guide lists the words people use for it, and a question
 * is scored against them:
 * - a guide's multi-word phrase found in the question ("my team") scores
 *   most, then a keyword (more when it's in the guide's title too), then
 *   a word of its title, then of its answer;
 * - a word still being typed matches as a prefix ("capt" finds captain;
 *   a trailing * does the same), and a typo matches through the player
 *   search's own edit-distance check ("avrage", "stopwach");
 * - words are compared stemmed ("colours" = "colour", "selling" = "sell")
 *   and through a few synonyms ("clock" = "stopwatch", "color" = "colour");
 * - filler words ("why", "is", "the") are ignored.
 * A statistic whose name is the whole question ("ppda") goes first.
 */

const STOP_WORDS = new Set(
  (
    "a an the is are am was were be been being do does did doing i im ive me my mine we us our you your it its this that these those he him his she her they them their " +
    "what whats why how hows when where which who whom whose can could should would will shall may might must of to in on for and or " +
    "with from at as by about into onto than then so if there here some any just also very really please want wanting need get got getting " +
    "show shows shown mean means meaning work works happen happens thing things one"
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

/** Kept whole (searched as typed): symbols and short tokens that mean something here. */
const KEEP = /[£%⇄—`]/;

/** Words almost every guide could mention: they count for little. */
const WEAK_WORDS = new Set(["fpl", "player", "scoutline", "app", "page", "figure", "number", "statistic"]);

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

interface IndexedEntry {
  entry: HelpEntry;
  phrases: string[];
  keywords: Set<string>;
  titleWords: Set<string>;
  answerWords: Set<string>;
  /** The whole title as one string: an exact-name match for a statistic. */
  title: string;
}

export interface HelpIndex {
  entries: IndexedEntry[];
}

function answerText(entry: HelpEntry): string {
  return entry.kind === "guide" ? entry.answer : [entry.player, entry.club].filter(Boolean).join(" ");
}

export function buildHelpIndex(entries: HelpEntry[]): HelpIndex {
  return {
    entries: entries.map((entry) => {
      const keywordWords = entry.keywords.map(helpWords);
      return {
        entry,
        phrases: keywordWords.filter((w) => w.length > 1).map((w) => w.join(" ")),
        keywords: new Set(keywordWords.flat()),
        titleWords: new Set(helpWords(entry.title).filter((w) => !STOP_WORDS.has(w))),
        answerWords: new Set(helpWords(answerText(entry)).filter((w) => !STOP_WORDS.has(w) && w.length > 2)),
        title: helpWords(entry.title).join(" "),
      };
    }),
  };
}

export interface HelpResult {
  entry: HelpEntry;
  score: number;
}

function startsAny(word: string, set: Set<string>): boolean {
  for (const w of set) if (w.length > word.length && w.startsWith(word)) return true;
  return false;
}

function fuzzyAny(word: string, set: Set<string>): boolean {
  for (const w of set) if (fuzzyWordMatch(word, w)) return true;
  return false;
}

/** The best matches for a question, best first; empty when nothing matches well enough. */
export function searchHelp(index: HelpIndex, query: string, limit = 8): HelpResult[] {
  const words = helpWords(query.replace(/\*/g, " "));
  const joined = ` ${words.join(" ")} `;
  const tokens = [...new Set(words.filter((w) => !STOP_WORDS.has(w)))];
  if (tokens.length === 0) return [];
  const results: HelpResult[] = [];

  for (const e of index.entries) {
    let score = 0;
    let covered = 0;
    for (const p of e.phrases) if (joined.includes(` ${p} `)) score += 3 * p.split(" ").length;
    for (const t of tokens) {
      const weight = WEAK_WORDS.has(t) ? 0.3 : 1;
      let s = 0;
      if (e.keywords.has(t)) s = e.entry.kind === "guide" && e.titleWords.has(t) ? 2.5 : 2;
      else if (e.titleWords.has(t)) s = 1.5;
      else if (t.length >= 3 && (startsAny(t, e.keywords) || startsAny(t, e.titleWords))) s = 1.2;
      else if (fuzzyAny(t, e.keywords) || fuzzyAny(t, e.titleWords)) s = 1.5;
      else if (e.answerWords.has(t)) s = 0.5;
      if (s > 0) covered++;
      score += s * weight;
    }
    // Its name alone, or barely more ("what is ppda"): not a longer question that happens to name it ("where are his shots from").
    if (e.entry.kind === "statistic" && e.title === tokens.join(" ") && words.length <= tokens.length + 2) score += 6;
    if (tokens.length > 1 && covered === tokens.length) score += 1;
    if (score >= (tokens.length === 1 ? 1.2 : 2)) results.push({ entry: e.entry, score });
  }

  return results
    .sort((a, b) => b.score - a.score || (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === "guide" ? -1 : 1))
    .slice(0, limit);
}
