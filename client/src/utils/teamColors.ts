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
/**
 * <red_cluster_fix>: eleven clubs here (ARS, BOU, BRE, CRY, LIV, MUN, NFO,
 * SHU, SOU, STK, SUN) share a near-identical red-family CLUB_COLORS primary
 * — that's the direct cause of a real reported bug where Arsenal/Man Utd/
 * Brentford (and others in that set) all read as "the same red" wherever a
 * team's colour is shown as text, not just a small swatch. Six of them
 * ALSO used to share the same neutral white/grey secondary, which didn't
 * help. Every one of those eleven now gets its own distinct, saturated hue
 * (spread across teal/green/blue/amber/pink/violet/tan) — same "nudged for
 * legibility, not necessarily the literal kit colour" precedent already
 * used below for Villa/Burnley/West Ham, just applied to a bigger cluster.
 * See teamIdentityColor() below for where this actually gets used as the
 * dominant colour, not just a thin swatch stripe.
 */
const CLUB_SECONDARY_COLORS: Record<string, string> = {
  ARS: "#F5F5F5", // Arsenal (white — kept; the one club in the red cluster that stays neutral)
  AVL: "#5B9BD5", // Aston Villa (sky blue — nudged from West Ham's cyan below)
  BOU: "#4A5A78", // Bournemouth (muted slate-blue — was grey, collided with Southampton's old grey)
  BRE: "#C4D94A", // Brentford (lime — was white, collided with Arsenal/Sheffield Utd/Stoke/Sunderland)
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
  LIV: "#2F9E6E", // Liverpool (jade green — was gold, too close to Man Utd's gold)
  LUT: "#1B458F", // Luton (navy)
  MCI: "#1B3E6F", // Man City (navy trim)
  MUN: "#D4AF37", // Man United (gold trim — keeps it apart from Bournemouth's red)
  NEW: "#8C8C8C", // Newcastle (black stripe, lightened)
  NFO: "#8FA24D", // Nottingham Forest (muted olive — was near-white, collided with Arsenal's)
  NOR: "#00A650", // Norwich (green)
  QPR: "#F5F5F5", // QPR (white hoops)
  SHU: "#6B8CAE", // Sheffield United (steel blue — was white, collided with Arsenal/Brentford/Stoke/Sunderland)
  SOU: "#D6598C", // Southampton (pink — was grey, collided with Bournemouth's old grey)
  STK: "#A6987A", // Stoke (sandy tan — was white, collided with Arsenal/Brentford/Sheffield Utd/Sunderland)
  SUN: "#8B5FBF", // Sunderland (violet — was white, collided with Arsenal/Brentford/Sheffield Utd/Stoke)
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

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return [parseInt(clean.substring(0, 2), 16), parseInt(clean.substring(2, 4), 16), parseInt(clean.substring(4, 6), 16)];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[mix(ar, br), mix(ag, bg), mix(ab, bb)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

type RGB = [number, number, number];

/**
 * A club's actual dominant/identity colour — the one thing that has to
 * carry differentiation between clubs at a glance, since it's used for
 * TeamBadge's text/border, not just a thin swatch stripe. Blending primary
 * toward secondary (rather than using primary alone) is what fixes the
 * <red_cluster_fix> problem above: eleven clubs share close to the same
 * primary red, but each now has its own distinct secondary, so the BLEND
 * ends up distinct per club even though the primary component doesn't.
 * Falls back to the plain generated accent for any club CLUB_COLORS
 * doesn't cover — teamAccentColor() already guarantees good hue separation
 * there via golden-angle rotation, so no blending is needed (or possible,
 * with no real secondary to blend toward).
 */
export function teamIdentityColor(teamId: number, shortName: string): string {
  const primary = CLUB_COLORS[shortName];
  if (!primary) return teamAccentColor(teamId);
  const secondary = CLUB_SECONDARY_COLORS[shortName] ?? primary;
  return mixHex(primary, secondary, 0.38);
}
