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

/**
 * <club_secondary_colour_table>: each club's real secondary/trim colour,
 * same legibility-first hand-picking as CLUB_COLORS above (a literal
 * near-black or near-white trim is swapped for a visible representative
 * shade). Exists so TeamBadge can show a two-colour swatch instead of one
 * flat pill — several Premier League clubs share a near-identical primary
 * (e.g. Arsenal/Nottingham Forest/Brentford are all red; Chelsea/Man City
 * are both blue), and the single-colour pill made those hard to tell
 * apart at a glance. Where two clubs are ALSO genuinely the same
 * secondary colour in real life (Aston Villa and West Ham are both
 * claret-and-blue; Aston Villa and Burnley are both claret-and-blue too),
 * the shade of that secondary is nudged apart deliberately — still
 * recognisably "that colour family", just not pixel-identical to the
 * other club wearing it.
 */
const CLUB_SECONDARY_COLORS: Record<string, string> = {
  ARS: "#F5F5F5", // Arsenal (white)
  AVL: "#5B9BD5", // Aston Villa (sky blue — nudged from West Ham's cyan below)
  BOU: "#6B6B6B", // Bournemouth (black trim, lightened)
  BRE: "#F5F5F5", // Brentford (white stripes)
  BHA: "#F5F5F5", // Brighton (white)
  BUR: "#2EC4B6", // Burnley (blue trim, shifted teal so it isn't Villa's blue)
  CAR: "#D71920", // Cardiff (red trim)
  CHE: "#F5F5F5", // Chelsea (white)
  CRY: "#1B458F", // Crystal Palace (navy stripe)
  EVE: "#F5F5F5", // Everton (white)
  FUL: "#707070", // Fulham (black trim, lightened)
  HUD: "#F2A93B", // Huddersfield (orange trim)
  HUL: "#707070", // Hull City (black trim, lightened)
  IPS: "#F5F5F5", // Ipswich (white)
  LEE: "#FFCD00", // Leeds (yellow/blue trim)
  LEI: "#FDB913", // Leicester (gold trim)
  LIV: "#E2B33C", // Liverpool (gold trim)
  LUT: "#1B458F", // Luton (navy)
  MCI: "#1B3E6F", // Man City (navy trim)
  MUN: "#D4AF37", // Man United (gold trim — keeps it apart from Bournemouth's red)
  NEW: "#8C8C8C", // Newcastle (black stripe, lightened)
  NFO: "#F2E9DC", // Nottingham Forest (white, warmed slightly off Arsenal's)
  NOR: "#00A650", // Norwich (green)
  QPR: "#F5F5F5", // QPR (white hoops)
  SHU: "#F5F5F5", // Sheffield United (white stripe)
  SOU: "#6B6B6B", // Southampton (black trim, lightened)
  STK: "#F5F5F5", // Stoke (white stripe)
  SUN: "#F5F5F5", // Sunderland (white stripe)
  SWA: "#707070", // Swansea (black trim, lightened)
  TOT: "#1B2A5E", // Tottenham (navy trim)
  WAT: "#ED2939", // Watford (red trim)
  WBA: "#F5F5F5", // West Brom (white stripe)
  WHU: "#4FC3E8", // West Ham (sky/cyan blue — nudged from Villa's steel blue)
  WOL: "#6B6B6B", // Wolves (black trim, lightened)
};

/**
 * Primary + secondary colour pair for TeamBadge's two-tone swatch. Falls
 * back to the same generated accent for both halves when a club isn't in
 * either table, so the swatch still renders (just as one flat colour)
 * rather than needing a third fallback path.
 */
export function teamDisplayColors(teamId: number, shortName: string): { primary: string; secondary: string } {
  const primary = teamDisplayColor(teamId, shortName);
  const secondary = CLUB_SECONDARY_COLORS[shortName] ?? primary;
  return { primary, secondary };
}
