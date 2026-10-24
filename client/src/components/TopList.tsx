import React from "react";
import { barWidths } from "./statBar";
import { PositionBadge, TeamBadge, AvailabilityFlag, availabilityTextClass, pressable } from "./primitives";
import { DataViewBadge } from "./DataViewBadge";
import { HideSmallSamplesButton, isSmallSample, MinutesFloorBadge, RowSmallSampleBadge, smallSamplesShownNote } from "./MinutesFloorBadge";
import { CardEditRemoveButtons } from "./IconToolbar";
import { CardTitle, type CardSource } from "./SourceToggle";
import { noRowsMessage } from "./emptyMessages";
import { percentileTint } from "../utils/colorScale";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import type { NormalizedPlayer } from "../types/normalized";

export interface TopListRow {
  player: NormalizedPlayer;
  value: number | null;
  /** His rank within his position for this figure (<comparative_colouring>) — none under the floor or for an uncoloured figure. */
  rank?: number;
}


export function TopList({
  title,
  rows,
  format,
  onSelect,
  emptyMessage = noRowsMessage("player"),
  onEdit,
  onRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  dataView,
  signed,
  floorNote,
  smallSamples,
  sourceControls,
  source,
}: {
  title: string;
  rows: TopListRow[];
  format: (v: number | null) => string;
  onSelect?: (id: number) => void;
  emptyMessage?: string;
  /** Dashboard-only: renders an Edit icon button in the header when set — every other TopList usage omits this and is unaffected. */
  onEdit?: () => void;
  /** Dashboard-only: renders a Remove icon button in the header when set — every other TopList usage omits this and is unaffected. */
  onRemove?: () => void;
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Dashboard-only: which analysis mode this tile was built from — shown as a small badge in the header. Omitted (no badge) for every other TopList usage, which has no per-tile mode of its own. */
  dataView?: AnalysisMode;
  /** True for a +/- comparison metric (Goals vs xG, etc.): bar lengths measure the size of each figure either side of 0 (statBar.ts). */
  signed?: boolean;
  /** Dashboard-only: hover text for the minutes-floor badge when the fixed floor applies to this tile (dashboardItemFloorNote); no badge when absent. */
  floorNote?: string | null;
  /** Dashboard-only: the tile's Hide button (<hide_small_samples>): whether it's on, how many players shown are under the threshold, and its toggle. */
  smallSamples?: { hidden: boolean; count: number; onToggle: () => void };
  /** Dashboard-only: its source mark (<card_source_mark>, SourceMark: FPL's icon, Understat's or the ⇄), first in the header. */
  sourceControls?: React.ReactNode;
  /** Where its figures come from: the title's colour (<card_source_mark>). */
  source?: CardSource;
}) {
  // <marker_follows_data>: the tile's stopwatch is amber only while a player it shows is under the threshold.
  const shownSmallSamples = dataView ? rows.filter((r) => isSmallSample(r.player.minutes, dataView)).length : 0;
  const widths = barWidths(rows.map((r) => r.value), signed);

  return (
    <div
      className="card"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={
        draggable
          ? { cursor: "grab", outline: isDragOver ? "2px dashed var(--accent-focus)" : undefined, outlineOffset: isDragOver ? -2 : undefined }
          : undefined
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <CardTitle title={title} source={source} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {sourceControls}
          {smallSamples && dataView && <HideSmallSamplesButton hidden={smallSamples.hidden} count={smallSamples.count} mode={dataView} onToggle={smallSamples.onToggle} />}
          {floorNote && dataView && <MinutesFloorBadge note={smallSamplesShownNote(floorNote, shownSmallSamples, dataView)} active={shownSmallSamples > 0} />}
          {dataView && <DataViewBadge mode={dataView} />}
          <CardEditRemoveButtons noun="tile" name={title} onEdit={onEdit} onRemove={onRemove} />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          {emptyMessage}
        </p>
      ) : (
        <div className="stat-list">
          {rows.map(({ player, value, rank }, i) => (
            <div className="stat-row" key={player.id} onClick={() => onSelect?.(player.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <span className="stat-row-name">
                <TeamBadge teamId={player.teamId} shortName={player.teamShortName} />
                <PositionBadge position={player.position} />
                <span className={availabilityTextClass(player.status)} {...(onSelect ? pressable(() => onSelect(player.id), `View ${player.name}'s profile`) : {})}>
                  {player.name}
                </span>
                <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
                {dataView && <RowSmallSampleBadge minutes={player.minutes} mode={dataView} />}
              </span>
              <span className="stat-row-bar-track">
                <span
                  className="stat-row-bar-fill"
                  style={{
                    width: `${widths[i]}%`,
                    background: "var(--accent-focus)",
                  }}
                />
              </span>
              <span className="stat-row-value" style={{ background: percentileTint(rank) }}>
                {format(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
