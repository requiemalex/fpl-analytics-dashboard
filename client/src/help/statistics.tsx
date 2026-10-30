import React from "react";
import { clubColumnHint, playerColumnHint } from "../components/hoverText";
import { fplHeading } from "../components/MenuControls";
import { PLAYER_COLUMNS } from "../components/playerColumns";
import { TEAM_COLUMNS } from "../components/teamColumns";
import type { ExternalStatsSource } from "../extensions/externalStats";
import { helpWords, matchesAny, questionTokens } from "./search";
import { TOPIC } from "./topics";
import type { HelpGuide } from "./types";

/**
 * <help_statistics>: the Statistics guide — every statistic in one list,
 * under the Columns picker's own headings, each with the meaning its
 * column's hover gives (components/hoverText.ts), so Help says what the
 * hovers say. Typing narrows the list to the statistics named, from the
 * first letters (show all to show none, <help_search>); a question that
 * names none shows them all.
 */

/** What a short name stands for, so "expected goals" finds xG and "bonus" finds BPS. */
const EXPANSIONS: Record<string, string[]> = {
  xg: ["expected goals"],
  xa: ["expected assists"],
  xgi: ["expected goal involvements"],
  xgc: ["expected goals conceded"],
  xga: ["expected goals against"],
  xgd: ["expected goal difference"],
  npxg: ["non-penalty xg", "non penalty expected goals"],
  npxga: ["non-penalty xg against"],
  npxgi: ["non-penalty xgi"],
  np: ["non-penalty"],
  dc: ["defensive contributions"],
  bps: ["bonus points system"],
  ict: ["influence creativity threat"],
  cbi: ["clearances blocks interceptions"],
  ppda: ["pressing", "press"],
  xpts: ["expected points"],
  pts: ["points"],
  ppg: ["points per game"],
  "own%": ["ownership", "owned", "selected by"],
  "£m": ["per million", "value for money"],
  gd: ["goal difference"],
  cs: ["clean sheets"],
  pen: ["penalty", "penalties"],
  fk: ["free kick", "free kicks"],
  mins: ["minutes"],
};

export interface HelpStatRow {
  id: string;
  name: string;
  meaning: string;
  /** What the row is searched by: its name, its column key in words, and what its short name stands for. */
  terms: string[];
  /** The terms as the search compares them. */
  words: Set<string>;
}

export interface HelpStatSection {
  scope: "Players" | "Clubs";
  heading: string;
  /** The heading's source colour class, as the Columns picker colours it. */
  className: string;
  rows: HelpStatRow[];
}

/** "pointsPerMillion" → "points per million". */
function splitKey(key: string): string {
  return key
    .replace(/^us\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/** The meaning in a column's hover ("xG: Expected goals…\nLower is better."), without its "Source · Label:" head; null with no meaning to give. */
function meaningOf(hint: string): string | null {
  const [first, ...rest] = hint.split("\n");
  const at = first.indexOf(": ");
  if (at < 0) return null;
  return [first.slice(at + 2), ...rest].join(" ");
}

function searchTerms(label: string, key: string): string[] {
  const out = new Set<string>([label, splitKey(key)]);
  for (const w of label.toLowerCase().split(/[\s/()·−-]+/).filter(Boolean)) for (const e of EXPANSIONS[w] ?? []) out.add(e);
  if (/\/game/i.test(label)) out.add("per game");
  return [...out];
}

type Col = { key: string; label: string; higherIsBetter?: boolean; varies?: boolean };

function section(scope: HelpStatSection["scope"], heading: string, className: string, cols: Col[], hint: (c: Col) => string): HelpStatSection {
  const rows: HelpStatRow[] = [];
  for (const c of cols) {
    const meaning = meaningOf(hint(c));
    if (!meaning) continue;
    const terms = searchTerms(c.label, c.key);
    rows.push({ id: `${scope}|${heading}|${c.key}`, name: c.label, meaning, terms, words: new Set(terms.flatMap(helpWords)) });
  }
  return { scope, heading, className, rows };
}

function groupBy<C extends { group: string }>(cols: C[]): [string, C[]][] {
  const groups = new Map<string, C[]>();
  for (const c of cols) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  return [...groups];
}

/** Every statistic, players then clubs: FPL's under its picker headings, then a second source's (its own groups, and its versions of FPL's figures). */
export function helpStatSections(ext: ExternalStatsSource | null): HelpStatSection[] {
  const sections: HelpStatSection[] = [];
  const scopes = [
    { scope: "Players" as const, fpl: PLAYER_COLUMNS, ext: ext?.playerColumns("lastSeason"), hint: playerColumnHint },
    { scope: "Clubs" as const, fpl: TEAM_COLUMNS, ext: ext?.teamColumns("lastSeason"), hint: clubColumnHint },
  ];
  for (const s of scopes) {
    for (const [group, cols] of groupBy<Col & { group: string }>(s.fpl)) sections.push(section(s.scope, fplHeading(group), "col-source-fpl", cols, (c) => s.hint(c)));
    if (ext && s.ext) {
      const external = (c: Col) => s.hint(c, { sourceLabel: ext.label });
      const alternates = Object.values(s.ext.alternates) as Col[];
      if (alternates.length > 0) sections.push(section(s.scope, `FPL & ${ext.label}`, "col-source-crossover", alternates, external));
      for (const g of s.ext.groups) sections.push(section(s.scope, g.heading, ext.className, g.columns as Col[], external));
    }
  }
  return sections.filter((x) => x.rows.length > 0);
}

/** The list, narrowed to the statistics the question names — all of them when it names none. */
export function StatisticsList({ sections, question }: { sections: HelpStatSection[]; question: string }) {
  const tokens = questionTokens(question);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  let shown = tokens.length === 0 ? sections : sections.map((s) => ({ ...s, rows: s.rows.filter((r) => matchesAny(tokens, r.words)) })).filter((s) => s.rows.length > 0);
  if (shown.length === 0) shown = sections;
  const count = shown.reduce((n, s) => n + s.rows.length, 0);
  return (
    <div className="help-stats">
      {count < total && (
        <div className="help-label">
          {count} of {total}
        </div>
      )}
      {(["Players", "Clubs"] as const).map((scope) => {
        const own = shown.filter((s) => s.scope === scope);
        if (own.length === 0) return null;
        return (
          <div className="help-stats-scope" key={scope}>
            <h4 className="help-stats-scope-title">{scope}</h4>
            {own.map((s) => (
              <div key={s.heading}>
                <div className={`help-stats-heading source-coloured ${s.className}`}>{s.heading}</div>
                <table className="help-terms">
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** The Statistics guide, found by "stats" and the like, and by any statistic's name (which, typed alone, puts it first). */
export function statisticsGuide(sections: HelpStatSection[]): HelpGuide {
  const rows = sections.flatMap((s) => s.rows);
  return {
    id: "statistics",
    topic: TOPIC.numbers,
    title: "Statistics",
    answer: "Every statistic in the app and what it measures. Type a name to find one.",
    keywords: [
      "stats", "statistics", "statistic", "metrics", "columns", "column meanings", "definitions", "definition", "glossary",
      "abbreviations", "abbreviation", "stands for", "jargon", "terms", "acronyms", "dictionary", "list of stats", "all stats",
      "stat names", "what stats",
      ...new Set(rows.flatMap((r) => r.terms)),
    ],
    names: [...new Set(rows.map((r) => r.name))],
    related: ["hover", "per-game"],
    body: (question: string) => <StatisticsList sections={sections} question={question} />,
  };
}
