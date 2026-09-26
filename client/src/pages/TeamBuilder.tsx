import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useSavedSquads, MAX_SAVED_SQUADS } from "../state/useSavedSquads";
import { useColumnCustomization, MIN_COLUMN_WIDTH, type UseColumnCustomization } from "../state/useColumnCustomization";
import { useColumnFilters, isColumnFilterActive } from "../state/useColumnFilters";
import { ColumnFilterControl } from "../components/ColumnFilterControl";
import { useSortSpec, compareSortValues, sortWithoutHiddenColumn, type SortSpec } from "../state/useSortSpec";
import { useProgressiveRowCount } from "../state/useProgressiveRowCount";
import { SQUAD_RULES, createBlankSquad, type SavedSquad } from "../types/team";
import { validateSquad, validateStartingXI, canAddPlayer } from "../metrics/squadRules";
import { resolvePlayerStats, resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getPlayerDerivedMetrics, type PlayerDerivedMetrics } from "../metrics/playerMetrics";
import { computeExpectedPointsForSingleFixture } from "../metrics/expectedPoints";
import { computeExpectedPointsV2ForFixture } from "../metrics/expectedPointsV2";
import { fetchEntryTeam, fetchEntryHistory, fetchEntryPicks, ApiRequestError } from "../api/client";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import { matchesPlayerSearch } from "../utils/playerSearch";
import { computeBlendedMinutesReliability } from "../metrics/minutesReliabilityBlend";
import { getUpcomingFixtures, fdrColor, averageFixtureDifficulty, type UpcomingFixture } from "../metrics/fixtureTicker";
import { PLAYER_COLUMNS, DEFAULT_VISIBLE_COLUMNS, columnByKey, isStaticColumn, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { SquadPitch } from "../components/SquadPitch";
import { AnalysisModeIcon } from "../components/AnalysisModeIcon";
import { PositionBadge, TeamBadge, AvailabilityFlag, SignedNum, availabilityTextClass } from "../components/primitives";
import { IconChipButton, ResetIcon, SparkleIcon, ClockIcon, FilterIcon, DownloadIcon } from "../components/IconToolbar";
import { fmtPrice, fmtDecimal, fmtPercent, fmtSigned, DASH } from "../utils/format";
import { relativeCellTint } from "../utils/colorScale";
import { downloadCsv } from "../utils/csvExport";
import type { NormalizedPlayer, Position } from "../types/normalized";

/** How long a rejected drag's warning message stays visible before clearing itself. */
const WARNING_DISPLAY_MS = 4000;
/** How many fixtures ahead the gameweek navigator (pitch view) can step through — matches getUpcomingFixtures' own 5-fixture default. */
export type GwOffset = 1 | 2 | 3 | 4 | 5;
export const GW_OFFSETS: GwOffset[] = [1, 2, 3, 4, 5];
const HISTORIC_RAW_GROUPS: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];
const PICKER_HISTORIC_MODE_OPTIONS: { mode: AnalysisMode; label: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season" },
  { mode: "historicAverage", label: "Historic Average" },
  { mode: "live", label: "Current Season" },
];
/** Own% is a normal Historic/Raw column now (resizable, comparative-coloured), matching Player Explorer — it used to be excluded and pinned separately. */
const HISTORIC_RAW_COLUMNS = PLAYER_COLUMNS;
const PICKER_DEFAULT_SORT: SortSpec[] = [{ key: "expFplOfficial", direction: "desc" }];
/** Price defaults off since squad budget always uses live price regardless of this toggle, so a historic price here could read as more relevant to squad-building than it actually is — still selectable manually if wanted. Ownership defaults ON, matching Player Explorer. */
const DEFAULT_HISTORIC_RAW_COLUMN_KEYS = DEFAULT_VISIBLE_COLUMNS.filter((k) => k !== "price");
/** Fixed width of the one remaining pinned-left column — see the .picker-sticky-player CSS. */
const PICKER_PINNED_WIDTH = 210;

/** One row of the Add Players table — bundles live identity/budget data, the historic/raw resolution for the selected mode, and every predictive figure, computed once per candidate rather than per cell. */
interface PickerRowData {
  live: NormalizedPlayer;
  /** Resolved per the picker's own Historic/Raw toggle — null if the player has no data for that mode. */
  historicRaw: NormalizedPlayer;
  /** getPlayerDerivedMetrics(historicRaw), worked out once per row rather than once per cell, sort comparison and tint. */
  historicDerived: PlayerDerivedMetrics;
  fixtures: UpcomingFixture[];
  /** FPL's own ep_next, extended by fixture difficulty for the gameweek currently selected on the pitch-view navigator — see computeExpectedPointsForSingleFixture. */
  fplOfficial: number | null;
  /** Expected Points Tier 2 — this app's own independent per-event estimate for the same navigator-selected gameweek. See metrics/expectedPointsV2.ts. */
  modelPredicted: number | null;
  /** Which approximations/data gaps applied to this player's modelPredicted figure, if any — shown as a hover tooltip on the cell. */
  modelCaveats: string[];
  reliability: number | null;
}

interface PredictiveColumnDef {
  key: string;
  label: string;
  getValue: (row: PickerRowData) => number | null;
  renderCell: (row: PickerRowData) => React.ReactNode;
  /** Decimal places the cell shows — column filters compare values as displayed (see columnFilterPasses). */
  decimals: number;
  /** Defaults true; only the fixtures column (lower average difficulty = easier = better) needs false. */
  higherIsBetter?: boolean;
  /** Same meaning as PlayerColumn.varies (playerColumns.tsx) — whether this column changes with the picker's own Historic/Raw toggle or gameweek navigator. Both predictive figures are navigator-driven, so they vary; Minutes Reliability and fixtures are always the player's live, current figures regardless of either toggle. Defaults true. */
  varies?: boolean;
}

const PREDICTIVE_COLUMNS: PredictiveColumnDef[] = [
  {
    key: "expFplOfficial",
    label: "Exp. Pts (FPL Official)",
    getValue: (row) => row.fplOfficial,
    renderCell: (row) => fmtDecimal(row.fplOfficial, 1),
    decimals: 1,
  },
  {
    key: "expModelPredicted",
    label: "Exp. Pts (Model Predicted)",
    getValue: (row) => row.modelPredicted,
    decimals: 1,
    renderCell: (row) => (
      <span
        title={
          row.modelCaveats.length > 0
            ? `This app's own independent estimate, built from live per-event stats and FPL's real scoring rules — not FPL's own figure. ${row.modelCaveats.join(" ")}`
            : "This app's own independent estimate, built from live per-event stats and FPL's real scoring rules — not FPL's own figure."
        }
      >
        {fmtDecimal(row.modelPredicted, 1)}
      </span>
    ),
  },
  {
    key: "reliability",
    label: "Minutes Reliability",
    getValue: (row) => (row.reliability !== null ? row.reliability * 100 : null),
    renderCell: (row) => (row.reliability !== null ? fmtPercent(row.reliability * 100, 0) : DASH),
    decimals: 0,
    varies: false,
  },
  {
    key: "fixtures",
    label: "Next 5 Fixtures",
    getValue: (row) => averageFixtureDifficulty(row.fixtures),
    decimals: 1,
    higherIsBetter: false,
    varies: false,
    renderCell: (row) => {
      const avgFdr = averageFixtureDifficulty(row.fixtures);
      if (row.fixtures.length === 0 || avgFdr === null) return <span className="value-muted">{DASH}</span>;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="table-fixtures">
            {row.fixtures.map((f) => (
              <span
                key={f.fixtureId}
                className="table-fixture-chip"
                style={{ background: fdrColor(f.difficulty) }}
                title={`${f.opponentShortName} (${f.isHome ? "H" : "A"}) — FDR ${f.difficulty}`}
              >
                {f.opponentShortName.slice(0, 3)}
              </span>
            ))}
          </div>
          <span
            style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            title="Average fixture difficulty across the fixtures shown (1 = easiest, 5 = hardest) — this is what the column sorts by"
          >
            {avgFdr.toFixed(1)}
          </span>
        </div>
      );
    },
  },
];
const DEFAULT_PREDICTIVE_COLUMN_KEYS = PREDICTIVE_COLUMNS.map((c) => c.key);

type ColumnRanges = Map<string, { min: number; max: number }>;

function predictiveTint(ranges: ColumnRanges, row: PickerRowData, c: PredictiveColumnDef): string | undefined {
  const range = ranges.get(c.key);
  const v = c.getValue(row);
  if (!range || v === null) return undefined;
  return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
}

function historicRawTint(ranges: ColumnRanges, row: PickerRowData, c: PlayerColumn): string | undefined {
  const range = ranges.get(c.key);
  if (!range || !row.historicRaw) return undefined;
  const v = c.getValue(row.historicRaw, row.historicDerived);
  if (v === null) return undefined;
  return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
}

interface PickerRowProps {
  row: PickerRowData;
  canAdd: boolean;
  /** canAddPlayer's reason when the Add button is disabled — shown as its hover text. */
  addBlockedReason: string | undefined;
  predictiveColumns: PredictiveColumnDef[];
  historicRawColumns: PlayerColumn[];
  predictiveWidths: Record<string, number>;
  historicRawWidths: Record<string, number>;
  predictiveRanges: ColumnRanges;
  historicRawRanges: ColumnRanges;
  onAdd: (player: NormalizedPlayer) => void;
  onViewProfile: (playerId: number) => void;
}

/** One Add Players row. Memoized: opening a filter, a pitch change or adding more staged rows leaves the rows already drawn alone. */
const PickerRow = React.memo(function PickerRow({
  row,
  canAdd,
  addBlockedReason,
  predictiveColumns,
  historicRawColumns,
  predictiveWidths,
  historicRawWidths,
  predictiveRanges,
  historicRawRanges,
  onAdd,
  onViewProfile,
}: PickerRowProps) {
  return (
    <tr
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(row.live.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{ cursor: "grab" }}
    >
      <td className="picker-sticky-player">
        <div className="player-name-cell">
          <span
            className={`name ${availabilityTextClass(row.live.status)}`}
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile(row.live.id);
            }}
            style={{ cursor: "pointer" }}
            title="View profile"
          >
            {row.live.name}
            <AvailabilityFlag status={row.live.status} news={row.live.news} chanceOfPlayingNextRound={row.live.chanceOfPlayingNextRound} />
          </span>
          <span className="meta">
            {fmtPrice(row.live.price)}
            <TeamBadge teamId={row.live.teamId} shortName={row.live.teamShortName} />
            <PositionBadge position={row.live.position} />
            <button
              type="button"
              className="inline-add-btn"
              disabled={!canAdd}
              title={canAdd ? "Add to squad" : addBlockedReason}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(row.live);
              }}
            >
              Add
            </button>
          </span>
        </div>
      </td>
      {predictiveColumns.map((c) => {
        const width = predictiveWidths[c.key];
        return (
          <td
            key={c.key}
            style={{
              ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
              backgroundColor: predictiveTint(predictiveRanges, row, c),
            }}
          >
            {c.renderCell(row)}
          </td>
        );
      })}
      {historicRawColumns.map((c, i) => {
        const value = row.historicRaw ? c.getValue(row.historicRaw, row.historicDerived) : null;
        const isSignedMetric = c.key === "goalsMinusXG" || c.key === "assistsMinusXA";
        const width = historicRawWidths[c.key];
        return (
          <td
            key={c.key}
            className={i === 0 ? "column-group-divider" : undefined}
            style={{
              ...(width ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
              backgroundColor: historicRawTint(historicRawRanges, row, c),
            }}
          >
            {isSignedMetric ? <SignedNum value={value} /> : c.format(value)}
          </td>
        );
      })}
    </tr>
  );
});
/** Same meaning as isStaticColumn (playerColumns.tsx), for this page's own local PredictiveColumnDef type. */
function isStaticPredictiveColumn(c: PredictiveColumnDef): boolean {
  return c.varies === false;
}

/**
 * The same live-mode bypass every other page's effectiveMinMinutes()
 * applies (see state/useFilteredPlayers.ts) — extracted as its own function
 * here since the Add Players picker's Min Minutes is a standalone number,
 * not part of a GlobalScoutingFilters object. Mid-season, most players
 * haven't accumulated many live-season minutes yet, so a minutes floor in
 * "live" mode would silently collapse the candidate pool rather than narrow
 * it — this control used to be the one exception to that rule (M6 in the
 * Phase 1 audit).
 */
export function pickerEffectiveMinMinutes(mode: AnalysisMode, minMinutes: number | null): number | null {
  return mode === "live" ? null : minMinutes;
}

export function TeamBuilder() {
  const { players, teams, teamsById, fixtures, historicProfiles, historicStatus, currentSeasonHasStarted, gameweekState, requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const { squads, upsert, remove } = useSavedSquads();
  const [, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(squads[0]?.id ?? null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPosition, setPickerPosition] = useState<"ALL" | Position>("ALL");
  const [pickerTeamId, setPickerTeamId] = useState<"ALL" | number>("ALL");
  const [pickerMinMinutes, setPickerMinMinutes] = useState<number | null>(null);
  const [captainPickMode, setCaptainPickMode] = useState<"captain" | "viceCaptain" | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [gwOffset, setGwOffset] = useState<GwOffset>(1);
  const [showNewSquadModal, setShowNewSquadModal] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importTeamIdInput, setImportTeamIdInput] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [pickerHistoricMode, setPickerHistoricMode] = useState<AnalysisMode>("lastSeason");
  const [showPredictiveColumnPopover, setShowPredictiveColumnPopover] = useState(false);
  const columnFiltersState = useColumnFilters();
  const [showHistoricRawColumnPopover, setShowHistoricRawColumnPopover] = useState(false);
  // Always the current render's handlePickerFitToBox (assigned below it):
  // the window-resize listener is registered once, and the drag-resize end
  // callback is kept by the column hook, so both would otherwise run the
  // first render's copy, which sizes the budget for that render's columns.
  const pickerFitRef = useRef<() => void>(() => {});
  const predictiveCols = useColumnCustomization(DEFAULT_PREDICTIVE_COLUMN_KEYS, {}, () => pickerFitRef.current());
  const historicRawCols = useColumnCustomization(DEFAULT_HISTORIC_RAW_COLUMN_KEYS, {}, () => pickerFitRef.current());
  const { sort: pickerSort, setSort: setPickerSort, handleHeaderClick: handlePickerHeaderClick } = useSortSpec(PICKER_DEFAULT_SORT);
  const pickerTableWrapRef = useRef<HTMLDivElement>(null);

  // Keep activeId pointing at a real squad even after a delete/first-load.
  useEffect(() => {
    if (!squads.some((s) => s.id === activeId)) setActiveId(squads[0]?.id ?? null);
  }, [squads, activeId]);

  // Auto-clears any drag-rejection warning after a few seconds.
  useEffect(() => {
    if (!warning) return;
    const timer = setTimeout(() => setWarning(null), WARNING_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [warning]);

  const active = squads.find((s) => s.id === activeId) ?? null;

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  function updateActive(mutator: (s: SavedSquad) => SavedSquad) {
    if (!active) return;
    upsert(mutator(active));
  }

/** Opens the New Squad dialog, clearing any state left over from a previous open/attempt. */
  function openNewSquadModal() {
    setNewSquadName("");
    setImportTeamIdInput("");
    setImportStatus("idle");
    setImportError(null);
    setShowNewSquadModal(true);
  }

  function closeNewSquadModal() {
    setShowNewSquadModal(false);
  }

  /**
   * The New Squad dialog's single action: an FPL team ID (if entered) always
   * wins over a blank-template name, since a non-empty ID unambiguously
   * means "import this real team" — a name typed into the other field first
   * and left in place shouldn't silently block that.
   */
  async function handleCreateOrImportSquad() {
    if (squads.length >= MAX_SAVED_SQUADS) {
      setImportError(`You already have ${MAX_SAVED_SQUADS} saved squads — the maximum allowed. Delete one first.`);
      setImportStatus("error");
      return;
    }
    const trimmedTeamId = importTeamIdInput.trim();
    if (trimmedTeamId) {
      const teamId = Number(trimmedTeamId);
      if (!Number.isFinite(teamId) || teamId <= 0) {
        setImportError("Enter a valid FPL team ID — the number in your team's URL (fantasy.premierleague.com/entry/1234567/...).");
        setImportStatus("error");
        return;
      }
      setImportStatus("loading");
      setImportError(null);
      try {
        const teamResult = await fetchEntryTeam(teamId);
        const fallbackEvent = gameweekState?.kind === "current" || gameweekState?.kind === "last-completed" ? gameweekState.event.id : 1;
        const eventId = teamResult.data.current_event ?? fallbackEvent;
        const [historyResult, picksResult] = await Promise.all([fetchEntryHistory(teamId), fetchEntryPicks(teamId, eventId)]);
        const { squad, warnings } = normalizeEntryImport(teamResult.data, historyResult.data, picksResult.data, eventId, playersById);
        upsert(squad);
        setActiveId(squad.id);
        setShowNewSquadModal(false);
        if (warnings.length > 0) {
          setWarning(`Imported with ${warnings.length} note(s): ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1} more — check the browser console)` : ""}`);
          // eslint-disable-next-line no-console
          console.warn("FPL team import warnings:", warnings);
        }
      } catch (err) {
        setImportStatus("error");
        if (err instanceof ApiRequestError) {
          setImportError(err.status === 404 ? "No FPL team found with that ID." : `Couldn't load that team (${err.message}).`);
        } else {
          setImportError("Couldn't reach the FPL API — check your connection and try again.");
        }
      }
      return;
    }
    const trimmedName = newSquadName.trim();
    if (!trimmedName) {
      setImportError("Enter a squad name, or an FPL team ID to import.");
      setImportStatus("error");
      return;
    }
    const blank = createBlankSquad(trimmedName);
    upsert(blank);
    setActiveId(blank.id);
    setShowNewSquadModal(false);
  }

  function handleDelete() {
    if (!active) return;
    setConfirmDeleteId(active.id);
  }

  function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    remove(confirmDeleteId);
    setConfirmDeleteId(null);
  }

  function handleAdd(player: NormalizedPlayer) {
    updateActive((s) => ({ ...s, playerIds: [...s.playerIds, player.id] }));
  }

  function handleRemovePlayer(playerId: number) {
    updateActive((s) => ({
      ...s,
      playerIds: s.playerIds.filter((id) => id !== playerId),
      startingXI: s.startingXI.filter((id) => id !== playerId),
      captainId: s.captainId === playerId ? null : s.captainId,
      viceCaptainId: s.viceCaptainId === playerId ? null : s.viceCaptainId,
    }));
  }

  /** Empties the squad and bench in one click — keeps the saved squad's own name/id, just clears its contents (players, starting XI, captain/vice-captain all reset together, since none of them mean anything without a squad to belong to). */
  function handleClearSquad() {
    updateActive((s) => ({
      ...s,
      playerIds: [],
      startingXI: [],
      captainId: null,
      viceCaptainId: null,
    }));
  }

  /**
   * The single validated rule for moving one player between bench and
   * starting XI: caps the starting XI at 11, and auto-benches the other
   * goalkeeper if a second one starts (exactly one GKP starts at a time).
   * Pure so a swap (below) can safely apply it twice in one update.
   */
  function toggleStartingCore(s: SavedSquad, playerId: number): SavedSquad {
    const isStarting = s.startingXI.includes(playerId);
    if (isStarting) {
      return {
        ...s,
        startingXI: s.startingXI.filter((id) => id !== playerId),
        captainId: s.captainId === playerId ? null : s.captainId,
        viceCaptainId: s.viceCaptainId === playerId ? null : s.viceCaptainId,
      };
    }
    if (s.startingXI.length >= SQUAD_RULES.startingXISize) return s; // full — no-op
    const player = playersById.get(playerId);
    if (player?.position === "GKP") {
      const otherGkpId = s.startingXI.find((id) => playersById.get(id)?.position === "GKP");
      const withoutOtherGkp = otherGkpId ? s.startingXI.filter((id) => id !== otherGkpId) : s.startingXI;
      return { ...s, startingXI: [...withoutOtherGkp, playerId] };
    }
    return { ...s, startingXI: [...s.startingXI, playerId] };
  }

  function handleToggleStarting(playerId: number) {
    updateActive((s) => toggleStartingCore(s, playerId));
  }

  /**
   * Adds a player who ISN'T in the squad yet (dragged straight from the
   * picker), validating the same budget/composition/club-limit rules the
   * "Add" button uses. Shows a brief warning banner with the reason when
   * rejected — the picker's own "Add" button also has a disabled-state
   * tooltip, but a drag that silently does nothing is confusing on its
   * own.
   */
  function handleAddDraggedPlayer(draggedId: number, startImmediately: boolean) {
    if (!active || active.playerIds.includes(draggedId)) return;
    const player = playersById.get(draggedId);
    if (!player) return;
    const check = canAddPlayer(squadPlayers, player);
    if (!check.ok) {
      setWarning(`Can't add ${player.name}: ${check.reason}`);
      return;
    }
    updateActive((s) => {
      const withPlayer: SavedSquad = { ...s, playerIds: [...s.playerIds, draggedId] };
      return startImmediately ? toggleStartingCore(withPlayer, draggedId) : withPlayer;
    });
  }

  /** Drag-and-drop: dropped one player directly onto another on the pitch/bench — swaps their starting/bench status, or (if the dragged player is new) adds them into the target's zone. */
  function handleSwapPlayers(draggedId: number, targetId: number, targetZone: "pitch" | "bench") {
    if (draggedId === targetId || !active) return;
    if (!active.playerIds.includes(draggedId)) {
      if (targetZone === "pitch") handleAddDraggedPlayer(draggedId, true);
      else handleAddDraggedPlayer(draggedId, false);
      return;
    }
    updateActive((s) => {
      const draggedIsStarting = s.startingXI.includes(draggedId);
      const targetIsStarting = s.startingXI.includes(targetId);
      if (draggedIsStarting === targetIsStarting) return s; // both starting or both bench — nothing to swap
      // Bench whichever one is leaving the XI first, so there's room for the other to join it.
      if (draggedIsStarting) {
        return toggleStartingCore(toggleStartingCore(s, draggedId), targetId);
      }
      return toggleStartingCore(toggleStartingCore(s, targetId), draggedId);
    });
  }

  /** Drag-and-drop: dropped onto open pitch space — starts the player, adding them to the squad first if they're new. */
  function handleDropOnPitch(draggedId: number) {
    if (!active) return;
    if (active.playerIds.includes(draggedId)) {
      if (!active.startingXI.includes(draggedId)) handleToggleStarting(draggedId);
    } else {
      handleAddDraggedPlayer(draggedId, true);
    }
  }

  /** Drag-and-drop: dropped onto open bench space — benches the player, adding them to the squad first if they're new. */
  function handleDropOnBench(draggedId: number) {
    if (!active) return;
    if (active.playerIds.includes(draggedId)) {
      if (active.startingXI.includes(draggedId)) handleToggleStarting(draggedId);
    } else {
      handleAddDraggedPlayer(draggedId, false);
    }
  }

  function handleSetCaptain(playerId: number | null) {
    updateActive((s) => ({ ...s, captainId: playerId, viceCaptainId: s.viceCaptainId === playerId ? null : s.viceCaptainId }));
  }

  function handleSetViceCaptain(playerId: number | null) {
    updateActive((s) => ({ ...s, viceCaptainId: playerId, captainId: s.captainId === playerId ? null : s.captainId }));
  }

  /**
   * The card itself is already a click target (captain-assign) and a
   * drag source (bench/starting swap), so viewing a profile needs its
   * own distinct reference point rather than reusing the card's own
   * click — this is called from the player's name specifically, which
   * stops propagation before it reaches the card's onClick.
   */
  function handleViewProfile(playerId: number) {
    setSearchParams((prev) => ({ ...Object.fromEntries(prev), player: String(playerId) }));
  }

  /** The C/V tiles arm "pick" mode; clicking a tile again while it's already armed cancels it. */
  function handleCaptainTileClick(role: "captain" | "viceCaptain") {
    setCaptainPickMode((mode) => (mode === role ? null : role));
  }

  /**
   * Divides the available width evenly across BOTH column groups (not
   * per-group) so every visible column — predictive or historic/raw —
   * ends up the same width, rather than the two groups drifting to
   * different sizes depending on which has more columns showing.
   */
  function handlePickerFitToBox() {
    const container = pickerTableWrapRef.current;
    if (!container) return;
    const totalColumns = predictiveCols.visibleColumns.length + historicRawCols.visibleColumns.length;
    if (totalColumns === 0) return;
    const available = container.clientWidth - PICKER_PINNED_WIDTH - 4;
    const perColumn = Math.max(MIN_COLUMN_WIDTH, Math.floor(available / totalColumns));
    predictiveCols.fitToBox(perColumn * predictiveCols.visibleColumns.length);
    historicRawCols.fitToBox(perColumn * historicRawCols.visibleColumns.length);
  }
  pickerFitRef.current = handlePickerFitToBox;

  /** Hiding a column also drops its filter and its sort, so nothing keeps shaping the table from a column you can't see. */
  function togglePickerColumn(cols: UseColumnCustomization, key: string) {
    if (cols.visibleColumns.includes(key)) {
      columnFiltersState.clearFilter(key);
      setPickerSort((prev) => sortWithoutHiddenColumn(prev, key, PICKER_DEFAULT_SORT));
    }
    cols.toggleColumn(key);
  }

  function handleResetPickerColumns() {
    predictiveCols.resetColumns();
    historicRawCols.resetColumns();
  }

  function handleClearPickerFilters() {
    setPickerSearch("");
    setPickerPosition("ALL");
    setPickerTeamId("ALL");
    setPickerMinMinutes(null);
    columnFiltersState.resetAllFilters();
  }

  // Column widths auto-fit the picker table's available width — on first
  // mount, whenever either column group's visible-column count changes (so
  // toggling a column on/off never leaves the table overflowing or oddly
  // narrow), and on window resize. No dependency on `pickerRows` (computed
  // further down, before the early-return guard — see <hooks_before_
  // early_return> below): this just checks the ref directly on every
  // render until the table has actually mounted, then the ref flag makes
  // every render after that a no-op for the "first mount" case.
  const hasAutoFitPickerRef = useRef(false);
  useEffect(() => {
    if (hasAutoFitPickerRef.current || !pickerTableWrapRef.current) return;
    hasAutoFitPickerRef.current = true;
    handlePickerFitToBox();
  });
  useEffect(() => {
    if (!hasAutoFitPickerRef.current) return;
    handlePickerFitToBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictiveCols.visibleColumns.length, historicRawCols.visibleColumns.length]);

  useEffect(() => {
    function onResize() {
      pickerFitRef.current();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * With a tile armed, clicking a starting player assigns them. Otherwise,
   * clicking the current captain/vice-captain removes that designation —
   * a plain click on anyone else does nothing.
   */
  function handlePlayerCardClick(playerId: number) {
    if (!active) return;
    if (captainPickMode) {
      if (active.startingXI.includes(playerId)) {
        if (captainPickMode === "captain") handleSetCaptain(playerId);
        else handleSetViceCaptain(playerId);
      }
      setCaptainPickMode(null);
      return;
    }
    if (active.captainId === playerId) handleSetCaptain(null);
    else if (active.viceCaptainId === playerId) handleSetViceCaptain(null);
  }

  // <hooks_before_early_return>: every hook call in this component must
  // happen unconditionally, in the same order, on every render — React's
  // Rules of Hooks, not a style preference. The `if (!active) return` guard
  // below therefore comes AFTER every hook this component uses (including
  // the ones several of these derived values feed into), never before it.
  // This used to be violated: fixturesByTeamId/predictiveColumnsInOrder/
  // historicRawColumnsInOrder/pickerRows were all declared with useMemo
  // AFTER the guard, meaning React called a different number of hooks on a
  // render where `active` was briefly null (e.g. the one render right
  // after deleting the currently-active squad, before the correcting
  // useEffect elsewhere in this file catches up) than on a normal render —
  // exactly the condition React detects and throws on ("Rendered fewer
  // hooks than expected"), which with no error boundary in this app
  // presents as the page going blank. Fixed by moving every hook (and the
  // handful of plain values they depend on) above the guard, using
  // `active?.x ?? <empty default>` wherever they'd otherwise dereference a
  // possibly-null `active` directly. Values that AREN'T hooks and aren't a
  // hook's dependency (epResult, reliability, differentials, mix) stay
  // below the guard as before — only real hooks have this constraint.
  // Memoized (on active — stable per useSavedSquads' state, not active's
  // own contents — and playersById) so it doesn't get a fresh array
  // identity every render; expectedPointsByPlayerId/reliabilityByPlayerId
  // below key off this and would otherwise never actually skip recompute.
  const squadPlayers = useMemo(
    () => (active ? active.playerIds.map((id) => playersById.get(id)).filter((p): p is NormalizedPlayer => !!p) : []),
    [active, playersById],
  );
  const startingXIPlayers = active ? active.startingXI.map((id) => playersById.get(id)).filter((p): p is NormalizedPlayer => !!p) : [];
  const squadPlayerIdSet = new Set(squadPlayers.map((p) => p.id));
  const benchPlayers = squadPlayers.filter((p) => !(active?.startingXI.includes(p.id) ?? false));
  const pitchPositionGroups: Record<Position, NormalizedPlayer[]> = {
    GKP: startingXIPlayers.filter((p) => p.position === "GKP"),
    DEF: startingXIPlayers.filter((p) => p.position === "DEF"),
    MID: startingXIPlayers.filter((p) => p.position === "MID"),
    FWD: startingXIPlayers.filter((p) => p.position === "FWD"),
  };

  const squadValidation = validateSquad(squadPlayers);
  const xiValidation = validateStartingXI(startingXIPlayers);

  // Upcoming fixtures for every club (cheap — 20 clubs), reused below for
  // both the squad's expected-points map and the picker's sort/display,
  // rather than recomputed per player.
  // Memoized for the same reason pickerRows now is: an unmemoized Map
  // gets a new identity every render even when nothing it's built from
  // has changed, which would silently defeat pickerRows' own
  // memoisation despite that being the whole point of adding it.
  const fixturesByTeamId = useMemo(() => {
    const map = new Map<number, UpcomingFixture[]>();
    for (const team of teamsById.values()) {
      map.set(team.id, getUpcomingFixtures(team.id, fixtures, teamsById));
    }
    return map;
  }, [teamsById, fixtures]);

  // Blended (historic + live, availability-adjusted) minutes reliability,
  // keyed by id — see metrics/minutesReliabilityBlend.ts. Computed ahead
  // of the two Expected Points maps below since Tier 2 needs it as an input.
  const reliabilityByPlayerId = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const p of squadPlayers) {
      map.set(p.id, computeBlendedMinutesReliability(p, teamsById.get(p.teamId), historicProfiles.get(p.id)).value);
    }
    return map;
  }, [squadPlayers, teamsById, historicProfiles]);

  // Expected points for whichever single upcoming fixture the pitch-view
  // navigator currently has selected (gwOffset 1 = the very next fixture)
  // — FPL's own ep_next for that fixture, fixture-difficulty-extended if
  // it isn't the immediate one (see metrics/expectedPoints.ts). Not yet
  // captain-doubled; SquadPitch doubles it for display on the captain's card.
  const expectedPointsByPlayerId = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const p of squadPlayers) {
      const fixture = (fixturesByTeamId.get(p.teamId) ?? [])[gwOffset - 1];
      map.set(p.id, fixture ? computeExpectedPointsForSingleFixture(p, fixture, gwOffset - 1) : null);
    }
    return map;
  }, [squadPlayers, fixturesByTeamId, gwOffset]);

  // Expected Points Tier 2 — this app's own independent per-event estimate
  // for the same navigator-selected fixture (see metrics/expectedPointsV2.ts).
  const modelPredictedByPlayerId = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const p of squadPlayers) {
      const fixture = (fixturesByTeamId.get(p.teamId) ?? [])[gwOffset - 1];
      const reliability = reliabilityByPlayerId.get(p.id) ?? null;
      if (!fixture || reliability === null) {
        map.set(p.id, null);
        continue;
      }
      const ownTeam = teamsById.get(p.teamId);
      const opponentTeam = teamsById.get(fixture.opponentTeamId);
      const breakdown = computeExpectedPointsV2ForFixture(p, fixture, ownTeam, opponentTeam, reliability, historicProfiles.get(p.id));
      map.set(p.id, breakdown.total);
    }
    return map;
  }, [squadPlayers, fixturesByTeamId, gwOffset, reliabilityByPlayerId, teamsById, historicProfiles]);

  const predictiveColumnsInOrder = useMemo(
    () => predictiveCols.visibleColumns.map((key) => PREDICTIVE_COLUMNS.find((c) => c.key === key)).filter((c): c is PredictiveColumnDef => !!c),
    [predictiveCols.visibleColumns],
  );
  const historicRawColumnsInOrder = useMemo(
    () => historicRawCols.visibleColumns.map((key) => columnByKey(key)).filter((c): c is PlayerColumn => !!c),
    [historicRawCols.visibleColumns],
  );

  /** Resolves a sortable value for ANY column in the table — pinned identity columns, predictive columns, or historic/raw columns — so one comparator can drive header clicks anywhere. */
  function getPickerSortValue(row: PickerRowData, key: string): number | string | null {
    if (key === "name") return row.live.name;
    const predictiveCol = PREDICTIVE_COLUMNS.find((c) => c.key === key);
    if (predictiveCol) return predictiveCol.getValue(row);
    const historicCol = columnByKey(key);
    if (historicCol) return row.historicRaw ? historicCol.getValue(row.historicRaw, row.historicDerived) : null;
    return null;
  }

  /** Excel-style per-column filter, scoped to predictive/historic-raw columns only (the same reuse of getPickerSortValue that drives sorting). */
  function passesColumnFilters(row: PickerRowData): boolean {
    return columnFiltersState.passesAllFilters(
      (key) => getPickerSortValue(row, key),
      (key) => (PREDICTIVE_COLUMNS.find((c) => c.key === key) ?? columnByKey(key))?.decimals,
    );
  }

  // Memoized deliberately, unlike an earlier version of this file: this
  // computation runs computeBlendedMinutesReliability,
  // computeExpectedPointsForSingleFixture, and computeExpectedPointsV2ForFixture
  // (each several resolvePlayerStats-equivalent calls) for every candidate —
  // up to the whole unfiltered player base if no filters are applied. Without
  // memoization, every
  // state update anywhere in this component re-ran all of that,
  // including the state update fired on EVERY pointermove event while
  // dragging a column's resize handle — meaning a resize drag could
  // recompute the entire candidate pool many times a second. The
  // dependency list is long because the computation genuinely reads all
  // of these — `passesColumnFilters` and `getPickerSortValue` themselves
  // aren't included: they're plain functions recreated every render, so
  // depending on them directly would defeat the memoisation, but their
  // actual behaviour is fully determined by `columnFiltersState.columnFilters`
  // and `pickerSort` respectively (both listed), plus module-level
  // constants that never change across renders.
  //
  // Split into three steps — build, filter, sort — so each row object
  // survives a sort, a column filter or a squad change unchanged, and
  // PickerRow (memoized) only redraws rows whose figures actually changed.
  // Same filters, same order of application, same comparator as before.
  const pickerBuiltRows: PickerRowData[] = useMemo(() => {
    const search = pickerSearch.trim();
    return players
      .filter((p) => pickerPosition === "ALL" || p.position === pickerPosition)
      .filter((p) => pickerTeamId === "ALL" || p.teamId === pickerTeamId)
      .filter((p) => !search || matchesPlayerSearch(p, search))
      .map((p): PickerRowData => {
        const playerFixtures = fixturesByTeamId.get(p.teamId) ?? [];
        const historicProfile = historicProfiles.get(p.id);
        const reliability = computeBlendedMinutesReliability(p, teamsById.get(p.teamId), historicProfile).value;
        const fixture = playerFixtures[gwOffset - 1];
        const fplOfficial = fixture ? computeExpectedPointsForSingleFixture(p, fixture, gwOffset - 1) : null;
        let modelPredicted: number | null = null;
        let modelCaveats: string[] = [];
        if (fixture && reliability !== null) {
          const breakdown = computeExpectedPointsV2ForFixture(p, fixture, teamsById.get(p.teamId), teamsById.get(fixture.opponentTeamId), reliability, historicProfile);
          modelPredicted = breakdown.total;
          modelCaveats = breakdown.caveats;
        }
        const historicRaw = resolvePlayerStats(p, pickerHistoricMode, historicProfile, currentSeasonHasStarted);
        return {
          live: p,
          historicRaw,
          historicDerived: getPlayerDerivedMetrics(historicRaw),
          fixtures: playerFixtures.slice(0, 5),
          fplOfficial,
          modelPredicted,
          modelCaveats,
          reliability,
        };
      });
  }, [players, pickerSearch, pickerPosition, pickerTeamId, fixturesByTeamId, historicProfiles, pickerHistoricMode, currentSeasonHasStarted, gwOffset, teamsById]);

  const pickerCandidateRows: PickerRowData[] = useMemo(
    () =>
      pickerBuiltRows
        .filter((row) => !squadPlayerIdSet.has(row.live.id))
      // A player with no data at all for the selected Historic/Raw mode is
      // excluded whenever the user has explicitly set a minimum, same as
      // "doesn't meet the bar" would be — this is a deliberate, opt-in
      // narrowing filter for finding squad-building candidates (only
      // applies once pickerMinMinutes is actually set, and never in "live"
      // mode — see pickerEffectiveMinMinutes above), not the kind of
      // always-on default exclusion resolvePlayerStats.ts moved away from.
        .filter((row) => {
          const threshold = pickerEffectiveMinMinutes(pickerHistoricMode, pickerMinMinutes);
          return threshold === null || (row.historicRaw.minutes !== null && row.historicRaw.minutes >= threshold);
        })
        .filter(passesColumnFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickerBuiltRows, active?.playerIds, pickerHistoricMode, pickerMinMinutes, columnFiltersState.columnFilters],
  );

  const pickerRows: PickerRowData[] = useMemo(
    () =>
      [...pickerCandidateRows].sort((a, b) => {
        for (const s of pickerSort) {
          const cmp = compareSortValues(getPickerSortValue(a, s.key), getPickerSortValue(b, s.key), s.direction);
          if (cmp !== 0) return cmp;
        }
        return 0;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickerCandidateRows, pickerSort],
  );

  // Per-column min/max across every currently-filtered candidate — the
  // tint below is a "how does this compare to what you're currently
  // looking at" hint, matching how Player Comparison's colour scale is
  // also scoped to what's visible (with no cap, "visible" now means
  // everyone who matches the current filters, not a fixed subset).
  // Built from the unsorted candidates (the same players) so a sort alone
  // doesn't produce new ranges and redraw every row.
  const predictiveColumnRanges = useMemo(() => {
    const ranges: ColumnRanges = new Map();
    for (const c of predictiveColumnsInOrder) {
      const values = pickerCandidateRows.map((r) => c.getValue(r)).filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [predictiveColumnsInOrder, pickerCandidateRows]);
  const historicRawColumnRanges = useMemo(() => {
    const ranges: ColumnRanges = new Map();
    for (const c of historicRawColumnsInOrder) {
      const values = pickerCandidateRows
        .map((r) => (r.historicRaw ? c.getValue(r.historicRaw, r.historicDerived) : null))
        .filter((v): v is number => v !== null);
      if (values.length > 0) ranges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return ranges;
  }, [historicRawColumnsInOrder, pickerCandidateRows]);

  // Rows are drawn in stages (see useProgressiveRowCount); sorting,
  // filtering, tints and CSV export above all use the full pickerRows.
  const renderedPickerRowCount = useProgressiveRowCount(pickerRows.length);

  // Stable across renders, so memoized PickerRows don't redraw just because
  // this page did; the refs keep each call on the current render's handler.
  const handleAddRef = useRef(handleAdd);
  handleAddRef.current = handleAdd;
  const handleViewProfileRef = useRef(handleViewProfile);
  handleViewProfileRef.current = handleViewProfile;
  const addPickerPlayer = useCallback((player: NormalizedPlayer) => handleAddRef.current(player), []);
  const viewPickerProfile = useCallback((playerId: number) => handleViewProfileRef.current(playerId), []);

  function formatPredictiveCellForCsv(row: PickerRowData, c: PredictiveColumnDef): string {
    if (c.key === "reliability") return row.reliability !== null ? fmtPercent(row.reliability * 100, 0) : DASH;
    if (c.key === "fixtures") {
      if (row.fixtures.length === 0) return DASH;
      const codes = row.fixtures.map((f) => `${f.opponentShortName}(${f.isHome ? "H" : "A"})`).join(" ");
      const avg = averageFixtureDifficulty(row.fixtures);
      return avg !== null ? `${codes} avg FDR ${avg.toFixed(1)}` : codes;
    }
    return fmtDecimal(c.getValue(row), 1);
  }

  // Matches exactly what's on screen — same candidate rows (filtered/
  // sorted, squad members already excluded), same visible Predictive and
  // Historic/Raw columns in the same order, same formatted values.
  function handleExportPickerCsv() {
    const headers = [
      "Player",
      "Position",
      "Team",
      "Price",
      ...predictiveColumnsInOrder.map((c) => c.label),
      ...historicRawColumnsInOrder.map((c) => c.label),
    ];
    const rows = pickerRows.map((row) => {
      const predictiveCells = predictiveColumnsInOrder.map((c) => formatPredictiveCellForCsv(row, c));
      const historicRawCells = historicRawColumnsInOrder.map((c) => {
        const value = row.historicRaw ? c.getValue(row.historicRaw, row.historicDerived) : null;
        if (c.key === "goalsMinusXG" || c.key === "assistsMinusXA") return value !== null ? fmtSigned(value, 2) : DASH;
        return c.format(value);
      });
      return [row.live.name, row.live.position, row.live.teamShortName, fmtPrice(row.live.price), ...predictiveCells, ...historicRawCells];
    });
    downloadCsv(`team-building-add-players-${pickerHistoricMode}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team Building</h1>
        </div>
      </div>

      <div className="filters-bar">
        {active && (
          <>
            <div className="field">
              <label htmlFor="squad-select">Squad</label>
              <select id="squad-select" value={active.id} onChange={(e) => setActiveId(e.target.value)}>
                {squads.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="squad-name">Name</label>
              <input id="squad-name" type="text" value={active.name} onChange={(e) => updateActive((s) => ({ ...s, name: e.target.value }))} />
            </div>
            {active.importedFrom && (
              <span className="badge" title={`Loaded from FPL team ${active.importedFrom.teamId}, as of Gameweek ${active.importedFrom.asOfEvent}`}>
                {active.importedFrom.managerName || active.importedFrom.teamName} {"·"} GW{active.importedFrom.asOfEvent}
              </span>
            )}
          </>
        )}
        <button type="button" className="btn" onClick={openNewSquadModal}>
          New Squad
        </button>
        {active && (
          <button type="button" className="btn" onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>

      {showNewSquadModal && (
        <div className="dialog-backdrop" onClick={closeNewSquadModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">New Squad</div>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Create a blank squad template, or import a real squad from its FPL team ID.
            </p>
            <div className="field">
              <label htmlFor="new-squad-name">Squad name (blank template)</label>
              <input
                id="new-squad-name"
                type="text"
                placeholder="e.g. My Squad"
                value={newSquadName}
                onChange={(e) => setNewSquadName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOrImportSquad();
                }}
              />
            </div>
            <div className="dialog-divider">or</div>
            <div className="field">
              <label htmlFor="new-squad-team-id">FPL team ID (import)</label>
              <input
                id="new-squad-team-id"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1234567"
                value={importTeamIdInput}
                onChange={(e) => setImportTeamIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOrImportSquad();
                }}
              />
            </div>
            {importStatus === "error" && importError && <div className="banner error">{importError}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={closeNewSquadModal}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleCreateOrImportSquad} disabled={importStatus === "loading"}>
                {importStatus === "loading" ? "Loading…" : "Load/Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId &&
        (() => {
          const target = squads.find((s) => s.id === confirmDeleteId);
          if (!target) return null;
          return (
            <div className="dialog-backdrop" onClick={() => setConfirmDeleteId(null)}>
              <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="dialog-title">Delete squad</div>
                <p className="page-subtitle" style={{ marginTop: 0 }}>
                  Do you want to delete squad "{target.name}"?
                </p>
                <div className="dialog-actions">
                  <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ borderColor: "var(--accent-negative)", color: "var(--accent-negative)" }}
                    onClick={handleConfirmDelete}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">
          Squad ({squadPlayers.length}/{SQUAD_RULES.squadSize})
        </div>
        {xiValidation.size > 0 && !xiValidation.valid && <div className="banner info">Formation: {xiValidation.issues.join(" · ")}</div>}
        <SquadPitch
          squadName={active?.name ?? ""}
          squadValidation={squadValidation}
          positionGroups={pitchPositionGroups}
          benchPlayers={benchPlayers}
          captainId={active?.captainId ?? null}
          viceCaptainId={active?.viceCaptainId ?? null}
          expectedPointsByPlayerId={expectedPointsByPlayerId}
          modelPredictedByPlayerId={modelPredictedByPlayerId}
          reliabilityByPlayerId={reliabilityByPlayerId}
          fixturesByTeamId={fixturesByTeamId}
          gwOffset={gwOffset}
          onGwOffsetChange={setGwOffset}
          captainPickMode={captainPickMode}
          onCaptainTileClick={handleCaptainTileClick}
          onPlayerCardClick={handlePlayerCardClick}
          onViewProfile={handleViewProfile}
          onSwap={handleSwapPlayers}
          onAddToPitch={handleDropOnPitch}
          onBench={handleDropOnBench}
          onRemove={handleRemovePlayer}
          onClearSquad={handleClearSquad}
          warning={warning}
        />
      </div>

      {!active && (
        <div className="empty-state">
          <h3>No squad loaded</h3>
          <p>Create a blank squad or import a real one from its FPL team ID using "New Squad" above to start adding players.</p>
        </div>
      )}

      {active && (
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">Add Players</div>
        <div className="filters-bar" style={{ marginBottom: 12 }}>
          <div className="field">
            <label htmlFor="picker-search">Search</label>
            <input id="picker-search" type="text" placeholder="Player name…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="picker-position">Position</label>
            <select id="picker-position" value={pickerPosition} onChange={(e) => setPickerPosition(e.target.value as "ALL" | Position)}>
              <option value="ALL">All</option>
              <option value="GKP">Goalkeeper</option>
              <option value="DEF">Defender</option>
              <option value="MID">Midfielder</option>
              <option value="FWD">Forward</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="picker-team">Team</label>
            <select id="picker-team" value={pickerTeamId} onChange={(e) => setPickerTeamId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
              <option value="ALL">All</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.shortName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="picker-min-minutes">Min minutes</label>
            <input
              id="picker-min-minutes"
              type="number"
              step={90}
              min={0}
              value={pickerMinMinutes ?? ""}
              placeholder="Any"
              disabled={pickerHistoricMode === "live"}
              title={
                pickerHistoricMode === "live"
                  ? "Not applied in Current Season mode — everyone has low or zero minutes until real gameweeks accumulate"
                  : "Minutes in whichever Historic/Raw mode is selected below — a player with no data at all for that mode is excluded once a minimum is set"
              }
              onChange={(e) => setPickerMinMinutes(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        </div>

        <div className="icon-toolbar" style={{ marginBottom: 12 }}>
          <IconChipButton icon={<ResetIcon />} label="Restore default columns, order, and natural widths" onClick={handleResetPickerColumns} />
          <div style={{ position: "relative" }}>
            <IconChipButton
              icon={<SparkleIcon />}
              label={`Predictive Columns (${predictiveCols.visibleColumns.length} shown)`}
              badge={predictiveCols.visibleColumns.length}
              onClick={() => setShowPredictiveColumnPopover((v) => !v)}
            />
            {showPredictiveColumnPopover && (
              <div className="popover" style={{ left: 0, right: "auto" }}>
                {PREDICTIVE_COLUMNS.map((c) => (
                  <label key={c.key}>
                    <input type="checkbox" checked={predictiveCols.visibleColumns.includes(c.key)} onChange={() => togglePickerColumn(predictiveCols, c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <IconChipButton
              icon={<ClockIcon />}
              label={`Historic/Raw Columns (${historicRawCols.visibleColumns.length} shown)`}
              badge={historicRawCols.visibleColumns.length}
              onClick={() => setShowHistoricRawColumnPopover((v) => !v)}
            />
            {showHistoricRawColumnPopover && (
              <div className="popover" style={{ left: 0, right: "auto" }}>
                {HISTORIC_RAW_GROUPS.map((group) => (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>
                      {group}
                    </div>
                    {HISTORIC_RAW_COLUMNS.filter((c) => c.group === group).map((c) => (
                      <label key={c.key}>
                        <input
                          type="checkbox"
                          checked={historicRawCols.visibleColumns.includes(c.key)}
                          onChange={() => togglePickerColumn(historicRawCols, c.key)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <IconChipButton
            icon={<FilterIcon />}
            label="Clear every picker filter — search, position, team, price, minutes, and any per-column filters"
            onClick={handleClearPickerFilters}
          />
          <IconChipButton icon={<DownloadIcon />} label="Export the visible columns and current rows to a CSV file" onClick={handleExportPickerCsv} />
        </div>

        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Predictive columns show:</div>
            <p className="page-subtitle" style={{ margin: 0, maxWidth: 320 }}>
              GW+{gwOffset} — use the gameweek navigator on the pitch above to change which upcoming fixture both Exp. Pts columns estimate.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Historic/raw columns show:</div>
            <div style={{ display: "flex", gap: 6 }}>
              {PICKER_HISTORIC_MODE_OPTIONS.map((o) => (
                <button
                  key={o.mode}
                  type="button"
                  className="btn btn-icon"
                  aria-pressed={pickerHistoricMode === o.mode}
                  title={o.label}
                  aria-label={o.label}
                  style={pickerHistoricMode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
                  onClick={() => setPickerHistoricMode(o.mode)}
                >
                  <AnalysisModeIcon mode={o.mode} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {historicStatus === "loading" && (
          <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
            Still building historic data — Historic/Raw columns and Minutes Reliability will fill in shortly.
          </p>
        )}

        <div className="table-wrap" ref={pickerTableWrapRef} style={{ maxHeight: 420 }}>
          <table className="data-table compact resizable-columns">
            <thead>
              <tr>
                <th
                  className="picker-sticky-player"
                  onClick={(e) => handlePickerHeaderClick("name", e.shiftKey)}
                  title="Click to sort · Shift-click to add secondary sort"
                >
                  Player
                  {pickerSort.find((s) => s.key === "name") && (
                    <span className="sort-indicator">{pickerSort.find((s) => s.key === "name")!.direction === "asc" ? "\u2191" : "\u2193"}</span>
                  )}
                </th>
                {predictiveColumnsInOrder.map((c) => {
                  const width = predictiveCols.columnWidths[c.key];
                  const sortEntry = pickerSort.find((s) => s.key === c.key);
                  return (
                    <th
                      key={c.key}
                      className={isStaticPredictiveColumn(c) ? "col-static" : undefined}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.key)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (predictiveCols.dragOverKey !== c.key) predictiveCols.setDragOverKey(c.key);
                      }}
                      onDragLeave={() => predictiveCols.setDragOverKey((k) => (k === c.key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        predictiveCols.setDragOverKey(null);
                        const draggedKey = e.dataTransfer.getData("text/plain");
                        if (draggedKey && draggedKey !== c.key) predictiveCols.reorderColumn(draggedKey, c.key);
                      }}
                      onClick={(e) => handlePickerHeaderClick(c.key, e.shiftKey)}
                      title={
                        isStaticPredictiveColumn(c)
                          ? "Always today's live figure, regardless of the toggle above · Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                          : "Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                      }
                      style={{
                        position: "relative",
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        cursor: "grab",
                        outline: predictiveCols.dragOverKey === c.key ? "2px dashed var(--accent-focus)" : undefined,
                        outlineOffset: predictiveCols.dragOverKey === c.key ? -2 : undefined,
                      }}
                    >
                      {c.label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                      <ColumnFilterControl
                        isOpen={columnFiltersState.openFilterKey === c.key}
                        isActive={isColumnFilterActive(columnFiltersState.columnFilters[c.key])}
                        filterDraft={columnFiltersState.filterDraft}
                        onOpen={() => columnFiltersState.openFilter(c.key)}
                        onCancel={columnFiltersState.cancelFilter}
                        onConfirm={columnFiltersState.confirmFilter}
                        onDraftChange={columnFiltersState.setFilterDraft}
                      />
                      <span
                        className={`column-resize-handle${predictiveCols.resizingKey === c.key ? " resizing" : ""}`}
                        draggable={false}
                        onPointerDown={(e) => predictiveCols.startResize(e, c.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
                {historicRawColumnsInOrder.map((c, i) => {
                  const width = historicRawCols.columnWidths[c.key];
                  const sortEntry = pickerSort.find((s) => s.key === c.key);
                  return (
                    <th
                      key={c.key}
                      className={[i === 0 ? "column-group-divider" : null, isStaticColumn(c) ? "col-static" : null].filter(Boolean).join(" ") || undefined}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.key)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (historicRawCols.dragOverKey !== c.key) historicRawCols.setDragOverKey(c.key);
                      }}
                      onDragLeave={() => historicRawCols.setDragOverKey((k) => (k === c.key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        historicRawCols.setDragOverKey(null);
                        const draggedKey = e.dataTransfer.getData("text/plain");
                        if (draggedKey && draggedKey !== c.key) historicRawCols.reorderColumn(draggedKey, c.key);
                      }}
                      onClick={(e) => handlePickerHeaderClick(c.key, e.shiftKey)}
                      title={
                        isStaticColumn(c)
                          ? "Always today's live figure, regardless of the toggle above · Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                          : "Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
                      }
                      style={{
                        position: "relative",
                        width: width ? `${width}px` : undefined,
                        maxWidth: width ? `${width}px` : undefined,
                        cursor: "grab",
                        outline: historicRawCols.dragOverKey === c.key ? "2px dashed var(--accent-focus)" : undefined,
                        outlineOffset: historicRawCols.dragOverKey === c.key ? -2 : undefined,
                      }}
                    >
                      {c.label}
                      {sortEntry && <span className="sort-indicator">{sortEntry.direction === "asc" ? "\u2191" : "\u2193"}</span>}
                      <ColumnFilterControl
                        isOpen={columnFiltersState.openFilterKey === c.key}
                        isActive={isColumnFilterActive(columnFiltersState.columnFilters[c.key])}
                        filterDraft={columnFiltersState.filterDraft}
                        onOpen={() => columnFiltersState.openFilter(c.key)}
                        onCancel={columnFiltersState.cancelFilter}
                        onConfirm={columnFiltersState.confirmFilter}
                        onDraftChange={columnFiltersState.setFilterDraft}
                      />
                      <span
                        className={`column-resize-handle${historicRawCols.resizingKey === c.key ? " resizing" : ""}`}
                        draggable={false}
                        onPointerDown={(e) => historicRawCols.startResize(e, c.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pickerRows.slice(0, renderedPickerRowCount).map((row) => {
                const check = canAddPlayer(squadPlayers, row.live);
                return (
                  <PickerRow
                    key={row.live.id}
                    row={row}
                    canAdd={check.ok}
                    addBlockedReason={check.reason}
                    predictiveColumns={predictiveColumnsInOrder}
                    historicRawColumns={historicRawColumnsInOrder}
                    predictiveWidths={predictiveCols.columnWidths}
                    historicRawWidths={historicRawCols.columnWidths}
                    predictiveRanges={predictiveColumnRanges}
                    historicRawRanges={historicRawColumnRanges}
                    onAdd={addPickerPlayer}
                    onViewProfile={viewPickerProfile}
                  />
                );
              })}
              {pickerRows.length === 0 && (
                <tr>
                  <td colSpan={1 + predictiveColumnsInOrder.length + historicRawColumnsInOrder.length} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No players match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

    </div>
  );
}
