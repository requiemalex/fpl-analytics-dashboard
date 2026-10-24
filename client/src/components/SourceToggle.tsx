import React from "react";
import { MenuGroupHeading } from "./MenuControls";
import type { ExternalStatsSource } from "../extensions/externalStats";

/**
 * The FPL / second-source switch on a column header, for a figure both
 * sources have but disagree on (xG, assists, minutes…; see
 * extensions/externalStats.ts). Defaults to FPL. The header's own colour
 * says which source is showing (green FPL, the source's own when switched);
 * the icon is always the crossover colour, the same as the Columns
 * picker's heading for these figures: two arrows swapping places, with
 * hover text naming both sources. The one toggle for this everywhere
 * (<same_toggle_everywhere>): the Explorers' headers, the profiles' Match
 * Logs, Dashboard tiles and graphs, and Player Comparison cards.
 */
export function SourceToggle({
  showingExternal,
  externalLabel,
  onToggle,
  figure = "figure",
}: {
  showingExternal: boolean;
  externalLabel: string;
  onToggle: () => void;
  /** What it switches, where no header beside it says so (a Dashboard card, an Outputs row): "xG", "xG and xA". */
  figure?: string;
}) {
  const label = showingExternal ? `Showing ${externalLabel}'s ${figure} · Click to show FPL's` : `Showing FPL's ${figure} · Click to show ${externalLabel}'s`;
  return (
    <button
      type="button"
      className={`source-toggle${showingExternal ? " on" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={showingExternal}
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <SourceSwapIcon size={12} />
    </button>
  );
}

/** Two arrows swapping places: a figure both sources have. */
export function SourceSwapIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The Columns picker's heading over the figures both sources have (the
 * ones with a ⇄ toggle), in the crossover colour — between the green FPL
 * headings and the second source's own.
 */
export function CrossoverGroupHeading({ externalLabel }: { externalLabel: string }) {
  return <MenuGroupHeading group="crossover" label={`FPL & ${externalLabel}`} icon={<SourceSwapIcon />} className="col-source-crossover" />;
}

/** A small marker on a second source's column headers when its figures are out of date or couldn't be loaded — the reason is its hover text. */
export function SourceStaleMarker({ note }: { note: string }) {
  return <span className="source-stale-marker" title={note} aria-label={note} role="img" />;
}

/**
 * A Dashboard or Player Comparison card's mark that some or all of its
 * figures are a second source's: the source's icon in its colour, its hover
 * naming the figures ("Understat's figures: xG, Key Passes"), and the stale
 * marker beside it when they're out of date or couldn't be loaded.
 */
export function SourceBadge({ source, figures }: { source: Pick<ExternalStatsSource, "label" | "className" | "icon" | "staleNote">; figures: string[] }) {
  const note = `${source.label}'s figures: ${figures.join(", ")}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span className={`source-badge source-coloured ${source.className}`} title={note} aria-label={note} role="img">
        {source.icon}
      </span>
      {source.staleNote && <SourceStaleMarker note={source.staleNote} />}
    </span>
  );
}

/**
 * <card_source_mark>: where a Dashboard or Player Comparison card's
 * figures come from, shown by its title's colour, the colour index the
 * Explorers' headers and the profiles' section headings use: green when
 * every figure on it is FPL's, the second source's own colour when every
 * one is that source's, the crossover colour when it shows both (an FPL
 * axis against an Understat one). A figure both sources have counts as
 * whichever its ⇄ is showing, as a switched Explorer header turns violet.
 * The title's hover names each source's figures.
 */
export interface CardSource {
  className: string;
  note: string;
}

export function cardSource(items: { source: Pick<ExternalStatsSource, "label" | "className"> | null; figure: string }[]): CardSource | undefined {
  if (items.length === 0) return undefined;
  const names = (list: typeof items) => [...new Set(list.map((i) => i.figure))].join(", ");
  const fpl = items.filter((i) => !i.source);
  const external = items.filter((i) => i.source);
  const parts: string[] = [];
  if (fpl.length > 0) parts.push(`FPL's figures: ${names(fpl)}`);
  if (external.length > 0) parts.push(`${external[0].source!.label}'s figures: ${names(external)}`);
  const className = external.length === 0 ? "col-source-fpl" : fpl.length === 0 ? external[0].source!.className : "col-source-crossover";
  return { className, note: parts.join(" · ") };
}

/** A card's title, coloured by where its figures come from (<card_source_mark>) when that's given. */
export function CardTitle({ title, source, style }: { title: string; source?: CardSource; style?: React.CSSProperties }) {
  return (
    <div className={source ? `card-title source-coloured ${source.className}` : "card-title"} style={style} title={source?.note}>
      {title}
    </div>
  );
}
