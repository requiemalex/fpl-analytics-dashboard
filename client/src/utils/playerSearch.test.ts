import { describe, it, expect } from "vitest";
import { matchesPlayerSearch } from "./playerSearch";
import { makePlayer } from "../test/fixtures";

// Real 2026/27 names from bootstrap-static (web_name, first_name, second_name).
const ODEGAARD = makePlayer({ id: 1, position: "MID", name: "Ødegaard", firstName: "Martin", lastName: "Ødegaard" });
const BRUNO = makePlayer({ id: 2, position: "MID", name: "B.Fernandes", firstName: "Bruno", lastName: "Borges Fernandes" });
const MATEUS = makePlayer({ id: 3, position: "MID", name: "Fernandes", firstName: "Mateus", lastName: "Fernandes" });
const GUSTAVO = makePlayer({ id: 4, position: "FWD", name: "Nunes", firstName: "Gustavo", lastName: "Nunes Fernandes Gomes" });
const HAALAND = makePlayer({ id: 5, position: "FWD", name: "Haaland", firstName: "Erling", lastName: "Haaland" });
const RICE = makePlayer({ id: 6, position: "MID", name: "Rice", firstName: "Declan", lastName: "Rice" });
// "fernandes" is within typo distance of "fernando", and "gabriel" contains a "b".
const JESUS = makePlayer({ id: 7, position: "FWD", name: "G.Jesus", firstName: "Gabriel Fernando", lastName: "de Jesus" });
const PLAYERS = [ODEGAARD, BRUNO, MATEUS, GUSTAVO, HAALAND, RICE, JESUS];

const find = (q: string) => PLAYERS.filter((p) => matchesPlayerSearch(p, q)).map((p) => p.name);

describe("matchesPlayerSearch — the behaviour the User Guide promises", () => {
  it("an empty or blank query matches everyone", () => {
    expect(find("")).toHaveLength(PLAYERS.length);
    expect(find("   ")).toHaveLength(PLAYERS.length);
  });

  it("is accent-insensitive, including letters NFD doesn't split (Ø)", () => {
    expect(find("odegaard")).toEqual(["Ødegaard"]);
    expect(find("ØDEGAARD")).toEqual(["Ødegaard"]);
  });

  it("matches first and last name in any order", () => {
    expect(find("fernandes bruno")).toEqual(["B.Fernandes"]);
    expect(find("bruno fernandes")).toEqual(["B.Fernandes"]);
  });

  it("tolerates a small typo on a longer name", () => {
    expect(find("haalnd")).toEqual(["Haaland"]);
  });

  it("has no typo tolerance on short words, so short names don't match loosely", () => {
    expect(find("rica")).toEqual([]);
    expect(find("rice")).toEqual(["Rice"]);
  });

  it("L5: typing a displayed name with its dot ('B.Fernandes') finds only that player", () => {
    expect(find("B.Fernandes")).toEqual(["B.Fernandes"]);
  });

  it("L5: a one-letter word is an initial — it must start one of the player's words", () => {
    expect(find("b fernandes")).toEqual(["B.Fernandes"]);
    expect(find("g.jesus")).toEqual(["G.Jesus"]);
    expect(find("e")).toEqual(["Haaland"]);
  });
});

describe("matchesPlayerSearch — curly apostrophes (audit 2026-09-25)", () => {
  const ORILEY = makePlayer({ id: 8, position: "MID", name: "O'Riley", firstName: "Matt", lastName: "O'Riley" });
  it("a name pasted with a curly apostrophe ('O’Riley') finds the same player as the straight one", () => {
    expect(matchesPlayerSearch(ORILEY, "O’Riley")).toBe(true);
    expect(matchesPlayerSearch(ORILEY, "o'riley")).toBe(true);
    expect(matchesPlayerSearch(ORILEY, "O‘Riley")).toBe(true);
  });
});
