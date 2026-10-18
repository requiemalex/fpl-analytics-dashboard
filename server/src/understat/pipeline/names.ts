/**
 * Name comparison for linking FPL players to Understat players. Names are
 * only ever one of two signals (see matcher.ts): a link is confirmed only
 * when a player's names AND match-by-match appearances agree, so this can
 * afford to be forgiving (accents, nicknames, full vs short names).
 */

const SPECIAL_LETTERS: Record<string, string> = {
  ø: "o",
  Ø: "o",
  ß: "ss",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  æ: "ae",
  Æ: "ae",
  ı: "i",
  œ: "oe",
  Œ: "oe",
};

/** "Đorđe Petrović" -> ["dorde", "petrovic"]: accents and punctuation stripped, hyphens split. */
export function nameTokens(name: string): string[] {
  const plain = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[øØßłŁđĐæÆıœŒ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/-/g, " ")
    .replace(/[^a-z ]+/g, " ");
  return plain.split(/\s+/).filter(Boolean);
}

/** Characters in common by Ratcliff/Obershelp (the measure Python's difflib uses): longest common run, then the same either side of it. */
function matchingCharacters(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  let bestLength = 0;
  let bestA = 0;
  let bestB = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > bestLength) {
          bestLength = current[j];
          bestA = i - bestLength;
          bestB = j - bestLength;
        }
      }
    }
    previous = current;
  }
  if (bestLength === 0) return 0;
  return (
    bestLength +
    matchingCharacters(a.slice(0, bestA), b.slice(0, bestB)) +
    matchingCharacters(a.slice(bestA + bestLength), b.slice(bestB + bestLength))
  );
}

/** 0–1 likeness of two strings (1 = identical). */
export function similarity(a: string, b: string): number {
  if (a.length + b.length === 0) return 1;
  return (2 * matchingCharacters(a, b)) / (a.length + b.length);
}

export interface FplName {
  first: string;
  second: string;
  web: string;
}

/**
 * 0–1: how well an Understat name fits an FPL player. A full match on the
 * Understat name's words inside FPL's full name ("Gabriel" inside "Gabriel
 * dos Santos Magalhães"), or FPL's short name inside Understat's, scores
 * 0.95; otherwise the best of word overlap and spelling likeness
 * ("Yarmoliuk" / "Yarmolyuk").
 */
export function nameScore(fpl: FplName, understatName: string): number {
  const full = nameTokens(`${fpl.first} ${fpl.second}`);
  const web = nameTokens(fpl.web);
  const us = nameTokens(understatName);
  if (us.length === 0) return 0;
  const fullSet = new Set(full);
  const usSet = new Set(us);
  const webSet = new Set(web);
  let best = 0;
  const usInFull = [...usSet].every((t) => fullSet.has(t));
  const webInUs = webSet.size > 0 && [...webSet].every((t) => usSet.has(t));
  if (usInFull || webInUs) best = 0.95;
  const shared = [...fullSet].filter((t) => usSet.has(t)).length;
  best = Math.max(best, (0.85 * shared) / Math.max(1, Math.min(fullSet.size, usSet.size)));
  best = Math.max(best, similarity(full.join(" "), us.join(" ")));
  best = Math.max(best, similarity(web.join(" "), us.join(" ")) * 0.95);
  const fplWords = [...new Set([...fullSet, ...webSet])];
  const perWord = [...usSet].map((u) => Math.max(0, ...fplWords.map((f) => similarity(u, f))));
  if (perWord.length > 0) best = Math.max(best, (0.9 * perWord.reduce((s, v) => s + v, 0)) / perWord.length);
  return Math.min(best, 1);
}
