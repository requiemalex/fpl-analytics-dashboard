import React, { useEffect, useRef, useState } from "react";
import { CHIP_NAME, chipStandings, pointsAgainstGameweek, rankPercentile } from "../../metrics/gameweekSummary";
import { loadEventLive, loadImportCaptain, type GameweekLog, type GameweekLogRow } from "../../state/useGameweekLog";
import { useDialogFocus } from "../../state/useDialogFocus";
import { useEscapeLayer } from "../../state/useEscapeLayer";
import type { ChipWindow, NormalizedEvent, NormalizedPlayer } from "../../types/normalized";
import { percentileTint } from "../../utils/colorScale";
import { DASH, fmtNumber, fmtPercent, fmtSigned } from "../../utils/format";
import { percentileHint, statHover } from "../hoverText";
import { ChevronIcon, ChipIcon, CloseIcon, GameweekLogIcon, GameweekSummaryIcon } from "../IconToolbar";
import { GameweekArrows } from "../MenuControls";
import { StatTile } from "../playerProfile/ProfileSummary";
import { pressable } from "../primitives";
import { PlayerLine } from "./PlayerLine";

/**
 * <gameweek_summary>: Team Building's gameweek panel, from the pitch's
 * Gameweek Summary icon, in two views switched with the arrow at its foot.
 *
 * **Summary**: one gameweek of the active squad (<gameweek_log>) beside
 * every FPL manager who played it, never added up across gameweeks (the
 * owner's call, 2026-11-02): its points, coloured against the gameweek's
 * average and highest (<gameweek_points_colour>), with those two, the bench
 * and its transfers and hits, as the profiles' Summary tiles; the
 * captaincy (the squad's captain, FPL's most-captained player and the
 * gameweek's top scorer, each with what he returned as captain); and where
 * each chip stands across the game. ‹ › steps through the log's gameweeks.
 *
 * **Gameweek Log**: every gameweek the squad has played, newest first: its
 * points, and an import's gameweek rank and overall rank after it (FPL's
 * own; FPL ranks only its own teams, so a squad built here has none). A
 * row opens that gameweek's Summary. Ranks live only here, points in both.
 */

type View = "summary" | "log";

/** The gameweek's points and transfers, as tiles: points coloured against every manager that gameweek. */
function PointsTiles({ row }: { row: GameweekLogRow }) {
  const diff = row.average === null ? null : row.points - row.average;
  const score = pointsAgainstGameweek(row.points, row.average, row.highest);
  const hitTitle = "Points paid for transfers past the free ones";
  return (
    <div className="summary-tiles gw-tiles">
      <StatTile
        label="Points"
        value={fmtNumber(row.points)}
        percentile={score}
        title={`${fmtNumber(row.points)} points, before any transfer's hit${diff !== null ? ` (${fmtSigned(diff, 0)} v the average)` : ""}: greener the nearer the gameweek's highest, redder the nearer 0, grey at the average`}
      />
      <StatTile label="Average" value={fmtNumber(row.average)} title="Every FPL manager's average that gameweek" />
      <StatTile label="Highest" value={fmtNumber(row.highest)} title="The highest score of any FPL manager that gameweek" />
      <StatTile label="Bench" value={fmtNumber(row.benchPoints)} title="Points left on the bench (none under Bench Boost: they all count)" />
      <StatTile label="Transfers" value={fmtNumber(row.transfers)} title="Transfers made for the gameweek (FPL counts none under a Wildcard or Free Hit)" />
      <StatTile label="Hits" value={row.transferCost ? `−${fmtNumber(row.transferCost)}` : fmtNumber(row.transferCost)} title={hitTitle} />
    </div>
  );
}

/** The Gameweek Log view: one row per gameweek played, newest first, each opening its Summary. */
function LogTable({ log, onPick }: { log: GameweekLog; onPick: (event: number) => void }) {
  const ranked = log.source === "fpl";
  const rankCell = (rank: number | null, of: number | null, what: string) => {
    const score = rankPercentile(rank, of);
    return (
      <td style={{ background: percentileTint(score) }} title={rank === null ? `FPL hasn't ranked it yet` : statHover(`${what} ${fmtNumber(rank)} of ${fmtNumber(of)} managers.`, percentileHint(score, "FPL managers"))}>
        {fmtNumber(rank)}
      </td>
    );
  };
  return (
    <div className="table-wrap">
      <table className="data-table compact gw-log-table" aria-label="Gameweek Log">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }} title="Gameweek: click a row for its Summary">
              GW
            </th>
            <th className="column-group-divider" title="The gameweek's points, before any transfer's hit">
              Points
            </th>
            {ranked && <th title="The gameweek's rank among every FPL manager">GW Rank</th>}
            {ranked && <th title="The team's overall rank after the gameweek">Overall Rank</th>}
          </tr>
        </thead>
        <tbody>
          {log.rows.map((r) => {
            const score = pointsAgainstGameweek(r.points, r.average, r.highest);
            return (
              <tr key={r.event} className="gw-log-row" {...pressable(() => onPick(r.event), `Gameweek ${r.event}'s Summary`)}>
                <td style={{ textAlign: "left" }} title={r.finished ? `Gameweek ${r.event}: click for its Summary` : `Gameweek ${r.event}, still being played: its figures can change`}>
                  {r.event}
                  {!r.finished && <span className="gw-log-live">live</span>}
                </td>
                <td
                  className="column-group-divider"
                  style={{ background: percentileTint(score) }}
                  title={`${fmtNumber(r.points)} points against every FPL manager's ${fmtNumber(r.average)} average and ${fmtNumber(r.highest)} highest: greener toward the highest, redder toward 0`}
                >
                  {fmtNumber(r.points)}
                </td>
                {ranked && rankCell(r.rank, r.rankedCount, "Gameweek rank")}
                {ranked && rankCell(r.overallRank, r.rankedCount, "Overall rank")}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GameweekSummary({
  open,
  onClose,
  squadName,
  log,
  events,
  chipWindows,
  importTeamId,
  playersById,
  onViewProfile,
}: {
  open: boolean;
  onClose: () => void;
  squadName: string;
  /** The squad's Gameweek Log (<gameweek_log>). */
  log: GameweekLog;
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
  const rows = log.rows;
  const gameweeks = rows.map((r) => r.event).sort((a, b) => a - b);
  const [view, setView] = useState<View>("summary");
  const [shown, setShown] = useState<number | null>(null);
  // Opens on the latest gameweek's Summary; keeps the one picked while it's still in the log.
  const gw = shown !== null && gameweeks.includes(shown) ? shown : (gameweeks[gameweeks.length - 1] ?? null);
  useEffect(() => {
    if (!open) {
      setShown(null);
      setView("summary");
    }
  }, [open]);

  const row = rows.find((r) => r.event === gw) ?? null;
  const event = events.find((e) => e.id === gw) ?? null;
  const [live, setLive] = useState<Map<number, { points: number }> | null>(null);
  const [importCaptain, setImportCaptain] = useState<{ id: number; points: number } | null | undefined>(undefined);
  useEffect(() => {
    if (!open || !event || view !== "summary") return;
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
  }, [open, event, importTeamId, view]);

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
  const showSummary = (e: number) => {
    setShown(e);
    setView("summary");
  };

  return (
    <div className="gw-backdrop" onClick={onClose}>
      <div className="gw-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gw-summary-title" onClick={(e) => e.stopPropagation()}>
        <div className="gw-panel-head">
          <div className="gw-panel-heading">
            <div className="dialog-title" id="gw-summary-title">
              {view === "log" ? "Gameweek Log" : gw === null ? "Gameweek Summary" : `Gameweek ${gw}`}
            </div>
            <div className="gw-panel-sub">
              {squadName}
              {view === "summary" && row && !row.finished ? " · still being played" : ""}
            </div>
          </div>
          {view === "summary" && <GameweekArrows gameweeks={gameweeks} value={gw} onChange={setShown} describe={(e) => `The Summary for GW${e}`} />}
          <button type="button" className="add-players-close" onClick={onClose} title="Close" aria-label="Close the Gameweek Summary">
            <CloseIcon />
          </button>
        </div>

        <div className="gw-panel-body">
          {log.error && <div className="banner error">Couldn't load the Gameweek Log. {log.error}</div>}
          {view === "log" ? (
            rows.length > 0 ? (
              <LogTable log={log} onPick={showSummary} />
            ) : (
              <p className="page-subtitle">No gameweek played yet.</p>
            )
          ) : row === null ? (
            <p className="page-subtitle">No gameweek played yet.</p>
          ) : (
            <>
              <section className="gw-section">
                <div className="stat-group-title">Points</div>
                <PointsTiles row={row} />
              </section>

              <section className="gw-section">
                <div className="stat-group-title">Captaincy</div>
                <table className="data-table compact gw-table" aria-label="Captaincy">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }} />
                      <th style={{ textAlign: "left" }}>Player</th>
                      <th title="His points, doubled as captain">Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {captaincy.map((c) => (
                      <tr key={c.role}>
                        <td className="gw-table-label" title={c.title}>
                          {c.role}
                        </td>
                        <td style={{ textAlign: "left" }}>
                          {c.id === undefined ? <span className="value-muted">Loading…</span> : c.id === null ? DASH : <PlayerLine player={playersById.get(c.id)} fallbackId={c.id} onViewProfile={onViewProfile} />}
                        </td>
                        <td>{fmtNumber(c.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="gw-section">
                <div className="stat-group-title">Chips</div>
                <table className="data-table compact gw-table" aria-label="Chips">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Chip</th>
                      <th title="Share of FPL managers who played it this gameweek">This GW</th>
                      <th title="Share of FPL managers still holding it for this half of the season">Still to play</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chips.map((c) => (
                      <tr key={c.chip}>
                        <td className="gw-table-label">
                          <span className="gw-chip-name">
                            <ChipIcon chip={c.chip} size={14} />
                            {CHIP_NAME[c.chip]}
                            {row.chip === c.chip && (
                              <span className="gw-chip-yours" title="This squad played it this gameweek">
                                Yours
                              </span>
                            )}
                          </span>
                        </td>
                        <td title={c.inWindow ? `${fmtNumber(c.playedThisWeek)} of ${fmtNumber(managers)} managers played it` : "Can't be played this gameweek"}>
                          {c.shareThisWeek === null ? DASH : fmtPercent(c.shareThisWeek * 100, 1)}
                        </td>
                        <td title={c.inWindow ? "Every manager has one per half of the season: the share yet to play it" : "Can't be played this gameweek"}>
                          {c.stillToPlay === null ? DASH : fmtPercent(c.stillToPlay * 100, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>

        {/* The switch between the two views (the owner's call, 2026-11-02). */}
        <div className="gw-panel-foot">
          {view === "summary" ? (
            <button type="button" className="chip chip-icon gw-view-switch" title="Gameweek Log: every gameweek's points and ranks" aria-label="Show the Gameweek Log" onClick={() => setView("log")}>
              <GameweekLogIcon />
              <ChevronIcon direction="right" size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="chip chip-icon gw-view-switch"
              title={gw === null ? "Back to the Gameweek Summary" : `Back to GW${gw}'s Summary`}
              aria-label="Show the Gameweek Summary"
              onClick={() => setView("summary")}
            >
              <ChevronIcon direction="left" size={12} />
              <GameweekSummaryIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
