import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useSavedSquads } from "../state/useSavedSquads";
import { useColumnCustomization, MIN_COLUMN_WIDTH } from "../state/useColumnCustomization";
import { useColumnFilters, isColumnFilterActive } from "../state/useColumnFilters";
import { ColumnFilterControl } from "../components/ColumnFilterControl";
import { useSortSpec, compareSortValues } from "../state/useSortSpec";
import { SQUAD_RULES, createBlankSquad, type SavedSquad } from "../types/team";
import { validateSquad, validateStartingXI, canAddPlayer } from "../metrics/squadRules";
import { expectedGameweekPoints, minutesReliability, findDifferentials, archetypeMix, computeChipAdjustedExpectedPoints, type ExpectedPointsChip } from "../metrics/squadRating";
import { computeArchetypesForAllPlayers, ARCHETYPE_LABELS, type ArchetypeLabel } from "../metrics/archetypes";
import { resolvePlayerStats, resolvePlayerStatsList, type AnalysisMode } from "../metrics/resolvePlayerStats";
import { getPlayerDerivedMetrics } from "../metrics/playerMetrics";
import { computeExpectedPointsForWindow, computeExpPointsBreakdown, type ExpectedPointsWindow, type ExpPointsBreakdown } from "../metrics/expectedPoints";
import { findSingleTransferSuggestions, findDoubleTransferSuggestions, type TransferSuggestion } from "../metrics/transferSolver";
import { isChipUsedForWindow } from "../metrics/chipPlanner";
import { fetchEntryTeam, fetchEntryHistory, fetchEntryPicks, ApiRequestError } from "../api/client";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import { buildOptimalDraft, isDraftFailure } from "../metrics/optimalDraft";
import { computeBlendedMinutesReliability } from "../metrics/minutesReliabilityBlend";
import { bandForPercentile } from "../metrics/percentiles";
import { getUpcomingFixtures, fdrColor, type UpcomingFixture } from "../metrics/fixtureTicker";
import { PLAYER_COLUMNS, DEFAULT_VISIBLE_COLUMNS, columnByKey, type ColumnGroup, type PlayerColumn } from "../components/playerColumns";
import { SquadPitch } from "../components/SquadPitch";
import { PositionBadge, AvailabilityFlag, SignedNum, availabilityTextClass } from "../components/primitives";
import { fmtPrice, fmtDecimal, fmtPercent, DASH } from "../utils/format";
import { relativeCellTint } from "../utils/colorScale";
import type { NormalizedPlayer, Position, ChipWindow } from "../types/normalized";

/** How long a rejected drag's warning message stays visible before clearing itself. */
const WARNING_DISPLAY_MS = 4000;
const EXPECTED_POINTS_WINDOWS: ExpectedPointsWindow[] = [1, 3, 5];
const HISTORIC_RAW_GROUPS: ColumnGroup[] = ["ACTUAL OUTPUT", "UNDERLYING PERFORMANCE", "VALUE", "ADVANCED"];
const PICKER_HISTORIC_MODE_OPTIONS: { mode: AnalysisMode; label: string }[] = [
  { mode: "lastSeason", label: "Last Completed Season" },
  { mode: "historicAverage", label: "Historic Average" },
  { mode: "live", label: "Current Season" },
];
/** Own% is a normal Historic/Raw column now (resizable, comparative-coloured), matching Player Explorer — it used to be excluded and pinned separately. */
const HISTORIC_RAW_COLUMNS = PLAYER_COLUMNS;
/** Price defaults off since squad budget always uses live price regardless of this toggle, so a historic price here could read as more relevant to squad-building than it actually is — still selectable manually if wanted. Ownership defaults ON, matching Player Explorer. */
const DEFAULT_HISTORIC_RAW_COLUMN_KEYS = DEFAULT_VISIBLE_COLUMNS.filter((k) => k !== "price");
/** Fixed width of the one remaining pinned-left column — see the .picker-sticky-player CSS. */
const PICKER_PINNED_WIDTH = 210;

/** One row of the Add Players table — bundles live identity/budget data, the historic/raw resolution for the selected mode, and every predictive figure, computed once per candidate rather than per cell. */
interface PickerRowData {
  live: NormalizedPlayer;
  /** Resolved per the picker's own Historic/Raw toggle — null if the player has no data for that mode. */
  historicRaw: NormalizedPlayer;
  fixtures: UpcomingFixture[];
  expBreakdown: ExpPointsBreakdown;
  reliability: number | null;
}

interface PredictiveColumnDef {
  key: string;
  label: string;
  getValue: (row: PickerRowData) => number | null;
  renderCell: (row: PickerRowData) => React.ReactNode;
  /** Defaults true; only the fixtures column (lower average difficulty = easier = better) needs false. */
  higherIsBetter?: boolean;
}

const PREDICTIVE_COLUMNS: PredictiveColumnDef[] = [
  {
    key: "expFplPredicted",
    label: "Exp. Pts (FPL Predicted)",
    getValue: (row) => row.expBreakdown.fplPredicted,
    renderCell: (row) => fmtDecimal(row.expBreakdown.fplPredicted, 1),
  },
  {
    key: "expLastSeason",
    label: "Exp. Pts (Last Completed Season)",
    getValue: (row) => row.expBreakdown.lastSeason,
    renderCell: (row) => fmtDecimal(row.expBreakdown.lastSeason, 1),
  },
  {
    key: "expHistoricAvg",
    label: "Exp. Pts (Historic Average)",
    getValue: (row) => row.expBreakdown.historicAverage,
    renderCell: (row) => fmtDecimal(row.expBreakdown.historicAverage, 1),
  },
  {
    key: "expOverallAvg",
    label: "Exp. Pts (Overall Average)",
    getValue: (row) => row.expBreakdown.overallAverage,
    renderCell: (row) => (
      <span
        title={
          row.expBreakdown.overallAverage !== null && !row.expBreakdown.overallAverageComplete
            ? "Built from incomplete data — at least one of FPL Predicted / Last Completed Season / Historic Average is missing for this player"
            : undefined
        }
      >
        {fmtDecimal(row.expBreakdown.overallAverage, 1)}
        {row.expBreakdown.overallAverage !== null && !row.expBreakdown.overallAverageComplete && (
          <sup style={{ color: "var(--accent-value)" }}>*</sup>
        )}
      </span>
    ),
  },
  {
    key: "reliability",
    label: "Minutes Reliability",
    getValue: (row) => (row.reliability !== null ? row.reliability * 100 : null),
    renderCell: (row) => (row.reliability !== null ? fmtPercent(row.reliability * 100, 0) : DASH),
  },
  {
    key: "fixtures",
    label: "Next 5 Fixtures",
    getValue: (row) => averageFixtureDifficulty(row.fixtures),
    higherIsBetter: false,
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

function averageFixtureDifficulty(fixtures: UpcomingFixture[]): number | null {
  if (fixtures.length === 0) return null;
  return fixtures.reduce((sum, f) => sum + f.difficulty, 0) / fixtures.length;
}

/** Same visual language as the percentile bar, but for a 0-1 reliability share rather than a rank — labelled as a %, never "Nth". */
function ReliabilityBar({ value }: { value: number | null }) {
  if (value === null) return <span className="value-muted">{DASH}</span>;
  const pct = value * 100;
  const band = bandForPercentile(pct);
  return (
    <span className="percentile-row">
      <span className="percentile-track">
        <span className={`percentile-fill ${band}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </span>
      <span className="percentile-label">{fmtPercent(pct, 0)}</span>
    </span>
  );
}

export function TeamBuilder() {
  const { players, teams, teamsById, fixtures, filters, historicProfiles, historicStatus, currentSeasonHasStarted, chips, gameweekState } = useAppState();
  const { squads, upsert, remove } = useSavedSquads();
  const [, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(squads[0]?.id ?? null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPosition, setPickerPosition] = useState<"ALL" | Position>("ALL");
  const [pickerTeamId, setPickerTeamId] = useState<"ALL" | number>("ALL");
  const [pickerMinPrice, setPickerMinPrice] = useState<number | null>(null);
  const [pickerMaxPrice, setPickerMaxPrice] = useState<number | null>(null);
  const [pickerMinOwnership, setPickerMinOwnership] = useState<number | null>(null);
  const [pickerMaxOwnership, setPickerMaxOwnership] = useState<number | null>(null);
  const [pickerMinMinutes, setPickerMinMinutes] = useState<number | null>(null);
  const [pickerArchetypes, setPickerArchetypes] = useState<ArchetypeLabel[]>([]);
  const [showPickerArchetypePopover, setShowPickerArchetypePopover] = useState(false);
  const [captainPickMode, setCaptainPickMode] = useState<"captain" | "viceCaptain" | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expectedPointsWindow, setExpectedPointsWindow] = useState<ExpectedPointsWindow>(1);
  const [solverTransferCount, setSolverTransferCount] = useState<1 | 2>(1);
  const [solverFreeTransfers, setSolverFreeTransfers] = useState(1);
  const [epChip, setEpChip] = useState<ExpectedPointsChip>("none");
  const [importTeamIdInput, setImportTeamIdInput] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [pickerHistoricMode, setPickerHistoricMode] = useState<AnalysisMode>("lastSeason");
  const [showPredictiveColumnPopover, setShowPredictiveColumnPopover] = useState(false);
  const [comparativeColouring, setComparativeColouring] = useState(true);
  const columnFiltersState = useColumnFilters();
  const [showHistoricRawColumnPopover, setShowHistoricRawColumnPopover] = useState(false);
  const predictiveCols = useColumnCustomization(DEFAULT_PREDICTIVE_COLUMN_KEYS);
  const historicRawCols = useColumnCustomization(DEFAULT_HISTORIC_RAW_COLUMN_KEYS);
  const { sort: pickerSort, handleHeaderClick: handlePickerHeaderClick } = useSortSpec([{ key: "expFplPredicted", direction: "desc" }]);
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

  // Squad membership, budget, composition, and club-limit rules ALWAYS use
  // live players — real prices for a real £100m budget. Archetypes (which
  // feed Differentials/Mix below) use a fixed historic-average basis —
  // not user-toggleable in this section, since Team Building is now about
  // modelled predictions for the current season rather than a choice of
  // description basis (see README).
  const { resolved: historicAverageStats } = useMemo(
    () => resolvePlayerStatsList(players, "historicAverage", historicProfiles, currentSeasonHasStarted),
    [players, historicProfiles, currentSeasonHasStarted],
  );
  const archetypeMap = useMemo(
    () => computeArchetypesForAllPlayers(historicAverageStats, filters.minMinutes, teamsById, historicProfiles, players),
    [historicAverageStats, filters.minMinutes, teamsById, historicProfiles, players],
  );

  function updateActive(mutator: (s: SavedSquad) => SavedSquad) {
    if (!active) return;
    upsert(mutator(active));
  }

  function handleNewSquad() {
    const blank = createBlankSquad(`My Squad ${squads.length + 1}`);
    upsert(blank);
    setActiveId(blank.id);
  }

  function handleDuplicate() {
    if (!active) return;
    const copy = createBlankSquad(`${active.name} copy`);
    copy.playerIds = [...active.playerIds];
    copy.startingXI = [...active.startingXI];
    copy.captainId = active.captainId;
    copy.viceCaptainId = active.viceCaptainId;
    // Chip usage is a season-wide fact, not a squad-composition detail —
    // still true of a duplicate. importedFrom deliberately isn't carried
    // over: once duplicated, this is a locally-edited fork, not literally
    // the imported team anymore.
    copy.usedChips = [...active.usedChips];
    upsert(copy);
    setActiveId(copy.id);
  }

  function handleDelete() {
    if (!active) return;
    if (squads.length <= 1) {
      setWarning("Can't delete this squad — at least one saved squad must always exist. Create another squad first if you want to replace this one.");
      return;
    }
    if (!window.confirm(`Delete "${active.name}"? This can't be undone.`)) return;
    remove(active.id);
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
   * Replaces the squad with a freshly drafted one — see
   * metrics/optimalDraft.ts for the algorithm and its honestly-stated
   * limits. Optimises for whichever GW window is currently selected, so
   * the draft matches what the rest of the page is already showing.
   *
   * Two things worth being explicit about: players already in the squad
   * are passed through as "locked" — the algorithm keeps them and drafts
   * the rest around them, rather than wiping the squad and starting over
   * — and new candidates are drawn only from `pickerRows`, i.e. whatever
   * the Add Players table is CURRENTLY showing after the user's own
   * search/position/team/price/archetype/minutes/column filters. If
   * you've filtered the table down to a handful of players, the draft
   * works with exactly that handful, not the full player base.
   */
  function handleOptimalDraft() {
    if (!active) return;
    const lockedPlayerIds = new Set(active.playerIds);
    const lockedPlayers = players.filter((p) => lockedPlayerIds.has(p.id));
    const filteredCandidates = pickerRows.map((row) => row.live); // pickerRows already excludes active.playerIds
    const draftPool = [...lockedPlayers, ...filteredCandidates];
    // Captured before the draft runs — historicProfiles could finish
    // loading and update between now and the warning below otherwise,
    // which would make the warning describe data that's since changed.
    const historicWasLoading = historicStatus === "loading";

    const result = buildOptimalDraft(
      draftPool,
      lockedPlayerIds,
      fixturesByTeamId,
      expectedPointsWindow,
      historicProfiles,
      teamsById,
      currentSeasonHasStarted,
    );
    if (isDraftFailure(result)) {
      setWarning(result.reason);
      return;
    }
    updateActive((s) => ({
      ...s,
      playerIds: result.squadPlayerIds,
      startingXI: result.startingXI,
      captainId: result.captainId,
      viceCaptainId: result.viceCaptainId,
    }));
    if (historicWasLoading) {
      setWarning("Historic data was still loading when this draft ran — Minutes Reliability and historic Exp Pts figures may be incomplete. Consider re-running once it finishes.");
    }
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

  function handleResetPickerColumns() {
    predictiveCols.resetColumns();
    historicRawCols.resetColumns();
  }

  function handleClearPickerFilters() {
    setPickerSearch("");
    setPickerPosition("ALL");
    setPickerTeamId("ALL");
    setPickerMinPrice(null);
    setPickerMaxPrice(null);
    setPickerMinOwnership(null);
    setPickerMaxOwnership(null);
    setPickerMinMinutes(null);
    setPickerArchetypes([]);
    columnFiltersState.resetAllFilters();
  }

  // Runs Fit to Box automatically the first time the picker table has
  // actually mounted, so the default view isn't cramped/overflowing on a
  // narrower screen before anyone's touched the button. No dependency
  // array: rather than depend on `pickerRows` (which is now computed
  // further down, before the early-return guard — see <hooks_before_
  // early_return> below) just to know when there's real content, this
  // simply checks the ref directly on every render until it succeeds,
  // then the ref flag makes every render after that a no-op.
  const hasAutoFitPickerRef = useRef(false);
  useEffect(() => {
    if (hasAutoFitPickerRef.current || !pickerTableWrapRef.current) return;
    hasAutoFitPickerRef.current = true;
    handlePickerFitToBox();
  });

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
  const squadPlayers = active ? active.playerIds.map((id) => playersById.get(id)).filter((p): p is NormalizedPlayer => !!p) : [];
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

  // Expected points for the selected window, keyed by id — FPL's own
  // ep_next for the immediate fixture, fixture-difficulty-extended for
  // the rest (see metrics/expectedPoints.ts). Not yet captain-doubled;
  // SquadPitch doubles it for display when rendering the captain's card.
  const expectedPointsByPlayerId = new Map<number, number | null>();
  for (const p of squadPlayers) {
    expectedPointsByPlayerId.set(p.id, computeExpectedPointsForWindow(p, fixturesByTeamId.get(p.teamId) ?? [], expectedPointsWindow));
  }

  // Blended (historic + live, availability-adjusted) minutes reliability,
  // keyed by id — see metrics/minutesReliabilityBlend.ts.
  const reliabilityByPlayerId = new Map<number, number | null>();
  for (const p of squadPlayers) {
    reliabilityByPlayerId.set(p.id, computeBlendedMinutesReliability(p, teamsById.get(p.teamId), historicProfiles.get(p.id)).value);
  }

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
    if (historicCol) return row.historicRaw ? historicCol.getValue(row.historicRaw, getPlayerDerivedMetrics(row.historicRaw)) : null;
    return null;
  }

  /** Excel-style per-column filter, scoped to predictive/historic-raw columns only (the same reuse of getPickerSortValue that drives sorting). */
  function passesColumnFilters(row: PickerRowData): boolean {
    return columnFiltersState.passesAllFilters((key) => getPickerSortValue(row, key));
  }

  // Memoized deliberately, unlike an earlier version of this file: this
  // computation runs computeExpPointsBreakdown and
  // computeBlendedMinutesReliability (each several resolvePlayerStats-
  // equivalent calls) for every candidate — up to the whole unfiltered
  // player base if no filters are applied. Without memoization, every
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
  const pickerRows: PickerRowData[] = useMemo(() => {
    const search = pickerSearch.trim().toLowerCase();
    return players
      .filter((p) => !squadPlayerIdSet.has(p.id))
      .filter((p) => pickerPosition === "ALL" || p.position === pickerPosition)
      .filter((p) => pickerTeamId === "ALL" || p.teamId === pickerTeamId)
      .filter((p) => pickerMinPrice === null || p.price >= pickerMinPrice)
      .filter((p) => pickerMaxPrice === null || p.price <= pickerMaxPrice)
      .filter((p) => pickerMinOwnership === null || (p.ownership ?? -Infinity) >= pickerMinOwnership)
      .filter((p) => pickerMaxOwnership === null || (p.ownership ?? Infinity) <= pickerMaxOwnership)
      .filter((p) => pickerArchetypes.length === 0 || pickerArchetypes.some((a) => (archetypeMap.get(p.id) ?? []).includes(a)))
      .filter((p) => !search || p.name.toLowerCase().includes(search))
      .map((p): PickerRowData => {
        const playerFixtures = fixturesByTeamId.get(p.teamId) ?? [];
        const historicProfile = historicProfiles.get(p.id);
        return {
          live: p,
          historicRaw: resolvePlayerStats(p, pickerHistoricMode, historicProfile, currentSeasonHasStarted),
          fixtures: playerFixtures.slice(0, 5),
          expBreakdown: computeExpPointsBreakdown(p, playerFixtures, expectedPointsWindow, historicProfile, currentSeasonHasStarted),
          reliability: computeBlendedMinutesReliability(p, teamsById.get(p.teamId), historicProfile).value,
        };
      })
      // A player with no data at all for the selected Historic/Raw mode is
      // excluded whenever the user has explicitly set a minimum, same as
      // "doesn't meet the bar" would be — this is a deliberate, opt-in
      // narrowing filter for finding squad-building candidates (only
      // applies once pickerMinMinutes is actually set), not the kind of
      // always-on default exclusion resolvePlayerStats.ts moved away from.
      .filter((row) => pickerMinMinutes === null || (row.historicRaw.minutes !== null && row.historicRaw.minutes >= pickerMinMinutes))
      .filter(passesColumnFilters)
      .sort((a, b) => {
        for (const s of pickerSort) {
          const cmp = compareSortValues(getPickerSortValue(a, s.key), getPickerSortValue(b, s.key), s.direction);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
  }, [
    players,
    active?.playerIds,
    pickerSearch,
    pickerPosition,
    pickerTeamId,
    pickerMinPrice,
    pickerMaxPrice,
    pickerMinOwnership,
    pickerMaxOwnership,
    pickerArchetypes,
    archetypeMap,
    fixturesByTeamId,
    historicProfiles,
    pickerHistoricMode,
    currentSeasonHasStarted,
    expectedPointsWindow,
    teamsById,
    pickerMinMinutes,
    columnFiltersState.columnFilters,
    pickerSort,
  ]);

  // Transfer Solver — searches within the FULL live player pool (not
  // whatever pickerRows' own filters currently show; those are for
  // browsing, not meant to silently narrow the solver too). Cheap enough
  // to run on every relevant change without a manual "search" button: at
  // most 15 × pool-size for one transfer, and the 2-transfer search only
  // ever explores a small fixed beam of the 1-transfer results (see
  // metrics/transferSolver.ts for why that's a heuristic, not exhaustive).
  const transferSuggestions: TransferSuggestion[] = useMemo(() => {
    if (squadPlayers.length === 0) return [];
    return solverTransferCount === 1
      ? findSingleTransferSuggestions(squadPlayers, players, fixturesByTeamId, expectedPointsWindow, solverFreeTransfers)
      : findDoubleTransferSuggestions(squadPlayers, players, fixturesByTeamId, expectedPointsWindow, solverFreeTransfers);
  }, [squadPlayers, players, fixturesByTeamId, expectedPointsWindow, solverTransferCount, solverFreeTransfers]);

  function handleApplyTransfer(suggestion: TransferSuggestion) {
    updateActive((s) => {
      let playerIds = [...s.playerIds];
      let startingXI = [...s.startingXI];
      let captainId = s.captainId;
      let viceCaptainId = s.viceCaptainId;
      for (const leg of suggestion.legs) {
        playerIds = playerIds.map((id) => (id === leg.out.id ? leg.in.id : id));
        startingXI = startingXI.map((id) => (id === leg.out.id ? leg.in.id : id));
        if (captainId === leg.out.id) captainId = leg.in.id;
        if (viceCaptainId === leg.out.id) viceCaptainId = leg.in.id;
      }
      return { ...s, playerIds, startingXI, captainId, viceCaptainId };
    });
  }

  /**
   * Loads a real FPL team by ID — three read-only public requests (team
   * identity/bank, chip/season history, one gameweek's picks), converted
   * into a new saved squad via normalizeEntryImport. Picks the team's OWN
   * current_event when FPL reports one; falls back to this app's own
   * current/last-completed gameweek, then finally gameweek 1, for the
   * pre-season edge case where neither has a real answer yet.
   */
  async function handleLoadFromFpl() {
    const teamId = Number(importTeamIdInput.trim());
    if (!Number.isFinite(teamId) || teamId <= 0) {
      setImportError("Enter a valid FPL team ID \u2014 the number in your team's URL (fantasy.premierleague.com/entry/1234567/...).");
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
      setImportStatus("idle");
      setImportTeamIdInput("");
      if (warnings.length > 0) {
        setWarning(`Imported with ${warnings.length} note(s): ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1} more \u2014 check the browser console)` : ""}`);
        // eslint-disable-next-line no-console
        console.warn("FPL team import warnings:", warnings);
      }
    } catch (err) {
      setImportStatus("error");
      if (err instanceof ApiRequestError) {
        setImportError(err.status === 404 ? "No FPL team found with that ID." : `Couldn't load that team (${err.message}).`);
      } else {
        setImportError("Couldn't reach the FPL API \u2014 check your connection and try again.");
      }
    }
  }

  if (!active) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>Team Building</h1>
          </div>
        </div>
        <div className="empty-state">
          <h3>Setting up…</h3>
        </div>
      </div>
    );
  }

  // TS control-flow narrowing from the guard above doesn't reach into the
  // nested function declarations below (isChipUsedForHalf etc.) — capture
  // the narrowed value once so those closures see a non-null type.
  const activeSquad = active;

  const epResult =
    epChip === "none"
      ? expectedGameweekPoints(startingXIPlayers, active.captainId, expectedPointsByPlayerId)
      : computeChipAdjustedExpectedPoints(startingXIPlayers, benchPlayers, active.captainId, fixturesByTeamId, expectedPointsWindow, epChip);
  const reliability = minutesReliability(startingXIPlayers, teamsById, historicProfiles);
  const differentials = findDifferentials(squadPlayers, archetypeMap);
  const mix = archetypeMix(squadPlayers, archetypeMap);

  // Per-column min/max across every currently-filtered candidate — the
  // tint below is a "how does this compare to what you're currently
  // looking at" hint, matching how Player Comparison's colour scale is
  // also scoped to what's visible (with no cap, "visible" now means
  // everyone who matches the current filters, not a fixed subset).
  const predictiveColumnRanges = new Map<string, { min: number; max: number }>();
  for (const c of predictiveColumnsInOrder) {
    const values = pickerRows.map((r) => c.getValue(r)).filter((v): v is number => v !== null);
    if (values.length > 0) predictiveColumnRanges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
  }
  const historicRawColumnRanges = new Map<string, { min: number; max: number }>();
  for (const c of historicRawColumnsInOrder) {
    const values = pickerRows
      .map((r) => (r.historicRaw ? c.getValue(r.historicRaw, getPlayerDerivedMetrics(r.historicRaw)) : null))
      .filter((v): v is number => v !== null);
    if (values.length > 0) historicRawColumnRanges.set(c.key, { min: Math.min(...values), max: Math.max(...values) });
  }

  function predictiveTint(row: PickerRowData, c: PredictiveColumnDef): string | undefined {
    if (!comparativeColouring) return undefined;
    const range = predictiveColumnRanges.get(c.key);
    const v = c.getValue(row);
    if (!range || v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
  }

  function historicRawTint(row: PickerRowData, c: PlayerColumn): string | undefined {
    if (!comparativeColouring) return undefined;
    const range = historicRawColumnRanges.get(c.key);
    if (!range || !row.historicRaw) return undefined;
    const v = c.getValue(row.historicRaw, getPlayerDerivedMetrics(row.historicRaw));
    if (v === null) return undefined;
    return relativeCellTint(v, range.min, range.max, c.higherIsBetter !== false);
  }

  /**
   * Whether the active squad's records show this chip already used within
   * this specific half of the season — see isChipUsedForWindow in
   * metrics/chipPlanner.ts, shared with Chip Planner's own filtering so
   * the two pages can't disagree.
   */
  function isChipUsedForHalf(chip: ChipWindow["chip"], half: 1 | 2): boolean {
    const window = chips.find((w) => w.chip === chip && w.half === half);
    if (!window) return activeSquad.usedChips.some((c) => c.chip === chip);
    return isChipUsedForWindow(activeSquad.usedChips, window);
  }

  function toggleChipUsedForHalf(chip: ChipWindow["chip"], half: 1 | 2) {
    const window = chips.find((w) => w.chip === chip && w.half === half);
    const currentlyUsed = isChipUsedForHalf(chip, half);
    updateActive((s) => ({
      ...s,
      usedChips: currentlyUsed
        ? s.usedChips.filter((c) => !(c.chip === chip && (!window || isChipUsedForWindow([c], window))))
        : [...s.usedChips, { chip, event: window?.startEvent ?? null }],
    }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team Building</h1>
          <p className="page-subtitle">
            Build a squad from scratch under standard rules — £{SQUAD_RULES.budget.toFixed(1)}m budget, {SQUAD_RULES.composition.GKP}-
            {SQUAD_RULES.composition.DEF}-{SQUAD_RULES.composition.MID}-{SQUAD_RULES.composition.FWD} (GKP-DEF-MID-FWD), max{" "}
            {SQUAD_RULES.maxPerClub} per club. Saved to this browser only — no login, no account. You can load a real FPL team by its
            team ID below — that's a read-only, unauthenticated request to FPL's own public data for that team, the same kind of request
            every other page in this app already makes; nothing is ever written back to FPL.
          </p>
        </div>
      </div>

      <div className="filters-bar">
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
        <button type="button" className="btn" onClick={handleNewSquad}>
          New Squad
        </button>
        <button type="button" className="btn" onClick={handleDuplicate}>
          Duplicate
        </button>
        <button type="button" className="btn" onClick={handleDelete}>
          Delete
        </button>
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="import-team-id">Load from FPL (team ID)</label>
          <input
            id="import-team-id"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1234567"
            value={importTeamIdInput}
            onChange={(e) => setImportTeamIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLoadFromFpl();
            }}
          />
        </div>
        <button type="button" className="btn" onClick={handleLoadFromFpl} disabled={importStatus === "loading"}>
          {importStatus === "loading" ? "Loading\u2026" : "Load Team"}
        </button>
        {active.importedFrom && (
          <span className="badge" title={`Loaded from FPL team ${active.importedFrom.teamId}, as of Gameweek ${active.importedFrom.asOfEvent}`}>
            {active.importedFrom.managerName || active.importedFrom.teamName} {"\u00b7"} GW{active.importedFrom.asOfEvent}
          </span>
        )}
      </div>
      {importStatus === "error" && importError && <div className="banner error">{importError}</div>}
      <p className="page-subtitle" style={{ marginTop: -4, marginBottom: 12 }}>
        Your team ID is the number in your team's own FPL web address (Pick Team → Gameweek History shows it in the URL). Importing
        creates a new saved squad here — it won't overwrite anything, and re-loading the same ID later creates another new squad rather
        than syncing in place.
      </p>

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
            <label htmlFor="picker-min-price">Min £m</label>
            <input
              id="picker-min-price"
              type="number"
              step={0.5}
              min={0}
              value={pickerMinPrice ?? ""}
              placeholder="Any"
              onChange={(e) => setPickerMinPrice(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="picker-max-price">Max £m</label>
            <input
              id="picker-max-price"
              type="number"
              step={0.5}
              min={0}
              value={pickerMaxPrice ?? ""}
              placeholder="Any"
              onChange={(e) => setPickerMaxPrice(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="picker-min-own">Min own%</label>
            <input
              id="picker-min-own"
              type="number"
              min={0}
              max={100}
              value={pickerMinOwnership ?? ""}
              placeholder="Any"
              onChange={(e) => setPickerMinOwnership(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="picker-max-own">Max own%</label>
            <input
              id="picker-max-own"
              type="number"
              min={0}
              max={100}
              value={pickerMaxOwnership ?? ""}
              placeholder="Any"
              onChange={(e) => setPickerMaxOwnership(e.target.value === "" ? null : Number(e.target.value))}
            />
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
              title="Minutes in whichever Historic/Raw mode is selected below — a player with no data at all for that mode is excluded once a minimum is set"
              onChange={(e) => setPickerMinMinutes(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ position: "relative" }}>
            <label htmlFor="picker-archetypes">Archetypes</label>
            <button
              id="picker-archetypes"
              type="button"
              className="btn"
              onClick={() => setShowPickerArchetypePopover((v) => !v)}
              style={{ minWidth: 90, textAlign: "left" }}
            >
              {pickerArchetypes.length === 0 ? "All" : `${pickerArchetypes.length} selected`}
            </button>
            {showPickerArchetypePopover && (
              <div className="popover">
                {ARCHETYPE_LABELS.map((label) => (
                  <label key={label}>
                    <input
                      type="checkbox"
                      checked={pickerArchetypes.includes(label)}
                      onChange={() =>
                        setPickerArchetypes((prev) => (prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]))
                      }
                    />
                    {label}
                  </label>
                ))}
                {pickerArchetypes.length > 0 && (
                  <button type="button" className="chip" style={{ marginTop: 6 }} onClick={() => setPickerArchetypes([])}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="chip-row" style={{ marginBottom: 12 }}>
          <button type="button" className="chip" onClick={handlePickerFitToBox} title="Compress all visible columns to fit the table width">
            Fit to Box
          </button>
          <button type="button" className="chip" onClick={handleResetPickerColumns} title="Restore default columns, order, and natural widths">
            Reset Columns
          </button>
          <div style={{ position: "relative" }}>
            <button type="button" className="chip" onClick={() => setShowPredictiveColumnPopover((v) => !v)}>
              Predictive Columns ({predictiveCols.visibleColumns.length})
            </button>
            {showPredictiveColumnPopover && (
              <div className="popover">
                {PREDICTIVE_COLUMNS.map((c) => (
                  <label key={c.key}>
                    <input type="checkbox" checked={predictiveCols.visibleColumns.includes(c.key)} onChange={() => predictiveCols.toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button type="button" className="chip" onClick={() => setShowHistoricRawColumnPopover((v) => !v)}>
              Historic/Raw Columns ({historicRawCols.visibleColumns.length})
            </button>
            {showHistoricRawColumnPopover && (
              <div className="popover">
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
                          onChange={() => historicRawCols.toggleColumn(c.key)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="chip"
            onClick={handleClearPickerFilters}
            title="Clear every picker filter — search, position, team, price, minutes, archetypes, and any per-column filters"
          >
            Clear Filters
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={comparativeColouring} onChange={(e) => setComparativeColouring(e.target.checked)} />
            Comparative Colouring
          </label>
        </div>

        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Predictive columns show:</div>
            <div style={{ display: "flex", gap: 6 }}>
              {EXPECTED_POINTS_WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="btn"
                  aria-pressed={expectedPointsWindow === w}
                  style={expectedPointsWindow === w ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
                  onClick={() => setExpectedPointsWindow(w)}
                >
                  Next {w} {w === 1 ? "GW" : "GWs"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Historic/raw columns show:</div>
            <div style={{ display: "flex", gap: 6 }}>
              {PICKER_HISTORIC_MODE_OPTIONS.map((o) => (
                <button
                  key={o.mode}
                  type="button"
                  className="btn"
                  aria-pressed={pickerHistoricMode === o.mode}
                  style={pickerHistoricMode === o.mode ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
                  onClick={() => setPickerHistoricMode(o.mode)}
                >
                  {o.label}
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
          <table className="data-table compact">
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
                      title="Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
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
                      className={i === 0 ? "column-group-divider" : undefined}
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
                      title="Click to sort · Shift-click to add secondary sort · Drag to reorder · Drag the right edge to resize"
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
              {pickerRows.map((row) => {
                const check = canAddPlayer(squadPlayers, row.live);
                return (
                  <tr
                    key={row.live.id}
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
                            handleViewProfile(row.live.id);
                          }}
                          style={{ cursor: "pointer" }}
                          title="View profile"
                        >
                          {row.live.name}
                          <AvailabilityFlag status={row.live.status} news={row.live.news} chanceOfPlayingNextRound={row.live.chanceOfPlayingNextRound} />
                        </span>
                        <span className="meta">
                          <PositionBadge position={row.live.position} /> {row.live.teamShortName} · {fmtPrice(row.live.price)}
                          <button
                            type="button"
                            className="inline-add-btn"
                            disabled={!check.ok}
                            title={check.ok ? "Add to squad" : check.reason}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAdd(row.live);
                            }}
                          >
                            Add
                          </button>
                        </span>
                      </div>
                    </td>
                    {predictiveColumnsInOrder.map((c) => {
                      const width = predictiveCols.columnWidths[c.key];
                      return (
                        <td
                          key={c.key}
                          style={{
                            ...(width
                              ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                              : {}),
                            backgroundColor: predictiveTint(row, c),
                          }}
                        >
                          {c.renderCell(row)}
                        </td>
                      );
                    })}
                    {historicRawColumnsInOrder.map((c, i) => {
                      const value = row.historicRaw ? c.getValue(row.historicRaw, getPlayerDerivedMetrics(row.historicRaw)) : null;
                      const isSignedMetric = c.key === "goalsMinusXG" || c.key === "assistsMinusXA";
                      const width = historicRawCols.columnWidths[c.key];
                      return (
                        <td
                          key={c.key}
                          className={i === 0 ? "column-group-divider" : undefined}
                          style={{
                            ...(width
                              ? { width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                              : {}),
                            backgroundColor: historicRawTint(row, c),
                          }}
                        >
                          {isSignedMetric ? <SignedNum value={value} /> : c.format(value)}
                        </td>
                      );
                    })}
                  </tr>
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
        <p className="page-subtitle" style={{ marginTop: 8 }}>
          Showing every player matching your filters, sorted by Exp. Pts (FPL Predicted) by default — click any header to sort by it
          instead, shift-click to add a secondary sort. Drag a row straight onto the pitch or bench below to add them, or use the Add
          button next to their name. Price and eligibility always use today's real price and budget, regardless of the Historic/Raw
          toggle above — building a squad is a live-money decision. The vertical line marks where predictive columns end and historic/raw
          columns begin; columns can be dragged to reorder within their own side of that line, not across it.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">
          Squad ({squadPlayers.length}/{SQUAD_RULES.squadSize})
        </div>
        {xiValidation.size > 0 && !xiValidation.valid && <div className="banner info">Formation: {xiValidation.issues.join(" · ")}</div>}
        <SquadPitch
          squadName={active.name}
          squadValidation={squadValidation}
          positionGroups={pitchPositionGroups}
          benchPlayers={benchPlayers}
          captainId={active.captainId}
          viceCaptainId={active.viceCaptainId}
          expectedPointsByPlayerId={expectedPointsByPlayerId}
          reliabilityByPlayerId={reliabilityByPlayerId}
          fixturesByTeamId={fixturesByTeamId}
          captainPickMode={captainPickMode}
          onCaptainTileClick={handleCaptainTileClick}
          onPlayerCardClick={handlePlayerCardClick}
          onViewProfile={handleViewProfile}
          onSwap={handleSwapPlayers}
          onAddToPitch={handleDropOnPitch}
          onBench={handleDropOnBench}
          onRemove={handleRemovePlayer}
          onClearSquad={handleClearSquad}
          onOptimalDraft={handleOptimalDraft}
          warning={warning}
        />
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-title">Expected Points (Next {expectedPointsWindow} {expectedPointsWindow === 1 ? "GW" : "GWs"})</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["none", "bboost", "3xc"] as ExpectedPointsChip[]).map((c) => (
              <button
                key={c}
                type="button"
                className="btn"
                aria-pressed={epChip === c}
                style={epChip === c ? { borderColor: "var(--accent-positive)", color: "var(--accent-positive)" } : undefined}
                onClick={() => setEpChip(c)}
              >
                {c === "none" ? "No chip" : c === "bboost" ? "Bench Boost" : "Triple Captain"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{epResult.total !== null ? fmtDecimal(epResult.total, 1) : DASH}</div>
          <p className="page-subtitle">
            {epChip === "none"
              ? "Starting XI total, captain doubled."
              : epChip === "bboost"
                ? "Starting XI + bench, captain doubled — the bench's contribution only counts for the first upcoming fixture, since Bench Boost is a one-gameweek chip, not held across this whole window."
                : "Starting XI total — the captain gets 3x instead of 2x only for their first upcoming fixture, since Triple Captain is a one-gameweek chip; later fixtures in this window keep the normal 2x."}{" "}
            Built from FPL's own published prediction for the next fixture, extended for later gameweeks using fixture difficulty — a
            transparent extension, not a second model. See Team Building in the README for the exact formula.
            {epResult.playersWithNoData > 0 && ` ${epResult.playersWithNoData} player(s) have no prediction available and count as 0.`}
            {epChip !== "none" && active.usedChips.some((c) => c.chip === epChip) && (
              <strong style={{ display: "block", marginTop: 4, color: "var(--accent-negative)" }}>
                Heads up: this squad's records show {epChip === "bboost" ? "Bench Boost" : "Triple Captain"} already used this season —
                this is just a hypothetical preview, not a live option.
              </strong>
            )}
          </p>
        </div>
        <div className="card">
          <div className="card-title">Minutes Reliability</div>
          <ReliabilityBar value={reliability.average} />
          <p className="page-subtitle">
            Blends historic and live-season playing time, shifting trust toward live data as real gameweeks accumulate this season, then
            adjusted for current injury/doubt status. Pre-season this leans entirely on history; it becomes fully live-driven by
            gameweek 8.
          </p>
        </div>
        <div className="card">
          <div className="card-title">Good Differentials ({differentials.length})</div>
          {differentials.length === 0 ? (
            <p className="page-subtitle">None in this squad yet — look for a low-owned player the archetype system rates as strong on underlying numbers.</p>
          ) : (
            <div className="chip-row">
              {differentials.map((p) => (
                <span key={p.id} className="chip">
                  {p.name} ({fmtPercent(p.ownership, 1)})
                </span>
              ))}
            </div>
          )}
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            Ownership is always today's real figure; "statistically strong" is judged from historic underlying numbers.
          </p>
        </div>
        <div className="card">
          <div className="card-title">Archetype Mix</div>
          {mix.length === 0 ? (
            <p className="page-subtitle">Add players to see the archetype mix.</p>
          ) : (
            <div className="chip-row">
              {mix.map((m) => (
                <span key={m.label} className="badge archetype">
                  {m.label} ×{m.count}
                </span>
              ))}
            </div>
          )}
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            Archetypes are computed from historic underlying numbers, the same basis used across this squad's analysis.
          </p>
        </div>
        <div className="card">
          <div className="card-title">Chips Used This Season</div>
          {active.importedFrom && (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Auto-filled from {active.importedFrom.teamName}'s real FPL history as of import. Untick to correct if it's out of date.
            </p>
          )}
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Chip</th>
                  <th>First Half</th>
                  <th>Second Half</th>
                </tr>
              </thead>
              <tbody>
                {(["wildcard", "freehit", "bboost", "3xc"] as ChipWindow["chip"][]).map((chip) => (
                  <tr key={chip}>
                    <td style={{ textAlign: "left" }}>{chip === "wildcard" ? "Wildcard" : chip === "freehit" ? "Free Hit" : chip === "bboost" ? "Bench Boost" : "Triple Captain"}</td>
                    {([1, 2] as const).map((half) => (
                      <td key={half}>
                        <input type="checkbox" checked={isChipUsedForHalf(chip, half)} onChange={() => toggleChipUsedForHalf(chip, half)} aria-label={`${chip} used, half ${half}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-subtitle" style={{ marginTop: 8 }}>
            Drives which windows Chip Planner still recommends for this squad — a half with no box ticked here is treated as fully
            available there.
          </p>
        </div>
      </div>

      <div className="section-heading">Transfer Solver</div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        Searches for same-position swaps that improve your Expected Points total over the {expectedPointsWindow}-GW window selected
        above, within budget, the 2-5-5-3 composition, and the {SQUAD_RULES.maxPerClub}-per-club limit. Every suggestion here is one
        canAddPlayer — the same rule-check the Add Players table itself uses — would also accept if applied by hand.
      </p>
      <div className="banner info">
        Scoped to <strong>same-position</strong> swaps only (a DEF replaced by a DEF, etc.) — a transfer that also reshapes your formation
        isn't considered. The 2-transfer search is a heuristic, not an exhaustive one: an exact search would be tens of millions of
        combinations, so this instead pairs up the strongest single-swap options found and checks whether any pair still fits your rules
        together — a genuinely strong pair built from two only-mediocre-alone moves wouldn't surface here. Scoring reuses the exact same
        Expected Points method as the card above (FPL's own ep_next, fixture-difficulty-extended) — not a second model — so it inherits
        the same limits: it can't see price changes, injuries, or team news between now and a gameweek that's still some way off.
      </div>

      <div className="filters-bar">
        <div className="field">
          <label htmlFor="solver-count">Transfers to search</label>
          <select id="solver-count" value={solverTransferCount} onChange={(e) => setSolverTransferCount(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1 transfer</option>
            <option value={2}>2 transfers</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="solver-free">Free transfers available</label>
          <input
            id="solver-free"
            type="number"
            min={0}
            max={5}
            value={solverFreeTransfers}
            onChange={(e) => setSolverFreeTransfers(Math.max(0, Number(e.target.value)))}
          />
        </div>
      </div>

      {transferSuggestions.length === 0 ? (
        <div className="empty-state">
          <h3>No improving transfer found</h3>
          <p>Either this squad is empty, or nothing in the live pool projects higher than what you already have in every checked slot.</p>
        </div>
      ) : (
        <div className="card-grid">
          {transferSuggestions.slice(0, solverTransferCount === 1 ? 5 : 3).map((suggestion, idx) => (
            <div className="card" key={idx}>
              <div className="card-title">
                {suggestion.legs.map((leg) => `${leg.out.name} → ${leg.in.name}`).join(" · ")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {suggestion.legs.map((leg) => (
                  <div key={leg.out.id} className="page-subtitle" style={{ margin: 0 }}>
                    <PositionBadge position={leg.out.position} /> {leg.out.name} ({fmtPrice(leg.out.price)}) → {leg.in.name} ({fmtPrice(leg.in.price)}) — <SignedNum value={leg.gain} decimals={1} /> pts,{" "}
                    <SignedNum value={leg.priceDelta} decimals={1} /> price
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                <SignedNum value={suggestion.netGain} decimals={1} /> pts net
              </div>
              <p className="page-subtitle" style={{ margin: "2px 0 10px" }}>
                {suggestion.hitCost > 0 ? `Includes a -${suggestion.hitCost}pt hit for going beyond your free transfers.` : "No hit — within your free transfers."} Total
                price change: <SignedNum value={suggestion.totalPriceDelta} decimals={1} />m.
              </p>
              <button type="button" className="btn primary" onClick={() => handleApplyTransfer(suggestion)}>
                Apply to squad
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
