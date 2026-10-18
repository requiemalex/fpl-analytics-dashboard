import React, { useLayoutEffect, useRef, useState } from "react";
import { COMPARISON_GROUP_LABELS, COMPARISON_GROUP_ORDER } from "../../metrics/comparisonMetrics";
import type { ColumnGroup } from "../playerColumns";
import { ComparisonLegend, type LegendEntry } from "./ComparisonLegend";

export interface OutputsRow {
  key: string;
  label: string;
  group: ColumnGroup;
  higherIsBetter: boolean;
  format: (v: number | null) => string;
  /** Per player id: his figure. */
  cells: Map<number, number | null>;
  /** Per player id: what "best" ranks on, when that isn't his figure (a lower-is-better total ranks on its per-game rate; PlayerColumn.rankBy). */
  rankCells?: Map<number, number | null>;
}

/** The player to bold in a row: the best among the ranked players (those at or above the card's minimum minutes), when at least two have a figure and they differ. */
function bestPlayerIds(row: OutputsRow, ranked: LegendEntry[]): Set<number> {
  const source = row.rankCells ?? row.cells;
  const entries = ranked.map((e) => [e.player.id, source.get(e.player.id) ?? null] as const).filter((x): x is readonly [number, number] => x[1] !== null);
  if (entries.length < 2) return new Set();
  const values = entries.map(([, v]) => v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return new Set();
  const best = row.higherIsBetter ? max : min;
  return new Set(entries.filter(([, v]) => v === best).map(([id]) => id));
}

/** A figure's label above its marker is JetBrains Mono at 11.5px: every character 0.6em wide. */
const LABEL_CHAR_PX = 11.5 * 0.6;
const LABEL_PAD_PX = 4;
const LABEL_GAP_PX = 4;

/**
 * Where each figure's label sits along a track `width` px wide, as a left
 * edge in px: centred over its marker where there's room, nudged apart
 * where two would overlap (a run of crowded labels is spread evenly around
 * where its markers are), and kept inside the track.
 */
export function placeLabels(labels: { x: number; w: number }[], width: number): number[] {
  const order = labels.map((_, i) => i).sort((a, b) => labels[a].x - labels[b].x);
  type Run = { items: number[]; width: number; left: number };
  const runs: Run[] = [];
  const fit = (run: Run) => {
    // The run's best left edge: its labels as close to their markers as they can be, on average.
    let offset = 0;
    let sum = 0;
    for (const i of run.items) {
      sum += labels[i].x - (offset + labels[i].w / 2);
      offset += labels[i].w + LABEL_GAP_PX;
    }
    run.left = Math.max(0, Math.min(sum / run.items.length, width - run.width));
  };
  for (const i of order) {
    const run: Run = { items: [i], width: labels[i].w, left: 0 };
    fit(run);
    runs.push(run);
    while (runs.length > 1) {
      const last = runs[runs.length - 1];
      const prev = runs[runs.length - 2];
      if (prev.left + prev.width + LABEL_GAP_PX <= last.left) break;
      runs.splice(-2, 2, { items: [...prev.items, ...last.items], width: prev.width + LABEL_GAP_PX + last.width, left: 0 });
      fit(runs[runs.length - 1]);
    }
  }
  const lefts: number[] = [];
  for (const run of runs) {
    let left = run.left;
    for (const i of run.items) {
      lefts[i] = left;
      left += labels[i].w + LABEL_GAP_PX;
    }
  }
  return lefts;
}

/** The width of the panel's tracks in px (every row's track is the same column); 0 until laid out. */
function useTrackWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const track = ref.current?.querySelector<HTMLElement>(".cmp-outputs-track");
    if (!track) return;
    const measure = () => setWidth(track.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface Mark {
  entry: LegendEntry;
  value: number;
  /** Share of the track, 0–100. */
  pct: number;
  /** A small-sample figure past the leader, pinned to the end of the track. */
  beyond: boolean;
}

/**
 * Each metric as a row: one bar running from 0 to the highest figure among
 * the compared players, with each player's marker at their own figure and
 * the figure itself above it — so the gaps are to scale (239 vs 177
 * points: the leader's marker at the end, the other about three quarters
 * along). The stretch every ranked player reaches is a neutral fill; each
 * stretch past that is tinted in the colour of the player whose marker ends
 * it, so a tinted length is how far that player is ahead of the one before.
 * Every row has its own scale, since its units differ; the faint notches
 * are a quarter, half and three quarters of the leader. The best figure is
 * bold. A player under the card's minimum minutes (the fixed floor on the
 * Starter view) gets a hollow grey marker and a grey figure: he doesn't
 * set the scale, tint the bar or get the bold. The key underneath names
 * the colours, as under a radar.
 */
export function ComparisonOutputs({ rows, entries }: { rows: OutputsRow[]; entries: LegendEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const trackWidth = useTrackWidth(ref);
  const ranked = entries.filter((e) => !e.smallSampleNote);
  const groups = COMPARISON_GROUP_ORDER.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) })).filter((g) => g.rows.length > 0);
  return (
    <>
      <div ref={ref} className="cmp-outputs">
        {groups.map(({ group, rows: groupRows }) => (
          <React.Fragment key={group}>
            <div className="cmp-outputs-group">{COMPARISON_GROUP_LABELS[group]}</div>
            {groupRows.map((row) => (
              <OutputsTrackRow key={row.key} row={row} entries={entries} ranked={ranked} trackWidth={trackWidth} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <ComparisonLegend entries={entries} />
    </>
  );
}

function OutputsTrackRow({ row, entries, ranked, trackWidth }: { row: OutputsRow; entries: LegendEntry[]; ranked: LegendEntry[]; trackWidth: number }) {
  const best = bestPlayerIds(row, ranked);
  const rankedFigures = ranked.map((e) => row.cells.get(e.player.id) ?? null).filter((v): v is number => v !== null);
  // Only when no ranked player has a figure here do the small samples set the scale.
  const scaleFigures = rankedFigures.length > 0 ? rankedFigures : entries.map((e) => row.cells.get(e.player.id) ?? null).filter((v): v is number => v !== null);
  const leader = Math.max(0, ...scaleFigures);

  const marks: Mark[] = [];
  for (const entry of entries) {
    const value = row.cells.get(entry.player.id) ?? null;
    if (value === null) continue;
    const share = leader > 0 ? Math.max(0, value) / leader : 0;
    marks.push({ entry, value, pct: Math.min(1, share) * 100, beyond: share > 1 });
  }

  // The bar's stretches: 0 to the lowest ranked figure is shared; each step up belongs to the player who reaches it.
  const rankedMarks = marks.filter((m) => !m.entry.smallSampleNote).sort((a, b) => a.pct - b.pct);
  const segments: { from: number; to: number; color: string | null; key: string }[] = [];
  let from = 0;
  rankedMarks.forEach((m, i) => {
    if (m.pct > from) segments.push({ from, to: m.pct, color: i === 0 ? null : m.entry.color, key: `${m.entry.player.id}` });
    from = Math.max(from, m.pct);
  });

  const labelTexts = marks.map((m) => row.format(m.value) + (m.beyond ? " ▸" : ""));
  const lefts =
    trackWidth > 0
      ? placeLabels(
          marks.map((m, i) => ({ x: (m.pct / 100) * trackWidth, w: labelTexts[i].length * LABEL_CHAR_PX + LABEL_PAD_PX })),
          trackWidth,
        )
      : null;

  // Small samples drawn first, so a ranked marker sitting on the same spot stays on top.
  const drawOrder = [...marks].sort((a, b) => Number(!a.entry.smallSampleNote) - Number(!b.entry.smallSampleNote));

  return (
    <div className="cmp-outputs-row">
      <span className="cmp-outputs-label">{row.label}</span>
      <span className="cmp-outputs-track" title={`0 to ${row.format(leader)}, the highest here${row.higherIsBetter ? "" : "; fewer is better for this one"}`}>
        <span className="cmp-outputs-bar">
          {segments.map((s) => (
            <span
              key={s.key}
              className="cmp-outputs-fill"
              style={{
                left: `${s.from}%`,
                width: `${s.to - s.from}%`,
                background: s.color ? `color-mix(in srgb, ${s.color} 34%, transparent)` : undefined,
              }}
            />
          ))}
        </span>
        {marks.map((m, i) => {
          const { player, color, smallSampleNote } = m.entry;
          const muted = !!smallSampleNote;
          return (
            <span
              key={player.id}
              className={`cmp-outputs-value${muted ? " muted" : ""}`}
              style={{
                ...(lefts ? { left: `${(lefts[i] / trackWidth) * 100}%` } : { left: `${m.pct}%`, transform: "translateX(-50%)" }),
                color: muted ? "var(--text-muted)" : color,
                fontWeight: !muted && best.has(player.id) ? 700 : undefined,
              }}
              title={player.name}
            >
              {labelTexts[i]}
            </span>
          );
        })}
        {drawOrder.map((m) => {
          const { player, color, smallSampleNote } = m.entry;
          const name = `${player.name}: ${row.format(m.value)}`;
          return smallSampleNote ? (
            <span
              key={player.id}
              className="cmp-outputs-marker small-sample"
              style={{ left: `${m.pct}%` }}
              title={`${name} (below this card's minimum minutes, so not ranked${m.beyond ? "; past the end of this scale" : ""})`}
            />
          ) : (
            <span
              key={player.id}
              className="cmp-outputs-marker"
              style={{ left: `${m.pct}%`, background: color }}
              title={`${name} (${Math.round(m.pct)}% of the leader)`}
            />
          );
        })}
      </span>
    </div>
  );
}
