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
  /** The heading it's listed under when browsing (help/topics.ts). */
  topic: string;
  /** The words and phrases people use for it: many, plain, misspellings left to the fuzzy match. */
  keywords: string[];
  /** Names that, typed on their own ("ppda"), put this guide first: the Statistics guide's statistics. */
  names?: string[];
  /** Listed first on these pages when nothing is typed. */
  pages?: HelpPage[];
  /** Ids of guides worth reading next. */
  related?: string[];
  /** Its content; a function gets the question, for a guide that narrows to it (the Statistics guide). */
  body: ReactNode | ((question: string) => ReactNode);
}
