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

/** FPL's mark: a football, pairing with a second source's own icon (Understat's goal frame). */
export function FplSourceIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.7 10.2 7.3 9.4 9.9H6.6L5.8 7.3Z" fill="currentColor" />
    </svg>
  );
}

type MarkItem = { source: Pick<ExternalStatsSource, "label" | "className" | "icon" | "staleNote"> | null; figure: string; crossover: boolean };

/**
 * <card_source_mark>: the first icon in a Dashboard or Player Comparison
 * card's header, one of three, as the pickers group the figures: FPL's
 * football (green) when every figure on it is FPL's own; the ⇄ (rose) when
 * it has a figure both sources have, or figures from both; the second
 * source's icon (its colour) when every figure is that source's own. A card
 * with its own ⇄ toggle (a tile, a graph, a radar, a trend graph) uses the
 * toggle as its ⇄ mark; elsewhere (an Outputs panel, whose rows have their
 * own) it's the same icon, not a button. Its hover names each source's
 * figures, and the stale dot follows it while any figure shown is the
 * second source's.
 */
export function SourceMark({ items, toggle }: { items: MarkItem[]; toggle?: { switched: boolean; onToggle: () => void; externalLabel: string } | null }) {
  const source = cardSource(items);
  if (!source) return null;
  const names = (list: MarkItem[]) => [...new Set(list.map((i) => i.figure))].join(", ");
  const external = items.filter((i) => i.source);
  const crossover = items.filter((i) => i.crossover);
  const both = crossover.length > 0 || (external.length > 0 && external.length < items.length);
  const note = crossover.length > 0 ? `${source.note} · In both sources: ${names(crossover)}` : source.note;
  const badge = (className: string, icon: React.ReactNode) => (
    <span className={`source-badge source-coloured ${className}`} title={note} aria-label={note} role="img">
      {icon}
    </span>
  );
  let mark: React.ReactNode;
  if (both && toggle && crossover.length > 0) {
    mark = (
      <SourceToggle
        showingExternal={toggle.switched}
        externalLabel={toggle.externalLabel}
        figure={crossover.map((i) => i.figure).join(" and ")}
        onToggle={toggle.onToggle}
      />
    );
  } else if (both) mark = badge("col-source-crossover", <SourceSwapIcon />);
  else if (external.length > 0) mark = badge(external[0].source!.className, external[0].source!.icon);
  else mark = badge("col-source-fpl", <FplSourceIcon />);
  const staleNote = external[0]?.source?.staleNote;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {mark}
      {staleNote && <SourceStaleMarker note={staleNote} />}
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
