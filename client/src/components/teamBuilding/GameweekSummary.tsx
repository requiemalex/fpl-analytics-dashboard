import React, { useEffect, useRef, useState } from "react";
import { CHIP_NAME, chipStandings, pointsAgainstGameweek, rankPercentile } from "../../metrics/gameweekSummary";
import { loadEventLive, loadImportCaptain, type GameweekLogRow } from "../../state/useGameweekLog";
import { useDialogFocus } from "../../state/useDialogFocus";
import { useEscapeLayer } from "../../state/useEscapeLayer";
import type { ChipWindow, NormalizedEvent, NormalizedPlayer } from "../../types/normalized";
import { percentileColour } from "../../utils/colorScale";
import { DASH, fmtNumber, fmtPercent, fmtSigned } from "../../utils/format";
import { percentileHint, statHover } from "../hoverText";
import { CloseIcon } from "../IconToolbar";
import { GameweekArrows } from "../MenuControls";
import { PlayerLine } from "./PlayerLine";

/**
 * <gameweek_summary>: one gameweek of the active squad's Gameweek Log
 * (<gameweek_log>) beside every FPL manager who played that gameweek,
 * never added up across gameweeks (the owner's call, 2026-11-02): its
 * points against the average and highest, coloured by them
 * (<gameweek_points_colour>), and an import's rank; the captaincy (the squad's captain,
 * FPL's most-captained player and the gameweek's top scorer, each with
 * what he returned as captain); and where each chip stands. ‹ › steps
 * through the log's gameweeks.
 */

/** One bar on the gameweek's scale (its highest score). */
function Bar({ label, value, max, fill, title, colour }: { label: string; value: number | null; max: number; fill: string; title: string; colour?: string }) {
  return (
    <div className="gw-bar-row" title={title}>
      <span className="gw-bar-label">{label}</span>
      <span className="gw-bar-track">{value !== null && <span className={`gw-bar-fill ${fill}`} style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />}</span>
      <span className="num gw-bar-value" style={colour ? { color: colour } : undefined}>
        {fmtNumber(value)}
      </span>
    </div>
  );
}

/** The squad's gameweek against every manager who played it: its points beside the average and highest, and an import's rank. */
function GameweekPoints({ row }: { row: GameweekLogRow }) {
  const max = Math.max(row.highest ?? 0, row.points, row.average ?? 0, 1);
  const diff = row.average === null ? null : row.points - row.average;
  const score = pointsAgainstGameweek(row.points, row.average, row.highest);
  const rankScore = rankPercentile(row.rank, row.rankedCount);
  return (
    <div className="gw-points">
      <div className="gw-points-head">
        <span title="Points before any transfer cost">This gameweek</span>
        {diff !== null && <span className="num gw-points-diff">{fmtSigned(diff, 0)} v average</span>}
      </div>
      <Bar
        label="This squad"
        value={row.points}
        max={max}
        fill="is-squad"
        colour={percentileColour(score)}
        title={`${fmtNumber(row.points)} points: greener the nearer the gameweek's highest, redder the nearer 0, grey at the average`}
      />
      <Bar label="Average" value={row.average} max={max} fill="is-average" title="Every FPL manager's average that gameweek" />
      <Bar label="Highest" value={row.highest} max={max} fill="is-average" title="The highest score of any FPL manager that gameweek" />
      {row.rank !== null && (
        <div className="gw-points-rank" title={statHover(`Rank ${fmtNumber(row.rank)} of the ${fmtNumber(row.rankedCount)} managers ranked that gameweek.`, percentileHint(rankScore, "FPL managers that gameweek"))}>
          <span className="gw-bar-label">GW rank</span>
          <span className="num" style={{ color: percentileColour(rankScore) }}>
            {fmtNumber(row.rank)}
          </span>
          <span className="gw-bar-label">of {fmtNumber(row.rankedCount)}</span>
        </div>
      )}
    </div>
  );
}

export function GameweekSummary({
  open,
  onClose,
  squadName,
  rows,
  events,
  chipWindows,
  importTeamId,
  playersById,
  onViewProfile,
}: {
  open: boolean;
  onClose: () => void;
  squadName: string;
  /** The Gameweek Log's rows, any order. */
  rows: GameweekLogRow[];
  events: NormalizedEvent[];
  chipWindows: ChipWindow[];
  /** An import's FPL team id, to read its captain; null for a squad built here (its rows carry the captain). */
  importTeamId: number | null;
  playersById: ReadonlyMap<number, NormalizedPlayer>;
  onViewProfile: (id: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, onClose);
  useDialogFocus(open, panelRef);
  const gameweeks = rows.map((r) => r.event).sort((a, b) => a - b);
  const [shown, setShown] = useState<number | null>(null);
  // Opens on the latest gameweek; keeps the one picked while it's still in the log.
  const gw = shown !== null && gameweeks.includes(shown) ? shown : (gameweeks[gameweeks.length - 1] ?? null);
  useEffect(() => {
    if (!open) setShown(null);
  }, [open]);

  const row = rows.find((r) => r.event === gw) ?? null;
  const event = events.find((e) => e.id === gw) ?? null;
  const [live, setLive] = useState<Map<number, { points: number }> | null>(null);
  const [importCaptain, setImportCaptain] = useState<{ id: number; points: number } | null | undefined>(undefined);
  useEffect(() => {
    if (!open || !event) return;
    let cancelled = false;
    setLive(null);
    setImportCaptain(undefined);
    loadEventLive(event.id, event.finished)
      .then((m) => !cancelled && setLive(m))
      .catch(() => !cancelled && setLive(new Map()));
    if (importTeamId !== null) {
      loadImportCaptain(importTeamId, event)
        .then((c) => !cancelled && setImportCaptain(c))
        .catch(() => !cancelled && setImportCaptain(null));
    }
    return () => {
      cancelled = true;
    };
  }, [open, event, importTeamId]);

  if (!open) return null;
  const summary = event?.summary;
  const captain = importTeamId !== null ? importCaptain : (row?.captain ?? null);
  const returned = (id: number | null | undefined) => (id == null || !live ? null : (live.get(id)?.points ?? 0) * 2);
  const captaincy: { role: string; title: string; id: number | null | undefined; points: number | null }[] = [
    {
      role: "Your captain",
      title: "Who scored double for this squad (the vice-captain when the captain didn't play; three times under Triple Captain)",
      id: captain === undefined ? undefined : (captain?.id ?? null),
      points: captain?.points ?? null,
    },
    { role: "Most captained", title: "The player more FPL managers captained than any other", id: summary?.mostCaptainedId, points: returned(summary?.mostCaptainedId) },
    { role: "Top scorer", title: "The gameweek's highest-scoring player: what he'd have returned as captain", id: summary?.topScorer?.id, points: summary?.topScorer ? summary.topScorer.points * 2 : null },
  ];
  const chips = gw === null ? [] : chipStandings(gw, events, chipWindows);
  const managers = summary?.rankedCount ?? null;

  return (
    <div className="gw-backdrop" onClick={onClose}>
      <div className="gw-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gw-summary-title" onClick={(e) => e.stopPropagation()}>
        <div className="gw-panel-head">
          <div className="gw-panel-heading">
            <div className="dialog-title" id="gw-summary-title">
              {gw === null ? "Gameweek Summary" : `Gameweek ${gw}`}
            </div>
            <div className="gw-panel-sub">
              {squadName}
              {row && !row.finished ? " · still being played" : ""}
            </div>
          </div>
          <GameweekArrows gameweeks={gameweeks} value={gw} onChange={setShown} describe={(e) => `The summary for GW${e}`} />
          <button type="button" className="add-players-close" onClick={onClose} title="Close Gameweek Summary" aria-label="Close Gameweek Summary">
            <CloseIcon />
          </button>
        </div>

        {row === null ? (
          <p className="page-subtitle">No gameweek played yet.</p>
        ) : (
          <>
            <section className="gw-section">
              <h3 className="card-title">Points</h3>
              <GameweekPoints row={row} />
            </section>

            <section className="gw-section gw-lines-captaincy">
              <h3 className="card-title">Captaincy</h3>
              <div className="gw-line gw-line-head">
                <span />
                <span />
                <span title="His points, doubled as captain">Returned</span>
              </div>
              {captaincy.map((c) => (
                <div className="gw-line" key={c.role}>
                  <span className="gw-line-label" title={c.title}>
                    {c.role}
                  </span>
                  <span className="gw-line-main">
                    {c.id === undefined ? <span className="value-muted">Loading…</span> : c.id === null ? DASH : <PlayerLine player={playersById.get(c.id)} fallbackId={c.id} onViewProfile={onViewProfile} />}
                  </span>
                  <span className="num gw-line-value">{fmtNumber(c.points)}</span>
                </div>
              ))}
            </section>

            <section className="gw-section gw-lines-chips">
              <h3 className="card-title">Chips</h3>
              <div className="gw-line gw-line-head">
                <span />
                <span title="Share of FPL managers who played it this gameweek">This GW</span>
                <span title="Share of FPL managers still holding it for this half of the season">Still to play</span>
              </div>
              {chips.map((c) => (
                <div className="gw-line" key={c.chip}>
                  <span className="gw-line-label">
                    {CHIP_NAME[c.chip]}
                    {row.chip === c.chip && (
                      <span className="gw-chip-yours" title="This squad played it this gameweek">
                        Yours
                      </span>
                    )}
                  </span>
                  <span
                    className="num gw-chip-week"
                    title={c.inWindow ? `${fmtNumber(c.playedThisWeek)} of ${fmtNumber(managers)} managers played it` : "Can't be played this gameweek"}
                  >
                    {c.shareThisWeek === null ? DASH : fmtPercent(c.shareThisWeek * 100, 1)}
                  </span>
                  <span className="gw-chip-left" title={c.inWindow ? "Every manager has one per half of the season: the share yet to play it" : "Can't be played this gameweek"}>
                    <span className="gw-bar-track">{c.stillToPlay !== null && <span className="gw-bar-fill is-neutral" style={{ width: `${c.stillToPlay * 100}%` }} />}</span>
                    <span className="num gw-bar-value">{c.stillToPlay === null ? DASH : fmtPercent(c.stillToPlay * 100, 0)}</span>
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
