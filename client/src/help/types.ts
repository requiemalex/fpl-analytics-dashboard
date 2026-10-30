import type { ReactNode } from "react";

/** The pages Help can put first (<help_this_page>), by route. Profiles open over any page, so their guides aren't tied to one. */
export type HelpPage = "dashboard" | "player-explorer" | "team-explorer" | "player-comparison" | "team-building";

/**
 * <help_guide>: one Help guide — a short answer to one question, found by
 * the words people use for it (help/search.ts). Text is kept to a minimum:
 * a one-line answer, then visuals and at most a few short points.
 */
export interface HelpGuide {
  /** Unique across every guide, a second source's included. */
  id: string;
  title: string;
  /** One line that answers the question on its own. */
  answer: string;
  /** The heading it's listed under when browsing. */
  topic: string;
  /** The words and phrases people use for it: many, plain, misspellings left to the fuzzy match. */
  keywords: string[];
  /** Listed first on these pages when nothing is typed. */
  pages?: HelpPage[];
  /** Ids of guides worth reading next. */
  related?: string[];
  body: ReactNode;
}

/**
 * <help_statistic>: a statistic's entry, made from its column's own hover
 * text (components/hoverText.ts), so Help says exactly what the app's
 * hovers say and can't drift from them.
 */
export interface HelpStatistic {
  id: string;
  title: string;
  /** What it measures, for a player and/or a club (its columns' hover text). */
  player: string | null;
  club: string | null;
  /** Null for FPL; a second source's label and header class otherwise. */
  source: { label: string; className: string } | null;
  keywords: string[];
}

export type HelpEntry = ({ kind: "guide" } & HelpGuide) | ({ kind: "statistic" } & HelpStatistic);
