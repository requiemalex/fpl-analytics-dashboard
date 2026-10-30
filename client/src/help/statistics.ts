import { clubColumnHint, playerColumnHint } from "../components/hoverText";
import { PLAYER_COLUMNS, type PlayerColumn } from "../components/playerColumns";
import { TEAM_COLUMNS, type TeamColumn } from "../components/teamColumns";
import type { ExternalStatsSource } from "../extensions/externalStats";
import type { HelpStatistic } from "./types";

/**
 * <help_statistic>: one Help entry per statistic, made from the columns
 * themselves — the name on the header, and the meaning its hover gives —
 * so every column is searchable by name ("ppda", "xgchain") and Help says
 * what the hovers say. A figure players and clubs both have ("xG") is one
 * entry with both meanings; a second source's version is its own entry.
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
  bps: ["bonus points system", "bonus"],
  ict: ["influence creativity threat"],
  cbi: ["clearances blocks interceptions"],
  ppda: ["pressing", "press"],
  xpts: ["expected points"],
  pts: ["points"],
  ppg: ["points per game"],
  own: ["ownership", "owned", "selected by"],
  "£m": ["per million", "value", "value for money"],
  gd: ["goal difference"],
  cs: ["clean sheets"],
  pen: ["penalty", "penalties"],
  fk: ["free kick", "free kicks"],
  mins: ["minutes"],
};

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

function keywordsFor(label: string, key: string): string[] {
  const words = label.toLowerCase().split(/[\s/()·−-]+/).filter(Boolean);
  const out = new Set<string>([label, splitKey(key)]);
  for (const w of words) for (const e of EXPANSIONS[w] ?? []) out.add(e);
  if (/\/game|per game/i.test(label)) out.add("per game");
  return [...out];
}

type Source = HelpStatistic["source"];

function add(map: Map<string, HelpStatistic>, source: Source, kind: "player" | "club", key: string, label: string, meaning: string | null) {
  if (!meaning) return;
  const id = `stat-${source ? source.label.toLowerCase() : "fpl"}-${label.toLowerCase()}`;
  const entry = map.get(id) ?? { id, title: label, player: null, club: null, source, keywords: [] };
  entry[kind] ??= meaning;
  entry.keywords = [...new Set([...entry.keywords, ...keywordsFor(label, key)])];
  map.set(id, entry);
}

/** Every statistic's entry: FPL's player and club columns, then a second source's (its own and its version of FPL's), when one is mounted. */
export function helpStatistics(ext: ExternalStatsSource | null): HelpStatistic[] {
  const map = new Map<string, HelpStatistic>();
  for (const c of PLAYER_COLUMNS) add(map, null, "player", c.key, c.label, meaningOf(playerColumnHint(c)));
  for (const c of TEAM_COLUMNS) add(map, null, "club", c.key, c.label, meaningOf(clubColumnHint(c)));
  if (ext) {
    const source = { label: ext.label, className: ext.className };
    const players = ext.playerColumns("lastSeason");
    const clubs = ext.teamColumns("lastSeason");
    const playerCols: PlayerColumn[] = [...players.groups.flatMap((g) => g.columns), ...Object.values(players.alternates)];
    const clubCols: TeamColumn[] = [...clubs.groups.flatMap((g) => g.columns), ...Object.values(clubs.alternates)];
    for (const c of playerCols) add(map, source, "player", c.key, c.label, meaningOf(playerColumnHint(c, { sourceLabel: ext.label })));
    for (const c of clubCols) add(map, source, "club", c.key, c.label, meaningOf(clubColumnHint(c, { sourceLabel: ext.label })));
  }
  return [...map.values()];
}
