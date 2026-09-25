import type { NormalizedPlayer } from "../types/normalized";
import type { TeamAggregate } from "../metrics/teamStats";

/**
 * Shared player-name search, used everywhere a player search box exists
 * (Player Explorer's filter bar, Team Building's Add Players search,
 * and the PlayerSearch autocomplete used by Dashboard's Add Tile/Add Graph
 * modals, Player Comparison, and Player Trends) — one implementation so
 * "can I find this player" doesn't quietly depend on which page you're on.
 *
 * Beyond a plain substring check, this:
 * - Strips accents on both sides (Unicode NFD decomposition), so typing
 *   "joao" finds "João" and "odegaard" finds "Ødegaard" — genuinely the
 *   single biggest source of "I can't find this player" for a squad this
 *   international, and zero-risk (it only ever makes matching MORE
 *   permissive for characters that were never distinguishing typing
 *   intent in the first place).
 * - Splits the query into words (at spaces, dots, apostrophes and hyphens,
 *   exactly as names are split) and requires each one to appear
 *   somewhere across the player's display name, first name, and last
 *   name combined, in any order — so "fernandes bruno" and "bruno"
 *   alike find Bruno Fernandes, not just an exact ordered substring of
 *   whichever single field happens to contain it.
 * - Treats a one-letter word in the query as an initial: it must start one
 *   of the player's words ("b fernandes" / "B.Fernandes" find Bruno, not
 *   Gabriel Fernando de Jesus).
 * - Falls back to a small, length-scaled edit-distance check per word
 *   when a token isn't a plain substring of anything, so a minor typo
 *   ("haland" for Haaland, "plamer" for Palmer) still finds the player.
 *   Deliberately bounded — 0 tolerance below 5 characters, 1 up to 7, 2
 *   beyond that — so this stays a typo-correction, not a loose enough
 *   net to start matching unrelated short names.
 */
export function matchesPlayerSearch(player: NormalizedPlayer, query: string): boolean {
  return matchesWords(playerSearchWords(player), query);
}

function matchesWords(words: string[], query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const tokens = q.split(WORD_SEPARATORS).filter(Boolean);
  const haystack = words.join(" ");
  return tokens.every((token) =>
    // A lone letter is an initial ("B" of "B.Fernandes"): it has to start a
    // word, or it would match any name containing that letter.
    token.length === 1 ? words.some((w) => w.startsWith(token)) : haystack.includes(token) || words.some((w) => fuzzyWordMatch(token, w)),
  );
}

/** Team Explorer's "Team name…" search — the same accent-stripping, any-order, typo-tolerant word matching as players, over the club's name and short name ("man utd" and "mun" both find Man Utd; "forest" finds Nott'm Forest). */
export function matchesTeamSearch(team: Pick<TeamAggregate, "name" | "shortName">, query: string): boolean {
  return matchesWords(normalizeSearchText(`${team.name} ${team.shortName}`).split(WORD_SEPARATORS).filter(Boolean), query);
}

/** Splits both names and the query, so a name typed as FPL displays it ("B.Fernandes", "O'Brien") breaks into the same words the player's name does. Curly apostrophes count too, so a name pasted from a web page ("O’Riley") still matches. */
const WORD_SEPARATORS = /[\s.'’‘ʼ-]+/;

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * A handful of Latin letters aren't accented forms of a base letter under
 * Unicode's own rules — they're distinct letters in their language of origin
 * (Norwegian Ø, Polish Ł, Icelandic Þ/Ð, French Æ/Œ, German ß) — so NFD
 * decomposition leaves them untouched instead of splitting them into a base
 * letter plus a combining mark. Mapped by hand here so e.g. "odegaard"
 * still finds "Ødegaard".
 */
const SPECIAL_LETTER_MAP: Record<string, string> = {
  ø: "o",
  Ø: "o",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
  ß: "ss",
};
const SPECIAL_LETTERS = new RegExp(`[${Object.keys(SPECIAL_LETTER_MAP).join("")}]`, "g");

function normalizeSearchText(s: string): string {
  return s
    .replace(SPECIAL_LETTERS, (ch) => SPECIAL_LETTER_MAP[ch])
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // strip combining marks left behind by NFD decomposition, e.g. "é" -> "e"
    .toLowerCase()
    .trim();
}

function playerSearchWords(player: NormalizedPlayer): string[] {
  const combined = `${player.name} ${player.firstName} ${player.lastName}`;
  return normalizeSearchText(combined)
    .split(WORD_SEPARATORS)
    .filter(Boolean);
}

/** Max edit distance treated as "probably a typo" for a word of this length — scales up for longer words, 0 (exact/substring only) below 5 characters to avoid false-positives among short names. */
function fuzzyThreshold(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  return 2;
}

function fuzzyWordMatch(token: string, word: string): boolean {
  const threshold = fuzzyThreshold(Math.max(token.length, word.length));
  if (threshold === 0) return false;
  if (Math.abs(token.length - word.length) > threshold) return false;
  return damerauLevenshteinDistance(token, word) <= threshold;
}

/**
 * Levenshtein edit distance plus adjacent-transposition as a single edit
 * (Damerau-Levenshtein, optimal string alignment variant) — swapping two
 * adjacent letters ("plamer" for "palmer") is one of the single most
 * common typing typos, and counts as 2 edits under plain Levenshtein,
 * which pushed it outside the fuzzy threshold for exactly the names it's
 * meant to rescue.
 */
function damerauLevenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[rows - 1][cols - 1];
}
