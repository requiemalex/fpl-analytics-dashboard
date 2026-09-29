import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, hasDataForMode, isAnalysisMode, type AnalysisMode, type ResolveOptions } from "../metrics/resolvePlayerStats";
import { FIXED_FLOOR_MINUTES, fixedFloorMinutes, isFixedFloorSmallSample } from "../metrics/fixedMinutesFloor";
import { comparisonMetricByKey, comparisonPercentiles, RADAR_MIN_METRICS, type ComparisonMetric } from "../metrics/comparisonMetrics";
import { buildSeasonTrend, trendDataKey, trendMetricByKey } from "../metrics/careerTrends";
import { belowMinimumNote, profileFloorNote, smallSampleNote, trendFloorNote } from "../components/MinutesFloorBadge";
import { PlayerSearch } from "../components/PlayerSearch";
import { CreateViewIcon, PlusIcon, TrashIcon } from "../components/IconToolbar";
import { ComparisonPlayerTag } from "../components/comparison/ComparisonPlayerTag";
import { ComparisonCard } from "../components/comparison/ComparisonCard";
import { ComparisonRadar, type RadarAxisValues } from "../components/comparison/ComparisonRadar";
import { ComparisonOutputs, type OutputsRow } from "../components/comparison/ComparisonOutputs";
import { ComparisonTrend } from "../components/comparison/ComparisonTrend";
import { ComparisonElementDialog, ELEMENT_NOUNS, MAX_NAME_LENGTH } from "../components/comparison/ComparisonElementDialog";
import type { LegendEntry } from "../components/comparison/ComparisonLegend";
import { seriesColor, type ComparedPlayer } from "../components/comparison/seriesColors";
import {
  useComparisonViews,
  isStarterComparisonView,
  MAX_COMPARISON_VIEWS,
  MAX_ELEMENTS_PER_SECTION,
  type ComparisonElementConfig,
  type ComparisonElementKind,
  type ElementSettings,
} from "../state/useComparisonViews";
import { useEscapeLayer } from "../state/useEscapeLayer";
import type { NormalizedPlayer } from "../types/normalized";

const MAX_COMPARE = 5;
/**
 * The minimum-minutes principle (<fixed_minutes_floor>), as on the
 * Dashboard: the Starter view can't be edited, so every card on it gets the
 * fixed floor and Historic Average counts only seasons that reach it; on a
 * view the user builds, each card has its own Min Minutes and the app adds
 * nothing (Historic Average counts every window season).
 */
const STARTER_RESOLVE: ResolveOptions = { fixedFloorSeasons: true };
const CUSTOM_RESOLVE: ResolveOptions = {};

const SECTIONS: { kind: ComparisonElementKind; title: string; noun: "chart" | "panel" | "graph"; addHeight: number }[] = [
  { kind: "radar", title: "Charts", noun: "chart", addHeight: 340 },
  { kind: "outputs", title: "Outputs", noun: "panel", addHeight: 220 },
  { kind: "trend", title: "Trends", noun: "graph", addHeight: 300 },
];

function useComparisonIds(): [number[], (ids: number[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("players");
  const ids = raw
    ? raw
        .split(",")
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    : [];

  const setIds = (newIds: number[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newIds.length === 0) next.delete("players");
      else next.set("players", newIds.join(","));
      return next;
    });
  };

  return [ids, setIds];
}

interface ModePool {
  byId: Map<number, NormalizedPlayer>;
  resolved: NormalizedPlayer[];
  derivedById: Map<number, PlayerDerivedMetrics>;
}

type CardData =
  | { el: ComparisonElementConfig; kind: "unavailable" }
  | { el: ComparisonElementConfig; kind: "radar"; axes: RadarAxisValues[]; entries: LegendEntry[]; floorNote: string | null; message: string | null }
  | { el: ComparisonElementConfig; kind: "outputs"; rows: OutputsRow[]; entries: LegendEntry[]; floorNote: string | null; message: string | null }
  | {
      el: ComparisonElementConfig;
      kind: "trend";
      metric: NonNullable<ReturnType<typeof trendMetricByKey>>;
      rows: ReturnType<typeof buildSeasonTrend>;
      minMinutes: number;
      entries: LegendEntry[];
      floorNote: string | null;
      message: string | null;
    };

export function PlayerComparison() {
  const {
    players,
    historicProfiles,
    historicStatus,
    historicErrorMessage,
    refreshHistoricData,
    historicRefreshing,
    currentSeasonHasStarted,
    allTimeSeasonsByPlayerId,
    requestHistoricData,
  } = useAppState();
  // Last Completed Season, Historic Average and every trend need the
  // whole-pool historic dataset.
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const [ids, setIds] = useComparisonIds();
  const [, setSearchParams] = useSearchParams();

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // The page's one player list — every card compares these, each in the
  // colour of his place in the list.
  const compared: ComparedPlayer[] = useMemo(
    () =>
      ids
        .map((id) => playersById.get(id))
        .filter((p): p is NormalizedPlayer => !!p)
        .map((player, i) => ({ player, color: seriesColor(i) })),
    [ids, playersById],
  );

  // ---------- Views ----------
  const viewsState = useComparisonViews();
  const view = viewsState.selectedView;
  const readOnly = isStarterComparisonView(view);
  const [showCreateView, setShowCreateView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [createViewError, setCreateViewError] = useState<string | null>(null);
  const [showDeleteView, setShowDeleteView] = useState(false);
  const [dialog, setDialog] = useState<{ kind: ComparisonElementKind; editing?: ComparisonElementConfig } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // ---------- Data, per Data View in use ----------
  //
  // The whole population, resolved the same way as every other page —
  // radar percentiles are ranked against everyone, never just the players
  // being compared (<percentile_population>) — once per Data View a card
  // uses.
  const modesKey = useMemo(
    () =>
      Array.from(new Set(view.elements.map((e) => e.dataView).filter(isAnalysisMode)))
        .sort()
        .join(","),
    [view.elements],
  );
  const poolsByMode = useMemo(() => {
    const map = new Map<AnalysisMode, ModePool>();
    if (compared.length === 0) return map;
    for (const mode of modesKey.split(",").filter(isAnalysisMode)) {
      const { resolved } = resolvePlayerStatsList(players, mode, historicProfiles, currentSeasonHasStarted, readOnly ? STARTER_RESOLVE : CUSTOM_RESOLVE);
      map.set(mode, {
        resolved,
        byId: new Map(resolved.map((p) => [p.id, p])),
        derivedById: new Map(resolved.map((p) => [p.id, getPlayerDerivedMetrics(p)])),
      });
    }
    return map;
  }, [modesKey, compared.length, readOnly, players, historicProfiles, currentSeasonHasStarted]);

  const cards: CardData[] = useMemo(() => {
    const historicMessage = historicStatus === "error" ? "Historic data couldn't be loaded." : "Loading historic data…";
    const noPlayers = compared.length === 0 ? "Add players above to compare them here." : null;

    // Each compared player on one card: marked (amber badge, greyed, not
    // drawn or ranked) when he's under the card's minimum — the fixed floor
    // on Starter, the card's own Min Minutes elsewhere. Card by card: the
    // same player can be greyed on one card and shown in full on another.
    function modeEntries(el: ComparisonElementConfig, mode: AnalysisMode, pool: ModePool | undefined): LegendEntry[] {
      return compared.map((c) => {
        const resolved = pool?.byId.get(c.player.id);
        const below =
          !!resolved &&
          (readOnly
            ? isFixedFloorSmallSample(resolved.minutes, mode, historicProfiles.get(c.player.id))
            : resolved.minutes !== null && resolved.minutes < el.minMinutes);
        const note = !below ? null : readOnly ? smallSampleNote(resolved!.minutes, mode) : belowMinimumNote(resolved!.minutes, el.minMinutes);
        return {
          ...c,
          smallSampleNote: note,
          absent: !resolved || (!below && !hasDataForMode(resolved)),
        };
      });
    }

    function percentilesFor(el: ComparisonElementConfig, metric: ComparisonMetric, mode: AnalysisMode, pool: ModePool) {
      const targets = compared.map((c) => pool.byId.get(c.player.id)).filter((p): p is NormalizedPlayer => !!p);
      return comparisonPercentiles(metric, pool.resolved, pool.derivedById, targets, readOnly ? fixedFloorMinutes(mode) : el.minMinutes);
    }

    function valueFor(metric: ComparisonMetric, pool: ModePool, id: number): number | null {
      const p = pool.byId.get(id);
      const d = pool.derivedById.get(id);
      return p && d ? metric.getValue(p, d) : null;
    }

    return view.elements.map((el): CardData => {
      if (el.kind === "trend") {
        const metric = trendMetricByKey(el.metricKeys[0] ?? "");
        if (!metric) return { el, kind: "unavailable" };
        const message = noPlayers ?? (historicStatus !== "ready" ? historicMessage : null);
        const minMinutes = readOnly ? FIXED_FLOOR_MINUTES : el.minMinutes;
        const rows = message ? [] : buildSeasonTrend(compared.map((c) => c.player.id), metric, allTimeSeasonsByPlayerId, minMinutes);
        const entries: LegendEntry[] = compared.map((c) => ({ ...c, absent: !rows.some((r) => typeof r[trendDataKey(c.player.id)] === "number") }));
        return {
          el,
          kind: "trend",
          metric,
          rows,
          minMinutes,
          entries,
          floorNote: readOnly ? trendFloorNote() : null,
          message: message ?? (rows.length === 0 ? "No completed seasons on record for these players." : null),
        };
      }

      const metrics = el.metricKeys.map(comparisonMetricByKey).filter((m): m is ComparisonMetric => !!m);
      if (metrics.length < (el.kind === "radar" ? RADAR_MIN_METRICS : 1)) return { el, kind: "unavailable" };
      const mode: AnalysisMode = el.dataView ?? "lastSeason";
      const pool = poolsByMode.get(mode);
      const message = noPlayers ?? (mode !== "live" && historicStatus !== "ready" ? historicMessage : null);
      // The stopwatch badge marks a floor the app applied, so only Starter's cards carry it (as on the Dashboard).
      const floorNote = readOnly ? profileFloorNote(mode) : null;
      if (message || !pool) {
        const shown = message ?? historicMessage;
        return el.kind === "radar"
          ? { el, kind: "radar", axes: [], entries: [], floorNote, message: shown }
          : { el, kind: "outputs", rows: [], entries: [], floorNote, message: shown };
      }
      const entries = modeEntries(el, mode, pool);

      if (el.kind === "radar") {
        const axes: RadarAxisValues[] = metrics.map((metric) => {
          const percentiles = percentilesFor(el, metric, mode, pool);
          return {
            key: metric.key,
            label: metric.label,
            format: metric.format,
            values: new Map(compared.map((c) => [c.player.id, { percentile: percentiles.get(c.player.id) ?? null, raw: valueFor(metric, pool, c.player.id) }])),
          };
        });
        return { el, kind: "radar", axes, entries, floorNote, message: null };
      }

      const rows: OutputsRow[] = metrics.map((metric) => {
        return {
          key: metric.key,
          label: metric.label,
          group: metric.group,
          higherIsBetter: metric.higherIsBetter,
          format: metric.format,
          cells: new Map(compared.map((c) => [c.player.id, valueFor(metric, pool, c.player.id)])),
        };
      });
      return { el, kind: "outputs", rows, entries, floorNote, message: null };
    });
  }, [view.elements, readOnly, compared, poolsByMode, historicStatus, historicProfiles, allTimeSeasonsByPlayerId]);

  const usesHistoricData = view.elements.some((e) => e.kind === "trend" || e.dataView !== "live");

  // ---------- Actions ----------
  function addPlayer(id: number) {
    if (ids.length >= MAX_COMPARE || ids.includes(id)) return;
    setIds([...ids, id]);
  }
  function removePlayer(id: number) {
    setIds(ids.filter((x) => x !== id));
  }
  function viewProfile(id: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("player", String(id));
      return next;
    });
  }

  function openCreateView() {
    setNewViewName("");
    setCreateViewError(null);
    setShowCreateView(true);
  }

  function handleCreateView() {
    const name = newViewName.trim();
    if (!name) {
      setCreateViewError("Enter a name for this view.");
      return;
    }
    if (viewsState.views.some((v) => v.name.trim().toLowerCase() === name.toLowerCase())) {
      setCreateViewError(`There's already a view called "${name}". Pick another name.`);
      return;
    }
    if (viewsState.views.length >= MAX_COMPARISON_VIEWS) {
      setCreateViewError(`You already have ${MAX_COMPARISON_VIEWS} views, Starter included — the maximum allowed. Delete one first.`);
      return;
    }
    viewsState.createView(name);
    setShowCreateView(false);
  }

  function handleDeleteView() {
    setShowDeleteView(false);
    viewsState.deleteView(view.id);
  }

  function openAdd(kind: ComparisonElementKind) {
    setDialogError(null);
    setDialog({ kind });
  }

  function openEdit(el: ComparisonElementConfig) {
    setDialogError(null);
    setDialog({ kind: el.kind, editing: el });
  }

  function handleSaveElement(settings: ElementSettings) {
    if (!dialog) return;
    if (dialog.editing) {
      viewsState.updateElement(dialog.editing.id, settings);
      setDialog(null);
      return;
    }
    const inSection = view.elements.filter((e) => e.kind === dialog.kind).length;
    if (inSection >= MAX_ELEMENTS_PER_SECTION) {
      setDialogError(`This section already has ${MAX_ELEMENTS_PER_SECTION} — the maximum allowed. Remove one first.`);
      return;
    }
    viewsState.addElement(settings);
    setDialog(null);
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverId(null);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== id) viewsState.reorderElement(draggedId, id);
  }

  // Escape closes whichever dialog is open, discarding it like Cancel.
  useEscapeLayer(!!dialog || showCreateView || showDeleteView, () => {
    setDialog(null);
    setShowCreateView(false);
    setShowDeleteView(false);
  });

  function renderCard(card: CardData, noun: "chart" | "panel" | "graph") {
    const { el } = card;
    const editable = !readOnly;
    const common = {
      title: el.name.trim() || ELEMENT_NOUNS[el.kind],
      noun,
      onEdit: editable ? () => openEdit(el) : undefined,
      onRemove: editable ? () => viewsState.removeElement(el.id) : undefined,
      draggable: editable,
      isDragOver: dragOverId === el.id,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, el.id),
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragOverId !== el.id) setDragOverId(el.id);
      },
      onDragLeave: () => setDragOverId((k) => (k === el.id ? null : k)),
      onDrop: (e: React.DragEvent) => handleDrop(e, el.id),
    };
    if (card.kind === "unavailable") {
      return <ComparisonCard key={el.id} {...common} onEdit={undefined} message={`This ${noun}'s statistics are no longer available.`} />;
    }
    if (card.kind === "radar") {
      return (
        <ComparisonCard key={el.id} {...common} dataView={el.dataView} floorNote={card.floorNote} message={card.message}>
          <ComparisonRadar axes={card.axes} entries={card.entries} />
        </ComparisonCard>
      );
    }
    if (card.kind === "outputs") {
      return (
        <ComparisonCard key={el.id} {...common} dataView={el.dataView} floorNote={card.floorNote} message={card.message}>
          <ComparisonOutputs rows={card.rows} entries={card.entries} />
        </ComparisonCard>
      );
    }
    return (
      <ComparisonCard key={el.id} {...common} floorNote={card.floorNote} message={card.message}>
        <ComparisonTrend metric={card.metric} rows={card.rows} entries={card.entries} minMinutes={card.minMinutes} />
      </ComparisonCard>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Player Comparison</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">
          Players ({compared.length}/{MAX_COMPARE})
        </div>
        {compared.length > 0 && (
          <div className="cmp-player-tags">
            {compared.map((entry) => (
              <ComparisonPlayerTag key={entry.player.id} entry={entry} onOpen={viewProfile} onRemove={removePlayer} />
            ))}
          </div>
        )}
        <PlayerSearch
          excludeIds={ids}
          onPick={addPlayer}
          disabled={ids.length >= MAX_COMPARE}
          label={`Add a player (${compared.length}/${MAX_COMPARE})`}
          disabledLabel={`Add a player (${MAX_COMPARE}/${MAX_COMPARE})`}
        />
      </div>

      {usesHistoricData && historicStatus === "error" && (
        <p className="page-subtitle" style={{ color: "var(--accent-negative)" }}>
          Couldn't load historic data: {historicErrorMessage}
          <button type="button" className="chip" style={{ marginLeft: 8 }} onClick={refreshHistoricData} disabled={historicRefreshing}>
            {historicRefreshing ? "Retrying…" : "Retry"}
          </button>
        </p>
      )}

      {SECTIONS.map((section, i) => {
        const sectionCards = cards.filter((c) => c.el.kind === section.kind);
        return (
          <React.Fragment key={section.kind}>
            {i > 0 && <hr className="section-divider" />}
            <div className="stat-group-title">{section.title}</div>
            {i === 0 && (
              <div className="chip-row" style={{ marginBottom: 12 }}>
                <select aria-label="Comparison view" value={view.id} onChange={(e) => viewsState.selectView(e.target.value)}>
                  {viewsState.views.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="chip chip-icon" title="Create View" aria-label="Create View" onClick={openCreateView}>
                  <CreateViewIcon />
                </button>
                <button
                  type="button"
                  className="chip chip-icon"
                  disabled={readOnly}
                  title={readOnly ? "The Starter view can't be deleted" : "Delete View"}
                  aria-label="Delete View"
                  onClick={() => setShowDeleteView(true)}
                >
                  <TrashIcon />
                </button>
              </div>
            )}
            <div className="card-grid graph-grid">
              {sectionCards.map((card) => renderCard(card, section.noun))}
              {!readOnly && (
                <button
                  type="button"
                  className="add-tile-card"
                  style={{ minHeight: section.addHeight }}
                  onClick={() => openAdd(section.kind)}
                  title={`Add ${ELEMENT_NOUNS[section.kind]}`}
                  aria-label={`Add ${ELEMENT_NOUNS[section.kind]}`}
                >
                  <PlusIcon size={22} />
                </button>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {dialog && (
        <ComparisonElementDialog
          kind={dialog.kind}
          initial={
            dialog.editing
              ? {
                  kind: dialog.editing.kind,
                  name: dialog.editing.name,
                  dataView: dialog.editing.dataView,
                  metricKeys: dialog.editing.metricKeys,
                  minMinutes: dialog.editing.minMinutes,
                }
              : undefined
          }
          error={dialogError}
          onSave={handleSaveElement}
          onCancel={() => setDialog(null)}
        />
      )}

      {showDeleteView && (
        <div className="dialog-backdrop" onClick={() => setShowDeleteView(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Delete view</div>
            <p className="page-subtitle" style={{ margin: "0 0 12px" }}>
              Delete "{view.name}" and all its charts, panels and graphs? This can't be undone.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setShowDeleteView(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleDeleteView}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateView && (
        <div className="dialog-backdrop" onClick={() => setShowCreateView(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Create Comparison View</div>
            <div className="field">
              <label htmlFor="cmp-new-view-name">Name</label>
              <input
                id="cmp-new-view-name"
                type="text"
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. Midfield Value"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateView();
                }}
              />
            </div>
            {createViewError && <div className="banner error">{createViewError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setShowCreateView(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleCreateView}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
