import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useSortSpec, compareSortValues } from "../state/useSortSpec";
import { classifyPriceChangeSignal, netTransferRatio, netTransfersEvent, estimatedOwnerCount, type PriceDirection } from "../metrics/priceChange";
import { PositionBadge, AvailabilityFlag, SignedNum, availabilityTextClass } from "../components/primitives";
import { TopList, type TopListRow } from "../components/TopList";
import { fmtPrice, fmtDecimal, fmtPercent, fmtSigned, DASH } from "../utils/format";
import type { NormalizedPlayer, Position } from "../types/normalized";

interface Row {
  player: NormalizedPlayer;
  signal: ReturnType<typeof classifyPriceChangeSignal>;
  netEvent: number | null;
  ratio: number | null;
  owned: number | null;
}

const DIRECTION_LABEL: Record<PriceDirection, string> = { rising: "Rising", falling: "Falling", stable: "Stable" };

function DirectionBadge({ signal }: { signal: Row["signal"] }) {
  if (!signal || signal.direction === "stable") return <span className="value-muted">{DASH}</span>;
  const cls = signal.direction === "rising" ? "value-positive" : "value-negative";
  const arrow = signal.direction === "rising" ? "\u25b2" : "\u25bc";
  const confidenceLabel = signal.confidence === "none" ? "" : ` (${signal.confidence})`;
  return (
    <span className={cls} style={{ fontWeight: 600 }}>
      {arrow} {DIRECTION_LABEL[signal.direction]}
      {confidenceLabel}
    </span>
  );
}

const SORTABLE_COLUMNS: { key: string; label: string; title?: string }[] = [
  { key: "price", label: "Price" },
  { key: "costChangeStart", label: "\u0394 Season" },
  { key: "costChangeEvent", label: "\u0394 This Event" },
  { key: "ownership", label: "Owned %" },
  { key: "form", label: "Form" },
  { key: "netEvent", label: "Net Transfers", title: "Transfers in minus transfers out since the last gameweek deadline" },
  { key: "ratio", label: "Net Ratio", title: "Net transfers this event \u00f7 estimated current owners" },
  { key: "projectedToday", label: "FPL Predictor: Today", title: "FPL's own projected price_change_percent for today's update" },
];

export function PriceWatch() {
  const { players, teamsById, totalPlayers, advancedFieldAvailability } = useAppState();
  const [, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<"ALL" | Position>("ALL");
  const [teamId, setTeamId] = useState<"ALL" | number>("ALL");
  const [direction, setDirection] = useState<"ALL" | PriceDirection>("ALL");
  const { sort, handleHeaderClick } = useSortSpec([{ key: "projectedToday", direction: "desc" }]);

  const predictorAvailable = advancedFieldAvailability?.price_change_percent ?? false;

  const allRows: Row[] = useMemo(
    () =>
      players.map((player) => ({
        player,
        signal: classifyPriceChangeSignal(player),
        netEvent: netTransfersEvent(player),
        ratio: netTransferRatio(player, totalPlayers),
        owned: estimatedOwnerCount(player, totalPlayers),
      })),
    [players, totalPlayers],
  );

  const filtered = useMemo(() => {
    return allRows.filter((r) => {
      if (search && !r.player.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (position !== "ALL" && r.player.position !== position) return false;
      if (teamId !== "ALL" && r.player.teamId !== teamId) return false;
      if (direction !== "ALL" && (r.signal?.direction ?? "stable") !== direction) return false;
      return true;
    });
  }, [allRows, search, position, teamId, direction]);

  function sortValue(r: Row, key: string): number | string | null {
    switch (key) {
      case "price":
        return r.player.price;
      case "costChangeStart":
        return r.player.costChangeStart;
      case "costChangeEvent":
        return r.player.costChangeEvent;
      case "ownership":
        return r.player.ownership;
      case "form":
        return r.player.form;
      case "netEvent":
        return r.netEvent;
      case "ratio":
        return r.ratio;
      case "projectedToday":
        return r.signal?.projectedToday ?? r.signal?.percent ?? null;
      default:
        return null;
    }
  }

  const sortedRows = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      for (const s of sort) {
        const cmp = compareSortValues(sortValue(a, s.key), sortValue(b, s.key), s.direction);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
    return copy;
  }, [filtered, sort]);

  const risingTop: TopListRow[] = useMemo(
    () =>
      allRows
        .filter((r) => r.signal && r.signal.direction === "rising")
        .sort((a, b) => (b.signal!.projectedToday ?? b.signal!.percent) - (a.signal!.projectedToday ?? a.signal!.percent))
        .slice(0, 5)
        .map((r) => ({ player: r.player, value: r.signal!.projectedToday ?? r.signal!.percent })),
    [allRows],
  );
  const fallingTop: TopListRow[] = useMemo(
    () =>
      allRows
        .filter((r) => r.signal && r.signal.direction === "falling")
        .sort((a, b) => (a.signal!.projectedToday ?? a.signal!.percent) - (b.signal!.projectedToday ?? b.signal!.percent))
        .slice(0, 5)
        .map((r) => ({ player: r.player, value: r.signal!.projectedToday ?? r.signal!.percent })),
    [allRows],
  );

  const risingCount = allRows.filter((r) => r.signal?.direction === "rising" && (r.signal.confidence === "high" || r.signal.confidence === "medium")).length;
  const fallingCount = allRows.filter((r) => r.signal?.direction === "falling" && (r.signal.confidence === "high" || r.signal.confidence === "medium")).length;
  const changedTodayCount = allRows.filter((r) => r.player.costChangeEvent !== null && r.player.costChangeEvent !== 0).length;
  const calibratingCount = allRows.filter((r) => r.player.priceChange?.calibrating).length;

  function select(id: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(id) }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Price Watch</h1>
          <p className="page-subtitle">
            Who's closest to a price rise or fall, and what the transfer market is doing right now — built on FPL's own official Price
            Change Predictor, new for 2026/27.
          </p>
        </div>
      </div>

      <div className="banner info">
        <strong>FPL's own data, FPL's own caveat:</strong> the Predictor figures below (Today/Tomorrow/Day After, and the Signal column)
        come straight from FPL's Price Change Predictor, not this app's guesswork. FPL itself describes a reading over 100% as "expected
        to cross the threshold at the next 00:00 UK update" — but explicitly not a guarantee: late transfer activity before the deadline
        can still pull a player back. The "Net Ratio" column is this app's own supporting figure (net transfers this event ÷ estimated
        current owners), shown alongside for extra context, not as a competing prediction.
      </div>

      {!predictorAvailable && (
        <div className="banner stale">
          This build's live API response didn't carry FPL's Price Change Predictor fields — showing raw transfer and price-movement data
          only. This can happen if FPL hasn't rolled the feature out to every session yet, or the field name has changed since this app
          was last checked against the live API.
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <div className="card-title">Rising (medium+ confidence)</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)" }} className="value-positive">
            {risingCount}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Falling (medium+ confidence)</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)" }} className="value-negative">
            {fallingCount}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Changed Price This Event</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)" }}>{changedTodayCount}</div>
        </div>
        <div className="card">
          <div className="card-title">Still Calibrating</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-mono)" }}>{calibratingCount}</div>
          <div className="page-subtitle" style={{ margin: 0 }}>
            Not enough transfer history yet for a reliable FPL prediction
          </div>
        </div>
      </div>

      {predictorAvailable && (
        <div className="card-grid">
          <TopList title="Closest to a Rise" rows={risingTop} format={(v) => fmtSigned(v, 1) + "%"} onSelect={select} emptyMessage="No players currently trending toward a rise." />
          <TopList title="Closest to a Fall" rows={fallingTop} format={(v) => fmtSigned(v, 1) + "%"} onSelect={select} emptyMessage="No players currently trending toward a fall." />
        </div>
      )}

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="pw-search">Search</label>
          <input id="pw-search" type="text" placeholder="Player name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw-position">Position</label>
          <select id="pw-position" value={position} onChange={(e) => setPosition(e.target.value as "ALL" | Position)}>
            <option value="ALL">All</option>
            <option value="GKP">Goalkeeper</option>
            <option value="DEF">Defender</option>
            <option value="MID">Midfielder</option>
            <option value="FWD">Forward</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pw-team">Team</label>
          <select id="pw-team" value={teamId} onChange={(e) => setTeamId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
            <option value="ALL">All</option>
            {[...teamsById.values()]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        {predictorAvailable && (
          <div className="field">
            <label htmlFor="pw-direction">Signal</label>
            <select id="pw-direction" value={direction} onChange={(e) => setDirection(e.target.value as "ALL" | PriceDirection)}>
              <option value="ALL">All</option>
              <option value="rising">Rising</option>
              <option value="falling">Falling</option>
              <option value="stable">Stable</option>
            </select>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Player</th>
              {SORTABLE_COLUMNS.filter((c) => predictorAvailable || c.key !== "projectedToday").map((c) => {
                const sortEntry = sort.find((s) => s.key === c.key);
                return (
                  <th key={c.key} onClick={(e) => handleHeaderClick(c.key, e.shiftKey)} title={c.title ?? "Click to sort \u00b7 Shift-click to add secondary sort"}>
                    {c.label}
                    {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                  </th>
                );
              })}
              {predictorAvailable && <th>Signal</th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.player.id} onClick={() => select(r.player.id)}>
                <td style={{ textAlign: "left" }}>
                  <div className="player-name-cell">
                    <span className={`name ${availabilityTextClass(r.player.status)}`}>
                      {r.player.name}
                      <AvailabilityFlag status={r.player.status} news={r.player.news} chanceOfPlayingNextRound={r.player.chanceOfPlayingNextRound} />
                    </span>
                    <span className="meta">
                      <PositionBadge position={r.player.position} /> {r.player.teamShortName}
                    </span>
                  </div>
                </td>
                <td>{fmtPrice(r.player.price)}</td>
                <td>
                  <SignedNum value={r.player.costChangeStart} decimals={1} />
                </td>
                <td>
                  <SignedNum value={r.player.costChangeEvent} decimals={1} />
                </td>
                <td>{fmtPercent(r.player.ownership, 1)}</td>
                <td>{fmtDecimal(r.player.form, 1)}</td>
                <td>
                  <SignedNum value={r.netEvent} decimals={0} />
                </td>
                <td>{r.ratio === null ? <span className="value-muted">{DASH}</span> : fmtPercent(r.ratio * 100, 2)}</td>
                {predictorAvailable && <td>{r.signal ? fmtSigned(r.signal.projectedToday ?? r.signal.percent, 1) + "%" : <span className="value-muted">{DASH}</span>}</td>}
                {predictorAvailable && (
                  <td>
                    <DirectionBadge signal={r.signal} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortedRows.length === 0 && (
        <div className="empty-state">
          <h3>No players match these filters</h3>
          <p>Try widening the position, team, or signal filter.</p>
        </div>
      )}
    </div>
  );
}
