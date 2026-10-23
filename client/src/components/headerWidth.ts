import { MIN_COLUMN_WIDTH } from "../state/useColumnCustomization";

/** The header's side padding (components.css `table.data-table th`): 8px left, 22px right for the ▾ filter icon. */
const HEADER_PADDING = 8 + 22;
/** Room for rounding and a font drawn a touch wider than measured. */
const SAFETY = 1;

let context: CanvasRenderingContext2D | null | undefined;

/** Width of one header word as drawn: 11px, weight 600, uppercase, 0.04em letter-spacing (components.css). */
function wordWidth(word: string): number {
  const text = word.toUpperCase();
  if (context === undefined) {
    try {
      context = document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
  }
  // No canvas (tests): about 8px a character, the widest the header font draws on average.
  if (!context) return text.length * 8;
  context.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
  return context.measureText(text).width + 0.44 * text.length;
}

/**
 * <header_floor>: the narrowest a customisable table's column may get —
 * its header's longest word plus the header's padding, so the label never
 * runs under the ▾ filter icon (audit 2026-10-23 in-app: at 1366–1440px,
 * POINTS, GOALS, ASSISTS and PTS/£M did). Headers wrap between words
 * (`wrap-headers`), the sort arrow included, so only the longest word has
 * to fit. `extra` is anything that sits beside the label on one line (a
 * source toggle). Used by Player Explorer, Team Explorer and Team
 * Building's Add Players alike.
 */
export function headerMinWidth(label: string, extra = 0): number {
  const longest = Math.max(0, ...label.split(/\s+/).filter(Boolean).map(wordWidth));
  return Math.max(MIN_COLUMN_WIDTH, Math.ceil(longest + HEADER_PADDING + SAFETY + extra));
}
