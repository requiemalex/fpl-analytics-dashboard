const GOLDEN_ANGLE_DEG = 137.50776;

/**
 * A distinct, deterministic accent colour per team — generated, not
 * hand-picked from a lookup table. The app's team list isn't just the
 * current season's clubs (relegated/historic clubs from other seasons
 * appear too, e.g. in the Team filter and historic analysis), so a fixed
 * per-club palette would need constant upkeep and silently fall back to
 * nothing for any club it didn't cover. Rotating by the golden angle
 * instead guarantees well-separated hues for any sequence of team ids,
 * with no lookup table and no maintenance as the dataset grows. Same
 * saturation/lightness family as this app's position colours (--pos-*,
 * tokens.css) so team accents read as the same design system, just a
 * generated categorical set rather than four fixed tokens.
 *
 * Still used as the fallback in teamDisplayColor() below, for any club
 * CLUB_COLORS doesn't (yet) cover.
 */
export function teamAccentColor(teamId: number): string {
  const hue = (teamId * GOLDEN_ANGLE_DEG) % 360;
  return `hsl(${hue.toFixed(1)}, 72%, 62%)`;
}

/**
 * <club_colour_table>: a hand-picked colour per club, keyed by FPL's own
 * `short_name` — stable for a given club across seasons, unlike `team.id`
 * (just that season's fixture-list index, reassigned every year). Chosen
 * to read as that club's real primary/kit colour while staying legible
 * against this app's very dark background: a few clubs whose true primary
 * is itself very dark or near-black (Newcastle, several clubs' claret)
 * are represented by a lightened shade or their prominent trim colour
 * instead of the literal brand hex, since a near-black pill would just be
 * invisible here regardless of accuracy.
 *
 * Deliberately not exhaustive — only clubs that have appeared in the
 * Premier League in roughly the last decade are covered. Anything this
 * table doesn't have (an older historic club, or a newly promoted one not
 * yet added) falls back to teamAccentColor()'s generated colour via
 * teamDisplayColor() below, so nothing ever goes uncoloured — just less
 * recognisably "theirs" until this table is updated.
 */
const CLUB_COLORS: Record<string, string> = {
  ARS: "#EF0107", // Arsenal
  AVL: "#B3244C", // Aston Villa (claret, lightened)
  BOU: "#DA291C", // Bournemouth
  BRE: "#E30613", // Brentford
  BHA: "#0057B8", // Brighton
  BUR: "#A13565", // Burnley (claret, lightened)
  CAR: "#0070B5", // Cardiff
  CHE: "#1E63C9", // Chelsea (navy, brightened)
  CRY: "#C4122E", // Crystal Palace
  EVE: "#2647CC", // Everton (navy, brightened)
  FUL: "#FFFFFF", // Fulham
  HUD: "#1E7FD1", // Huddersfield
  HUL: "#F5A12E", // Hull City (amber trim)
  IPS: "#3A64A3", // Ipswich
  LEE: "#FFFFFF", // Leeds
  LEI: "#2F5FDB", // Leicester (navy, brightened)
  LIV: "#C8102E", // Liverpool
  LUT: "#F78F1E", // Luton
  MCI: "#6CABDD", // Man City
  MUN: "#DA291C", // Man United
  NEW: "#CFCFCF", // Newcastle (black/white -> light silver so it's visible on a dark bg)
  NFO: "#E4402C", // Nottingham Forest
  NOR: "#FFF200", // Norwich
  QPR: "#1D5BA4", // QPR
  SHU: "#EE2737", // Sheffield United
  SOU: "#D71920", // Southampton
  STK: "#E03A3E", // Stoke
  SUN: "#FF4438", // Sunderland
  SWA: "#FFFFFF", // Swansea
  TOT: "#FFFFFF", // Tottenham
  WAT: "#FBEE23", // Watford
  WBA: "#3A5FA0", // West Brom (navy, brightened)
  WHU: "#A83852", // West Ham (claret, lightened)
  WOL: "#FDB913", // Wolves
};

/**
 * A team's display colour for the coloured pill (TeamBadge): this club's
 * real (legibility-adjusted) colour from CLUB_COLORS when known, else the
 * generated per-id fallback above — callers never need to know which
 * source it came from.
 */
export function teamDisplayColor(teamId: number, shortName: string): string {
  return CLUB_COLORS[shortName] ?? teamAccentColor(teamId);
}
