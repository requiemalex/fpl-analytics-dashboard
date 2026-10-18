import { describe, expect, it } from "vitest";
import { nameScore, nameTokens, similarity } from "./names.js";

describe("similarity", () => {
  // Reference values from Python's difflib.SequenceMatcher(None, a, b).ratio(),
  // which the tested prototype used — the port must give the same numbers.
  it.each([
    ["yarmoliuk", "yarmolyuk", 0.888889],
    ["son heung min", "heung min son", 0.692308],
    ["gabriel dos santos magalhaes", "gabriel martinelli", 0.478261],
    ["jean matteo bahoya", "jean negoce", 0.482759],
    ["abcd", "bcda", 0.75],
    ["kadioglu", "kadioglu", 1],
  ])("%s / %s", (a, b, expected) => {
    expect(similarity(a, b)).toBeCloseTo(expected, 5);
  });
});

describe("nameTokens", () => {
  it("strips accents and special letters, splits hyphens", () => {
    expect(nameTokens("Đorđe Petrović")).toEqual(["dorde", "petrovic"]);
    expect(nameTokens("Ferdi Kadıoğlu")).toEqual(["ferdi", "kadioglu"]);
    expect(nameTokens("Martin Ødegaard")).toEqual(["martin", "odegaard"]);
    expect(nameTokens("Brooke Norton-Cuffy")).toEqual(["brooke", "norton", "cuffy"]);
    expect(nameTokens("N'Golo Kanté")).toEqual(["ngolo", "kante"]);
  });
});

describe("nameScore", () => {
  const fpl = (first: string, second: string, web: string) => ({ first, second, web });

  it("scores an Understat short name inside FPL's full name highly", () => {
    expect(nameScore(fpl("Gabriel", "dos Santos Magalhães", "Gabriel"), "Gabriel")).toBeGreaterThanOrEqual(0.95);
    expect(nameScore(fpl("Rodrigo", "Hernandez", "Rodri"), "Rodri")).toBeGreaterThanOrEqual(0.9);
    expect(nameScore(fpl("Moisés", "Caicedo Corozo", "Caicedo"), "Moisés Caicedo")).toBeGreaterThanOrEqual(0.95);
  });

  it("copes with nicknames, name order and spelling", () => {
    expect(nameScore(fpl("Matty", "Cash", "Cash"), "Matthew Cash")).toBeGreaterThanOrEqual(0.75);
    expect(nameScore(fpl("Son", "Heung-min", "Son"), "Son Heung-Min")).toBeGreaterThanOrEqual(0.95);
    expect(nameScore(fpl("Hwang", "Hee-chan", "Hwang"), "Hee-Chan Hwang")).toBeGreaterThanOrEqual(0.95);
    expect(nameScore(fpl("Yehor", "Yarmoliuk", "Yarmoliuk"), "Yehor Yarmolyuk")).toBeGreaterThanOrEqual(0.75);
  });

  it("doesn't pretend a genuinely different name matches (the fingerprint has to do that)", () => {
    expect(nameScore(fpl("Jean-Mattéo", "Bahoya", "Bahoya"), "Jean Négoce")).toBeLessThan(0.75);
  });
});
