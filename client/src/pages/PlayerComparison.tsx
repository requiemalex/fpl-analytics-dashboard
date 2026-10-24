import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { resolvePlayerStatsList, hasDataForMode, isAnalysisMode, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { FIXED_FLOOR_MINUTES, fixedFloorMinutes, isUnderMinimum } from "../metrics/fixedMinutesFloor";
import { comparisonMetricByKey, comparisonMetricFromColumn, comparisonPercentiles, isComparableColumn, RADAR_MIN_METRICS, type ComparisonMetric } from "../metrics/comparisonMetrics";
import { buildSeasonTrend, trendBelowKey, trendDataKey, trendMetricByKey, type TrendDisplay, type TrendMetric } from "../metrics/careerTrends";
import { belowMinimumNote, historicSeasonsNote, profileFloorNote, smallSampleNote, trendFloorNote, userMinimumNote } from "../components/MinutesFloorBadge";
import { columnFormatForMode, columnForMode } from "../components/playerColumns";
import { cardSource, SourceMark, SourceToggle, type CardSource } from "../components/SourceToggle";
import {
  externalColumnByKey,
  externalLoadMessage,
  externalMetricHeading,
  externalMetricKey,
  externalMetricUnavailable,
  parseExternalMetricKey,
  useExternalStats,
  type ColumnSourceChoice,
  type ExternalStatsSource,
  type ExternalTrendMetric,
  FPL_SOURCE,
} from "../extensions/externalStats";
import { PlayerSearch } from "../components/PlayerSearch";
import { CreateViewIcon, PlusIcon, TrashIcon } from "../components/IconToolbar";
import { SectionHeading, type SectionIcon } from "../components/SectionHeading";
import { ComparisonPlayerTag } from "../components/comparison/ComparisonPlayerTag";
import { ComparisonCard } from "../components/comparison/ComparisonCard";
import { ComparisonRadar, type RadarAxisValues } from "../components/comparison/ComparisonRadar";
import { ComparisonOutputs, type OutputsRow } from "../components/comparison/ComparisonOutputs";
import { ComparisonTrend } from "../components/comparison/ComparisonTrend";
import { ComparisonElementDialog, ELEMENT_NOUNS, type ExternalChoices } from "../components/comparison/ComparisonElementDialog";
import { MAX_NAME_LENGTH } from "../components/MenuControls";
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
import type { NormalizedPlayer, PlayerSeasonHistory } from "../types/normalized";

const MAX_COMPARE = 5;
/**
 * The minimum-minutes principle (<fixed_minutes_floor>), as on the
 * Dashboard: the Starter view can't be edited, so every card on it gets the
 * fixed floor and Historic Average counts only seasons that reach it; on a
 * view the user builds, each card has its own Min Minutes and the app adds
 * nothing (Historic Average counts every window season).
 */

const SECTIONS: { kind: ComparisonElementKind; title: string; icon: SectionIcon; noun: "chart" | "panel" | "graph"; addHeight: number }[] = [
  { kind: "radar", title: "Charts", icon: "radar", noun: "chart", addHeight: 340 },
  { kind: "outputs", title: "Outputs", icon: "outputs", noun: "panel", addHeight: 220 },
  { kind: "trend", title: "Trends", icon: "trends", noun: "graph", addHeight: 300 },
];

/**
 * One card statistic in a Data View, the Explorers' way
 * (<same_toggle_everywhere>): an FPL figure (a plain key) — switched to a
 * second source's version by its ⇄ toggle when it has a comparable one
 * (`switched`) — or one of that source's own figures (<external_metric_key>),
 * its column through the slot, held to the same rule as FPL's (comparable:
 * follows the Data View, not +/-). Null when this version can't show it.
 */
interface CardMetric {
  metric: ComparisonMetric;
  /** As the card's Data View shows it (<averaged_counts>). */
  format: (v: number | null) => string;
  /** The second source it comes from (null for FPL), and — one of its own figures — the heading it's listed under there. */
  source: ExternalStatsSource | null;
  heading: string | null;
  /** A figure both sources have: what a ⇄ toggle switches. */
  crossover: boolean;
}

export function resolveCardMetric(key: string, mode: AnalysisMode, ext: ExternalStatsSource | null, switched = false): CardMetric | null {
  const parsed = parseExternalMetricKey(key);
  if (!parsed) {
    const metric = comparisonMetricByKey(key);
    if (!metric) return null;
    const alternate = ext?.playerColumns(mode).alternates[key];
    const crossover = !!alternate && isComparableColumn(alternate);
    if (switched && crossover && ext && alternate) {
      // The row keeps its name and place; only the source (and its colour) changes, as an Explorer column does.
      const shown = columnForMode(alternate, mode);
      return { metric: comparisonMetricFromColumn(shown, key, metric.label), format: shown.format, source: ext, heading: null, crossover };
    }
    return { metric, format: columnFormatForMode(metric.key, metric.format, mode), source: null, heading: null, crossover };
  }
  if (!ext || ext.id !== parsed.sourceId) return null;
  const set = ext.playerColumns(mode);
  const column = externalColumnByKey(set, parsed.key);
  if (!column || !isComparableColumn(column)) return null;
  const shown = columnForMode(column, mode);
  return { metric: comparisonMetricFromColumn(shown, key), format: shown.format, source: ext, heading: externalMetricHeading(ext, set, parsed.key), crossover: false };
}

/** A trend graph's statistic: an FPL TrendMetric (switched by its ⇄ to the second source's version), or one of that source's own season-by-season figures (by the player's permanent code). */
interface CardTrend {
  display: TrendDisplay;
  metric: Pick<TrendMetric, "getValue">;
  seasonValue?: (playerId: number, season: PlayerSeasonHistory) => number | null;
  source: ExternalStatsSource | null;
  figure: string;
  crossover: boolean;
}

function externalTrend(ext: ExternalStatsSource, m: ExternalTrendMetric, label: string, playersById: Map<number, NormalizedPlayer>, crossover: boolean): CardTrend {
  return {
    display: { label, decimals: m.decimals },
    metric: { getValue: () => null },
    seasonValue: (playerId, season) => {
      const code = playersById.get(playerId)?.code;
      return code == null ? null : m.value(code, season.seasonName);
    },
    source: ext,
    figure: label,
    crossover,
  };
}

function resolveCardTrend(key: string, ext: ExternalStatsSource | null, playersById: Map<number, NormalizedPlayer>, switched = false): CardTrend | null {
  const parsed = parseExternalMetricKey(key);
  if (!parsed) {
    const metric = trendMetricByKey(key);
    if (!metric) return null;
    const alternate = ext?.playerTrends.alternates[key];
    if (switched && ext && alternate) return externalTrend(ext, alternate, metric.label, playersById, true);
    return { display: metric, metric, source: null, figure: metric.label, crossover: !!alternate };
  }
  if (!ext || ext.id !== parsed.sourceId) return null;
  const m = externalColumnByKey(ext.playerTrends, parsed.key);
  return m ? externalTrend(ext, m, m.label, playersById, false) : null;
}

/** Whether a key names a second source's own figure while that source isn't mounted (switched off). */
function sourceOff(key: string, ext: ExternalStatsSource | null): boolean {
  const parsed = parseExternalMetricKey(key);
  return parsed !== null && (!ext || ext.id !== parsed.sourceId);
}

/**
 * A card's source mark, first in its header (<card_source_mark>,
 * SourceMark): FPL's icon, Understat's, or the ⇄. Its ⇄ is a toggle when
 * `toggle` is given (a radar's or trend graph's figures both sources have —
 * its axis names are drawn inside the chart, so one toggle switches them
 * together); an Outputs row has its own, so there the ⇄ only marks it.
 */
function cardSourceControls(
  ext: ExternalStatsSource | null,
  items: { source: ExternalStatsSource | null; figure: string; crossover: boolean }[],
  toggle: { switched: boolean; onToggle: () => void } | null,
): React.ReactNode {
  return <SourceMark items={items} toggle={ext && toggle ? { ...toggle, externalLabel: ext.label } : null} />;
}

function useComparisonIds(): [number[], (ids: number[]) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("players");
  // A typed or shared address is held to the same rules as the search box:
  // whole ids, each once, at most MAX_COMPARE (audit 2026-10-18 L9: a
  // repeated id gave two cards one key, and a sixth player wrapped colours).
  const ids = raw ? [...new Set(raw.split(",").filter((part) => part.trim() !== "").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_COMPARE) : [];

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
  | { el: ComparisonElementConfig; kind: "unavailable"; sourceOff: boolean }
  | { el: ComparisonElementConfig; kind: "radar"; axes: RadarAxisValues[]; entries: LegendEntry[]; floorNote: string | null; message: string | null; sourceControls?: React.ReactNode; source?: CardSource }
  | { el: ComparisonElementConfig; kind: "outputs"; rows: OutputsRow[]; entries: LegendEntry[]; floorNote: string | null; message: string | null; sourceControls?: React.ReactNode; source?: CardSource }
  | {
      el: ComparisonElementConfig;
      kind: "trend";
      metric: TrendDisplay;
      /** A second source's figure: its name on the axis and in the hover box is in that source's colour (this class). */
      sourceClass?: string;
      sourceControls?: React.ReactNode;
      source?: CardSource;
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

  // A second data source (Understat), when one is mounted: a card can show
  // its figures (<external_metric_key>). Loaded once a card on the view
  // uses one.
  const ext = useExternalStats();
  const usesExternal = view.elements.some((e) => e.metricKeys.some((k) => parseExternalMetricKey(k) !== null));
  useEffect(() => {
    if (usesExternal) ext?.request();
  }, [ext, usesExternal]);
  // The dialog's second-source statistics, as the Explorers' Columns picker lists them: the FPL figures it has its
  // own version of (⇄ on the card), then its own comparable figures (names don't change with the Data View).
  const externalChoices: ExternalChoices | null = useMemo(() => {
    if (!ext) return null;
    const set = ext.playerColumns("lastSeason");
    const crossoverKeys = Object.entries(set.alternates)
      .filter(([, c]) => isComparableColumn(c))
      .map(([key]) => key);
    const groups = set.groups
      .map((g) => ({ heading: g.heading, metrics: g.columns.filter(isComparableColumn).map((c) => ({ key: externalMetricKey(ext.id, c.key), label: c.label })) }))
      .filter((g) => g.metrics.length > 0);
    const trendGroups = ext.playerTrends.groups.map((g) => ({ heading: g.heading, metrics: g.columns.map((m) => ({ key: externalMetricKey(ext.id, m.key), label: m.label })) }));
    return { label: ext.label, className: ext.className, icon: ext.icon, crossoverKeys, trendCrossoverKeys: Object.keys(ext.playerTrends.alternates), groups, trendGroups };
  }, [ext]);
  // Which source each ⇄ figure shows — a radar's or trend graph's by card id, an Outputs row's by card and figure —
  // as an Explorer column's toggle: FPL each visit, and back to FPL if the second source goes away.
  const [sourceChoice, setSourceChoice] = useState<ColumnSourceChoice>({});
  const switchedFor = (choiceKey: string) => ext !== null && sourceChoice[choiceKey] === ext.id;
  const toggleSource = useCallback(
    (choiceKey: string) => {
      if (!ext) return;
      ext.request();
      setSourceChoice((prev) => ({ ...prev, [choiceKey]: prev[choiceKey] === ext.id ? FPL_SOURCE : ext.id }));
    },
    [ext],
  );
  const readOnly = isStarterComparisonView(view);
  const [showCreateView, setShowCreateView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [createViewError, setCreateViewError] = useState<string | null>(null);
  const [showDeleteView, setShowDeleteView] = useState(false);
  /** A card waiting for the person to confirm its removal (no undo), as on the Dashboard. */
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; title: string; noun: string } | null>(null);
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
      const { resolved } = resolvePlayerStatsList(players, mode, historicProfiles, currentSeasonHasStarted);
      map.set(mode, {
        resolved,
        byId: new Map(resolved.map((p) => [p.id, p])),
        derivedById: new Map(resolved.map((p) => [p.id, getPlayerDerivedMetrics(p)])),
      });
    }
    return map;
  }, [modesKey, compared.length, players, historicProfiles, currentSeasonHasStarted]);

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
        // No minutes for the mode counts as 0 (<no_data_is_zero>), so a player with no data is under any minimum above 0.
        const below = !!resolved && isUnderMinimum(resolved.minutes, readOnly ? fixedFloorMinutes(mode) : el.minMinutes);
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

    function rankFor(metric: ComparisonMetric, pool: ModePool, id: number): number | null {
      const p = pool.byId.get(id);
      const d = pool.derivedById.get(id);
      return p && d ? metric.rankValue(p, d) : null;
    }

    return view.elements.map((el): CardData => {
      if (el.kind === "trend") {
        const trend = resolveCardTrend(el.metricKeys[0] ?? "", ext, playersById, switchedFor(el.id));
        if (!trend) return { el, kind: "unavailable", sourceOff: sourceOff(el.metricKeys[0] ?? "", ext) };
        const metric = trend.display;
        const message = noPlayers ?? (historicStatus !== "ready" ? historicMessage : null) ?? (trend.source ? (externalLoadMessage(trend.source) ?? null) : null);
        const minMinutes = readOnly ? FIXED_FLOOR_MINUTES : el.minMinutes;
        const rows = message ? [] : buildSeasonTrend(compared.map((c) => c.player.id), trend.metric, allTimeSeasonsByPlayerId, minMinutes, trend.seasonValue);
        const entries: LegendEntry[] = compared.map((c) => ({ ...c, absent: !rows.some((r) => typeof r[trendDataKey(c.player.id)] === "number") }));
        return {
          el,
          kind: "trend",
          metric,
          sourceClass: trend.source?.className,
          sourceControls: cardSourceControls(ext, [trend], { switched: switchedFor(el.id), onToggle: () => toggleSource(el.id) }),
          source: cardSource([trend]),
          rows,
          minMinutes,
          entries,
          floorNote: readOnly ? trendFloorNote() : el.minMinutes > 0 ? userMinimumNote(el.minMinutes, null) : null,
          message: message ?? (rows.length === 0 ? "No completed seasons on record for these players." : null),
        };
      }

      const mode: AnalysisMode = el.dataView ?? "lastSeason";
      // A radar's ⇄ is the card's; an Outputs row's is its own.
      const choiceKey = (key: string) => (el.kind === "radar" ? el.id : `${el.id}:${key}`);
      const resolved = el.metricKeys.map((k) => resolveCardMetric(k, mode, ext, switchedFor(choiceKey(k)))).filter((m): m is CardMetric => !!m);
      if (resolved.length < (el.kind === "radar" ? RADAR_MIN_METRICS : 1)) return { el, kind: "unavailable", sourceOff: el.metricKeys.some((k) => sourceOff(k, ext)) };
      const pool = poolsByMode.get(mode);
      const external = resolved.find((r) => r.source)?.source ?? null;
      const sourceControls = cardSourceControls(
        ext,
        resolved.map((r) => ({ source: r.source, figure: r.metric.label, crossover: r.crossover })),
        el.kind === "radar" ? { switched: switchedFor(el.id), onToggle: () => toggleSource(el.id) } : null,
      );
      const source = cardSource(resolved.map((r) => ({ source: r.source, figure: r.metric.label })));
      // While the second source a card uses is still loading, its figures aren't there yet: say so rather than draw them as missing.
      const message =
        noPlayers ?? (mode !== "live" && historicStatus !== "ready" ? historicMessage : null) ?? (external?.status === "loading" ? (externalLoadMessage(external) ?? null) : null);
      // The amber stopwatch marks any minimum-minutes threshold in force on the card (<minutes_marker>): Starter's fixed floor,
      // the card's own Min Minutes, or Historic Average's 450-minute seasons.
      const floorNote = readOnly ? profileFloorNote(mode) : el.minMinutes > 0 ? userMinimumNote(el.minMinutes, mode) : mode === "historicAverage" ? historicSeasonsNote() : null;
      if (message || !pool) {
        const shown = message ?? historicMessage;
        return el.kind === "radar"
          ? { el, kind: "radar", axes: [], entries: [], floorNote, message: shown, sourceControls, source }
          : { el, kind: "outputs", rows: [], entries: [], floorNote, message: shown, sourceControls, source };
      }
      const entries = modeEntries(el, mode, pool);

      if (el.kind === "radar") {
        const axes: RadarAxisValues[] = resolved.map(({ metric, format, source }) => {
          const percentiles = percentilesFor(el, metric, mode, pool);
          return {
            key: metric.key,
            label: metric.label,
            format,
            values: new Map(compared.map((c) => [c.player.id, { percentile: percentiles.get(c.player.id) ?? null, raw: valueFor(metric, pool, c.player.id) }])),
            ...(source ? { sourceClass: source.className } : {}),
          };
        });
        return { el, kind: "radar", axes, entries, floorNote, message: null, sourceControls, source };
      }

      const rows: OutputsRow[] = resolved.map(({ metric, format, source, heading, crossover }) => {
        return {
          key: metric.key,
          label: metric.label,
          group: metric.group,
          higherIsBetter: metric.higherIsBetter,
          format,
          cells: new Map(compared.map((c) => [c.player.id, valueFor(metric, pool, c.player.id)])),
          rankCells: metric.rankValue === metric.getValue ? undefined : new Map(compared.map((c) => [c.player.id, rankFor(metric, pool, c.player.id)])),
          ...(source && heading ? { sourceHeading: { label: heading, className: source.className, icon: source.icon } } : {}),
          ...(source ? { labelClassName: source.className } : {}),
          ...(ext && crossover
            ? {
                toggle: (
                  <SourceToggle
                    showingExternal={switchedFor(choiceKey(metric.key))}
                    externalLabel={ext.label}
                    figure={metric.label}
                    onToggle={() => toggleSource(choiceKey(metric.key))}
                  />
                ),
              }
            : {}),
        };
      });
      return { el, kind: "outputs", rows, entries, floorNote, message: null, sourceControls, source };
    });
  }, [view.elements, readOnly, compared, poolsByMode, historicStatus, historicProfiles, allTimeSeasonsByPlayerId, ext, playersById, sourceChoice, toggleSource]);

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
      setCreateViewError(`You already have ${MAX_COMPARISON_VIEWS} views, Starter included, which is the maximum. Delete one first.`);
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
      setDialogError(`This section already has ${MAX_ELEMENTS_PER_SECTION}, the most one view can hold. Remove one first.`);
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
  useEscapeLayer(!!dialog || showCreateView || showDeleteView || confirmRemove !== null, () => {
    setDialog(null);
    setShowCreateView(false);
    setShowDeleteView(false);
    setConfirmRemove(null);
  });

  function renderCard(card: CardData, noun: "chart" | "panel" | "graph") {
    const { el } = card;
    const editable = !readOnly;
    const common = {
      title: el.name.trim() || ELEMENT_NOUNS[el.kind],
      noun,
      onEdit: editable ? () => openEdit(el) : undefined,
      onRemove: editable ? () => setConfirmRemove({ id: el.id, title: el.name.trim() || ELEMENT_NOUNS[el.kind], noun }) : undefined,
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
      return <ComparisonCard key={el.id} {...common} onEdit={undefined} message={card.sourceOff ? externalMetricUnavailable(noun) : `This ${noun}'s statistics are no longer available.`} />;
    }
    if (card.kind === "radar") {
      return (
        <ComparisonCard key={el.id} {...common} dataView={el.dataView} floorNote={card.floorNote} floorActive={card.entries.some((e) => !!e.smallSampleNote)} sourceControls={card.sourceControls} source={card.source} message={card.message}>
          <ComparisonRadar axes={card.axes} entries={card.entries} />
        </ComparisonCard>
      );
    }
    if (card.kind === "outputs") {
      return (
        <ComparisonCard key={el.id} {...common} dataView={el.dataView} floorNote={card.floorNote} floorActive={card.entries.some((e) => !!e.smallSampleNote)} sourceControls={card.sourceControls} source={card.source} message={card.message}>
          <ComparisonOutputs rows={card.rows} entries={card.entries} />
        </ComparisonCard>
      );
    }
    return (
      <ComparisonCard
        key={el.id}
        {...common}
        floorNote={card.floorNote}
        // A season under the card's minimum is marked on the plot (trendBelowKey).
        floorActive={card.rows.some((r) => card.entries.some((e) => typeof r[trendBelowKey(e.player.id)] === "number"))}
        sourceControls={card.sourceControls}
        source={card.source}
        message={card.message}
      >
        <ComparisonTrend metric={card.metric} sourceClass={card.sourceClass} rows={card.rows} entries={card.entries} minMinutes={card.minMinutes} />
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

      <SectionHeading icon="players">Players</SectionHeading>
      <div className="card" style={{ marginBottom: 24 }}>
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

      <SectionHeading icon="views">Saved Views</SectionHeading>
      <div className="chip-row">
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

      {SECTIONS.map((section) => {
        const sectionCards = cards.filter((c) => c.el.kind === section.kind);
        return (
          <React.Fragment key={section.kind}>
            <SectionHeading icon={section.icon}>{section.title}</SectionHeading>
            <div className="card-grid graph-grid">
              {sectionCards.map((card) => renderCard(card, section.noun))}
              {!readOnly && sectionCards.length < MAX_ELEMENTS_PER_SECTION && (
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
          external={externalChoices}
          onSave={handleSaveElement}
          onCancel={() => setDialog(null)}
        />
      )}

      {confirmRemove && (
        <div className="dialog-backdrop" onClick={() => setConfirmRemove(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Remove {confirmRemove.noun}</div>
            <p className="page-subtitle" style={{ margin: "0 0 12px" }}>
              Remove "{confirmRemove.title}" from this view? This can't be undone.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  viewsState.removeElement(confirmRemove.id);
                  setConfirmRemove(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
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
