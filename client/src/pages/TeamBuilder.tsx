import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { useSavedSquads, MAX_SAVED_SQUADS } from "../state/useSavedSquads";
import { horizonHint, minutesGameweekHint } from "../components/hoverText";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { useDialogFocus } from "../state/useDialogFocus";
import { SQUAD_RULES, createBlankSquad, type SavedSquad } from "../types/team";
import { sellingPrice, squadMoney } from "../metrics/squadPrices";
import { loadImportedPurchasePrices } from "../state/importedPurchasePrices";
import { validateSquad, canAddPlayer, fitsStartingXI, openSquadSlots } from "../metrics/squadRules";
import { fplOfficialForFixture, fplSeasonRate } from "../metrics/expectedPoints";
import { modelClubRatings, modelForFixture, playerEvidence } from "../metrics/pointsModelLive";
import { clubSeasonsAsShown } from "../metrics/teamStats";
import { expectationForGameweek, horizonTotal, upcomingGameweeks, type Horizon, type PointsSource } from "../metrics/gameweekExpectations";
import { fetchEntryTeam, fetchEntryHistory, fetchEntryPicks, ApiRequestError } from "../api/client";
import { normalizeEntryImport } from "../normalize/normalizeEntryImport";
import { getUpcomingFixtures, firstPickableEventId, type UpcomingFixture } from "../metrics/fixtureTicker";
import { SquadPitch, type PitchColourRanks } from "../components/SquadPitch";
import type { DraftPicks } from "../metrics/bestDraft";
import { IconChipButton, CloseIcon, TrashIcon } from "../components/IconToolbar";
import { fmtPrice } from "../utils/format";
import { rankWithinGroups } from "../metrics/comparativeColour";
import type { NormalizedPlayer, Position } from "../types/normalized";
import { describeLoadError } from "../api/errors";
import { EXPLORER_DEFAULT_VISIBLE_COLUMNS, FIXTURES_COLUMN_KEY, PlayerExplorerTable, type ExplorerOpenRequest, type LeadColumn } from "../components/PlayerExplorerTable";
import { HorizonPicker } from "../components/HorizonPicker";
import { SectionHeading } from "../components/SectionHeading";
import { SquadPicker } from "../components/SquadPicker";

/** How long a rejected drag's warning message stays visible before clearing itself. */
const WARNING_DISPLAY_MS = 4000;
/** Hover on "FPL team ID" wherever a squad can be imported: where to find it. */
const TEAM_ID_HINT =
  "Your FPL team ID is the number in your team's web address: sign in at fantasy.premierleague.com, open the Points tab, and it's the number after /entry/ (e.g. fantasy.premierleague.com/entry/1234567/event/8).";
/** How many of each club's next fixtures the Fixtures chips and column show. */
const FIXTURE_TICKER_LENGTH = 5;
/** The shared table's starting columns in Add Players (<shared_player_table>): Next 5 Fixtures, then Player Explorer's own defaults. */
const ADD_PLAYERS_DEFAULT_COLUMNS = [FIXTURES_COLUMN_KEY, ...EXPLORER_DEFAULT_VISIBLE_COLUMNS];

/** A squad's name as shown: a name cleared while editing reads "Untitled squad" rather than leaving a blank in the dropdown and over the pitch. */
function squadTitle(squad: SavedSquad): string {
  return squad.name.trim() || "Untitled squad";
}

/** Hover text for the status line's budget: where it comes from (<imported_budget>, squadMoney). */
function budgetHint(squad: SavedSquad | null, money: { budget: number; atSellingPrices: boolean }): string {
  const imported = squad?.importedFrom;
  if (imported && money.atSellingPrices) {
    return `Budget ${fmtPrice(money.budget)}: ${fmtPrice(imported.bank ?? 0)} in the bank plus the players this squad was imported with at their selling prices today (what FPL would pay for them: what was paid plus half of any rise). A player still held counts at his selling price, one added here at today's price.`;
  }
  if (imported && imported.purchasePrices === null && imported.budget !== null) {
    return `Budget ${fmtPrice(imported.budget)}: this squad's players at today's prices when it was imported, plus ${fmtPrice(imported.bank ?? 0)} in the bank, until its purchase prices load from FPL.`;
  }
  if (imported && imported.budget !== null) {
    return `Budget ${fmtPrice(imported.budget)}: this squad's players at today's prices when it was imported, plus ${fmtPrice(imported.bank ?? 0)} in the bank. A player who has risen counts at today's price, not his selling price.`;
  }
  if (imported) return `Budget ${fmtPrice(SQUAD_RULES.budget)}, FPL's starting budget: this squad was imported before Scoutline kept an import's own budget. Import the team again to use it.`;
  return `Budget ${fmtPrice(SQUAD_RULES.budget)}, FPL's starting budget.`;
}

/** Hover for a player whose purchase price isn't known (<purchase_prices>): why. */
function purchaseUnknownHint(squad: SavedSquad | null): string {
  if (squad?.importedFrom && squad.importedFrom.purchasePrices === null) return "Purchase price not loaded: Scoutline reads this team's purchase prices from FPL when the squad is opened, and couldn't yet";
  return squad?.importedFrom
    ? "Purchase price not known: this team started after GW1 and his price has moved since, and FPL's public data doesn't keep what it was the day the team was picked."
    : "Purchase price not known: he was added before Scoutline kept purchase prices. Remove him and add him again to record today's.";
}

/** <purchase_prices> kept only for the players `keep` lets through. */
function keepPurchases(prices: Record<number, number>, keep: (id: number) => boolean): Record<number, number> {
  return Object.fromEntries(Object.entries(prices).filter(([id]) => keep(Number(id))));
}

export function TeamBuilder() {
  const {
    players,
    teams,
    teamsById,
    fixtures,
    events,
    historicProfiles,
    historicStatus,
    historicReferenceSeason,
    historicFetchSkippedPlayerIds,
    seasonMatchesByPlayerId,
    clubSeasons,
    currentSeasonHasStarted,
    gameweekState,
    requestHistoricData,
    totalPlayers,
  } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);
  const { squads, upsert, update, remove } = useSavedSquads();
  const [, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(squads[0]?.id ?? null);
  // <add_players_dialog>: Add Players is a dialog, opened from an open "+"
  // place (listing that position) and closed by its ×, Escape, a click
  // outside it, or adding a player. It stays mounted while closed, so its
  // table keeps its Data View, columns, sort and filters between visits.
  const [addOpen, setAddOpen] = useState(false);
  const [addRequest, setAddRequest] = useState<ExplorerOpenRequest | null>(null);
  // <points_horizon>: the gameweeks each Exp. Pts column adds up, from the next one.
  const [fplHorizon, setFplHorizon] = useState<Horizon>(1);
  const [modelHorizon, setModelHorizon] = useState<Horizon>(1);
  // The pitch's gameweek (<gameweek_arrows>), for its cards and Best Draft.
  const [pitchEventId, setPitchEventId] = useState<number | null>(null);
  const [captainPickMode, setCaptainPickMode] = useState<"captain" | "viceCaptain" | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showNewSquadModal, setShowNewSquadModal] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importTeamIdInput, setImportTeamIdInput] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const addPanelRef = useRef<HTMLDivElement>(null);

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

  // <purchase_prices> for an import saved before they were kept, or whose
  // prices didn't load: loaded from FPL once per session when it's opened,
  // filling in only what's missing (edits made meanwhile are kept).
  const priceLoadsTried = useRef(new Set<string>());
  useEffect(() => {
    const imported = active?.importedFrom;
    if (!active || !imported || imported.purchasePrices !== null || playersById.size === 0 || priceLoadsTried.current.has(active.id)) return;
    priceLoadsTried.current.add(active.id);
    loadImportedPurchasePrices(imported.teamId, imported.asOfEvent, playersById)
      .then(({ playerIds, purchasePrices }) =>
        update(active.id, (s) =>
          s.importedFrom
            ? {
                ...s,
                importedFrom: { ...s.importedFrom, playerIds: s.importedFrom.playerIds ?? playerIds, purchasePrices },
                purchasePrices: { ...keepPurchases(purchasePrices, (id) => s.playerIds.includes(id)), ...s.purchasePrices },
              }
            : s,
        ),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.importedFrom?.purchasePrices, playersById, update]);

  function updateActive(mutator: (s: SavedSquad) => SavedSquad) {
    if (!active) return;
    upsert(mutator(active));
  }

  // Escape closes the newest of these, as on every other page.
  useEscapeLayer(showNewSquadModal, () => setShowNewSquadModal(false));
  useEscapeLayer(confirmDeleteId !== null, () => setConfirmDeleteId(null));
  useEscapeLayer(confirmClear, () => setConfirmClear(false));
  useEscapeLayer(addOpen, () => setAddOpen(false));
  useDialogFocus(addOpen, addPanelRef);

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
      setImportError(`You already have ${MAX_SAVED_SQUADS} saved squads, which is the maximum. Delete one first.`);
      setImportStatus("error");
      return;
    }
    const trimmedTeamId = importTeamIdInput.trim();
    if (trimmedTeamId) {
      const teamId = Number(trimmedTeamId);
      // Whole numbers only: "1.5" or "1e3" isn't a team ID, so it's caught here, not sent to FPL.
      if (!/^\d+$/.test(trimmedTeamId) || teamId <= 0) {
        setImportError("Enter a valid FPL team ID: the number in your team's URL (fantasy.premierleague.com/entry/1234567/...).");
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
        // <purchase_prices>: nice to have, so a failure doesn't stop the import (they load the next time the squad is opened).
        const prices = await loadImportedPurchasePrices(teamId, eventId, playersById).catch(() => null);
        if (prices && squad.importedFrom) {
          squad.importedFrom.purchasePrices = prices.purchasePrices;
          squad.purchasePrices = keepPurchases(prices.purchasePrices, (id) => squad.playerIds.includes(id));
        }
        upsert(squad);
        setActiveId(squad.id);
        setShowNewSquadModal(false);
        if (warnings.length > 0) {
          setWarning(`Imported with ${warnings.length} note(s): ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1} more in the browser console)` : ""}`);
          // eslint-disable-next-line no-console
          console.warn("FPL team import warnings:", warnings);
        }
      } catch (err) {
        setImportStatus("error");
        if (err instanceof ApiRequestError) {
          setImportError(err.status === 404 ? "No FPL team found with that ID." : `Couldn't load that team. ${describeLoadError(err)}`);
        } else {
          setImportError(`Couldn't load that team. ${describeLoadError(err)}`);
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

  /** Add starts him while the XI has a legal place for him (<add_to_xi>), else benches him. */
  function handleAdd(player: NormalizedPlayer) {
    const starts = fitsStartingXI(startingXIPlayers, player);
    // <purchase_prices>: bought at today's price.
    updateActive((s) => ({
      ...s,
      playerIds: [...s.playerIds, player.id],
      startingXI: starts ? [...s.startingXI, player.id] : s.startingXI,
      purchasePrices: { ...s.purchasePrices, [player.id]: player.price },
    }));
    setAddOpen(false);
  }

  /** Drops every saved id FPL no longer lists (see missingSavedIds) from the squad, the XI and the armbands. */
  function handleRemoveMissingPlayers() {
    updateActive((s) => {
      const listed = (id: number) => playersById.has(id);
      return {
        ...s,
        playerIds: s.playerIds.filter(listed),
        startingXI: s.startingXI.filter(listed),
        captainId: s.captainId !== null && listed(s.captainId) ? s.captainId : null,
        viceCaptainId: s.viceCaptainId !== null && listed(s.viceCaptainId) ? s.viceCaptainId : null,
        purchasePrices: keepPurchases(s.purchasePrices, listed),
      };
    });
  }

  function handleRemovePlayer(playerId: number) {
    updateActive((s) => ({
      ...s,
      playerIds: s.playerIds.filter((id) => id !== playerId),
      startingXI: s.startingXI.filter((id) => id !== playerId),
      captainId: s.captainId === playerId ? null : s.captainId,
      viceCaptainId: s.viceCaptainId === playerId ? null : s.viceCaptainId,
      purchasePrices: keepPurchases(s.purchasePrices, (id) => id !== playerId),
    }));
  }

  /**
   * Empties the squad and bench after the person confirms (there's no undo,
   * and a squad saves as it changes) — keeps the saved squad's own name/id,
   * just clears its contents (players, starting XI, captain/vice-captain
   * all reset together, since none of them mean anything without a squad
   * to belong to).
   */
  function handleClearSquad() {
    setConfirmClear(false);
    updateActive((s) => ({
      ...s,
      playerIds: [],
      startingXI: [],
      captainId: null,
      viceCaptainId: null,
      purchasePrices: {},
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
    // Only starters FPL still lists count toward the 11: a saved id it no
    // longer has can't be shown, so it mustn't hold a place (audit
    // 2026-10-18 M9). It stays in the squad, flagged, until removed.
    const listedXI = s.startingXI.filter((id) => playersById.has(id));
    if (listedXI.length >= SQUAD_RULES.startingXISize) return s; // full — no-op
    const player = playersById.get(playerId);
    if (player?.position === "GKP") {
      const otherGkpId = listedXI.find((id) => playersById.get(id)?.position === "GKP");
      const withoutOtherGkp = otherGkpId ? listedXI.filter((id) => id !== otherGkpId) : listedXI;
      return { ...s, startingXI: [...withoutOtherGkp, playerId] };
    }
    return { ...s, startingXI: [...listedXI, playerId] };
  }

  function handleToggleStarting(playerId: number) {
    updateActive((s) => toggleStartingCore(s, playerId));
  }

  /**
   * Adds a player who ISN'T in the squad yet (dropped from a drag that
   * started outside the squad), validating the same budget/composition/
   * club-limit rules the "Add" button uses. Shows a brief warning banner
   * with the reason when rejected — Add Players' own "Add" button also has
   * a disabled-state tooltip, but a drag that silently does nothing is
   * confusing on its own.
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
      // <purchase_prices>: bought at today's price.
      const withPlayer: SavedSquad = { ...s, playerIds: [...s.playerIds, draggedId], purchasePrices: { ...s.purchasePrices, [draggedId]: player.price } };
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

  /** <best_draft>: puts the best XI and armbands for the pitch's gameweek in place (the pitch works them out). */
  function handleBestDraft(picks: DraftPicks) {
    updateActive((s) => ({ ...s, startingXI: picks.startingXI, captainId: picks.captainId, viceCaptainId: picks.viceCaptainId }));
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

  /**
   * <open_slots>: a "+" place opens Add Players listing its position
   * (<add_players_dialog>), search box ready. Add then places him as it
   * always does (<add_to_xi>). With no squad yet the pitch is inert, so
   * none can be picked.
   */
  function handleAddSlot(position: Position) {
    setAddRequest((prev) => ({ position, nonce: (prev?.nonce ?? 0) + 1 }));
    setAddOpen(true);
  }

  /** The C/V tiles arm "pick" mode; clicking a tile again while it's already armed cancels it. */
  function handleCaptainTileClick(role: "captain" | "viceCaptain") {
    setCaptainPickMode((mode) => (mode === role ? null : role));
  }

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
  // Saved ids FPL's player list no longer has (a player removed from the
  // game): they can't be drawn, so they're flagged with a way to remove
  // them rather than silently holding a place (audit 2026-10-18 M9). Not
  // judged until players have loaded.
  const missingSavedIds = useMemo(() => {
    if (!active || playersById.size === 0) return [];
    const saved = new Set([...active.playerIds, ...active.startingXI]);
    if (active.captainId !== null) saved.add(active.captainId);
    if (active.viceCaptainId !== null) saved.add(active.viceCaptainId);
    return [...saved].filter((id) => !playersById.has(id));
  }, [active, playersById]);
  const startingXIPlayers = active ? active.startingXI.map((id) => playersById.get(id)).filter((p): p is NormalizedPlayer => !!p) : [];
  // Memoized: Add Players leaves these out, and a new Set every render would re-filter and re-sort its table each time.
  const squadPlayerIdSet = useMemo(() => new Set(squadPlayers.map((p) => p.id)), [squadPlayers]);
  const benchPlayers = squadPlayers.filter((p) => !(active?.startingXI.includes(p.id) ?? false));
  const pitchPositionGroups: Record<Position, NormalizedPlayer[]> = {
    GKP: startingXIPlayers.filter((p) => p.position === "GKP"),
    DEF: startingXIPlayers.filter((p) => p.position === "DEF"),
    MID: startingXIPlayers.filter((p) => p.position === "MID"),
    FWD: startingXIPlayers.filter((p) => p.position === "FWD"),
  };

  // <imported_budget>: an import's bank plus its players' selling prices, once its purchase prices are in.
  const money = squadMoney(active, (id) => playersById.get(id)?.price);
  const squadValidation = validateSquad(squadPlayers, money.budget, money.cost);
  const openSlots = openSquadSlots(squadPlayers, startingXIPlayers);

  // Upcoming fixtures for every club (cheap — 20 clubs), reused below for
  // every player's expected points and Add Players' Next 5 Fixtures,
  // rather than recomputed per player. Memoized: an unmemoized Map gets a
  // new identity every render even when nothing it's built from has
  // changed, which would silently defeat the memoisation downstream.
  // They start at the next gameweek still open for picks, the one FPL's
  // ep_next describes, never a match already played (audit 2026-10-18 H1).
  // Every club's upcoming fixtures through the last gameweek looked ahead
  // to (a double can make that more than five), and the first five of them
  // for the Fixtures chips and column.
  const fromEventId = useMemo(() => firstPickableEventId(events), [events]);
  // <upcoming_gameweeks>: GW9, GW10… by FPL's own numbering.
  const gameweeks = useMemo(() => upcomingGameweeks(events), [events]);
  const upcomingByTeamId = useMemo(() => {
    const lastGameweek = gameweeks.at(-1) ?? null;
    const map = new Map<number, UpcomingFixture[]>();
    for (const team of teamsById.values()) {
      const upcoming = getUpcomingFixtures(team.id, fixtures, teamsById, Infinity, fromEventId);
      map.set(team.id, lastGameweek === null ? upcoming.slice(0, FIXTURE_TICKER_LENGTH) : upcoming.filter((f, i) => i < FIXTURE_TICKER_LENGTH || (f.eventId !== null && f.eventId <= lastGameweek)));
    }
    return map;
  }, [teamsById, fixtures, fromEventId, gameweeks]);
  const fixturesByTeamId = useMemo(() => new Map([...upcomingByTeamId].map(([id, list]) => [id, list.slice(0, FIXTURE_TICKER_LENGTH)])), [upcomingByTeamId]);
  const pitchGameweek = pitchEventId !== null && gameweeks.includes(pitchEventId) ? pitchEventId : (gameweeks[0] ?? null);

  // Model Predicted's club ratings: the Fixture Forecast's, from the club
  // records as the Team Profile shows them (<fixture_forecast>), fitted once
  // for every player's matches.
  const clubRatings = useMemo(
    () =>
      modelClubRatings(
        clubSeasonsAsShown({ clubSeasons, referenceSeason: historicReferenceSeason, currentSeasonHasStarted, livePlayerSumsPartial: historicFetchSkippedPlayerIds.length > 0 }),
      ),
    [clubSeasons, historicReferenceSeason, currentSeasonHasStarted, historicFetchSkippedPlayerIds],
  );
  /** Model Predicted for one of a player's upcoming matches (<points_model>), from his evidence (<points_model_evidence>). */
  const modelFor = useCallback(
    (evidence: ReturnType<typeof playerEvidence>, teamId: number, fixture: UpcomingFixture) =>
      modelForFixture(evidence, clubRatings, teamsById.get(teamId)?.code ?? null, teamsById.get(fixture.opponentTeamId)?.code ?? null, fixture, fromEventId),
    [clubRatings, teamsById, fromEventId],
  );

  // What Model Predicted knows about every player (<points_model_evidence>),
  // worked out once for both gameweeks below.
  const evidenceByPlayerId = useMemo(
    () => new Map(players.map((p) => [p.id, playerEvidence(p, historicProfiles.get(p.id), seasonMatchesByPlayerId.get(p.id), historicReferenceSeason, totalPlayers)])),
    [players, historicProfiles, seasonMatchesByPlayerId, historicReferenceSeason, totalPlayers],
  );
  // FPL Official's season part (<fpl_official>): his points per match he
  // was registered for, from the same season matches Model Predicted reads.
  const fplSeasonRateByPlayerId = useMemo(
    () => new Map(players.map((p) => [p.id, fplSeasonRate(p, seasonMatchesByPlayerId.get(p.id)?.length)])),
    [players, seasonMatchesByPlayerId],
  );
  // Every player's figures for each upcoming gameweek (<upcoming_gameweeks>),
  // in order, his matches in each added up: FPL Official, from FPL's own
  // figures (<fpl_official>, metrics/expectedPoints.ts), and Scoutline's
  // own points model (<points_model>) with its expected minutes
  // (<expected_minutes>). Not captain-doubled: SquadPitch doubles the
  // captain's. Worked out once: the pitch reads its gameweek's, Add
  // Players adds up as many as each Exp. Pts column's horizon asks for.
  const expectationsByPlayerId = useMemo(
    () =>
      new Map(
        players.map((p) => [
          p.id,
          gameweeks.map((eventId) =>
            expectationForGameweek(
              upcomingByTeamId.get(p.teamId) ?? [],
              eventId,
              (fixture, index) => fplOfficialForFixture(p, fixture, index, fplSeasonRateByPlayerId.get(p.id) ?? null),
              (fixture) => modelFor(evidenceByPlayerId.get(p.id) ?? null, p.teamId, fixture),
            ),
          ),
        ]),
      ),
    [players, gameweeks, upcomingByTeamId, fplSeasonRateByPlayerId, evidenceByPlayerId, modelFor],
  );
  // Every player's figures for the gameweek the pitch's arrows pick: the
  // squad's cards show them, and their colours rank them among everyone.
  const pitchExpectations = useMemo(() => {
    const index = pitchGameweek === null ? -1 : gameweeks.indexOf(pitchGameweek);
    return new Map(players.map((p) => [p.id, index < 0 ? null : (expectationsByPlayerId.get(p.id)?.[index] ?? null)]));
  }, [players, gameweeks, pitchGameweek, expectationsByPlayerId]);

  // Add Players' own columns (<shared_player_table> lead columns): the two
  // Exp. Pts, each added up over its own horizon (<points_horizon>), and
  // Exp. Mins, always the next gameweek's — who starts in five weeks'
  // time can't be known now, so it doesn't move (the owner's call,
  // 2026-10-26), as Next 5 Fixtures doesn't.
  const leadColumns: LeadColumn[] = useMemo(() => {
    const listFor = (id: number) => expectationsByPlayerId.get(id) ?? [];
    const points = (key: string, label: string, source: PointsSource, horizon: Horizon, setHorizon: (h: Horizon) => void, hint: string): LeadColumn => {
      const totals = new Map(players.map((p) => [p.id, horizonTotal(listFor(p.id), horizon, source)]));
      return {
        key,
        label,
        value: (id) => totals.get(id) ?? null,
        decimals: 1,
        hint: `${hint} Added up over the gameweeks picked on the header (${horizon === 1 ? "the next one" : `the next ${horizon}`}).`,
        cellHint: (id) => horizonHint(listFor(id), horizon, source, totals.get(id) ?? null),
        trailing: <HorizonPicker value={horizon} onChange={setHorizon} figure={label} />,
      };
    };
    const nextMinutes = new Map(players.map((p) => [p.id, listFor(p.id)[0]?.expectedMinutes ?? null]));
    return [
      points(
        "expFplOfficial",
        "Exp. Pts (FPL Official)",
        "fpl",
        fplHorizon,
        setFplHorizon,
        "Expected points from FPL's own figures: his points a match this season, with goals and assists partly as xG and xA, and a little of his form (FPL's own expected points), adjusted for FPL's fixture difficulty and chance of playing. Hover a figure for its parts.",
      ),
      points(
        "expModelPredicted",
        "Exp. Pts (Model Predicted)",
        "model",
        modelHorizon,
        setModelHorizon,
        "Scoutline's own expected points: his chance of starting, his scoring rates and each match's forecast, through FPL's scoring rules. Hover a figure for its parts.",
      ),
      {
        key: "expectedMinutes",
        label: "Exp. Mins",
        value: (id) => nextMinutes.get(id) ?? null,
        // <whole_numbers>: minutes run to dozens.
        decimals: 0,
        hint: "The minutes Scoutline's model expects him to play in the next gameweek (a double gameweek's two matches added up): his chance of starting, from his recent starts, last season's, a return from an absence, managers selling him and FPL's injury and suspension news, and how long he usually plays. Always the next gameweek: who starts later can't be known yet.",
        cellHint: (id) => minutesGameweekHint(listFor(id)[0] ?? null),
      },
    ];
  }, [players, expectationsByPlayerId, fplHorizon, modelHorizon]);

  // The pitch cards' colours: the forward-looking figures ranked as the
  // Predictive columns rank them (Exp. Pts and Exp. Mins for the gameweek
  // the pitch's arrows pick, as the cards show, whatever Add Players
  // adds up), and today's price and ownership among every player in his
  // position — none of them a Data View's sample, so no minutes floor, and
  // nothing on the pitch changes with Add Players' Data View (M20, the
  // owner's call 2026-10-19).
  const pitchColourRanks: PitchColourRanks = useMemo(() => {
    const squadPurchase = new Map(Object.entries(active?.purchasePrices ?? {}).map(([id, price]) => [Number(id), price]));
    const rank = (value: (p: NormalizedPlayer) => number | null, higherIsBetter: boolean) =>
      rankWithinGroups(players, { id: (p) => p.id, group: (p) => p.position, eligible: () => true, value, higherIsBetter });
    return {
      points: rank((p) => pitchExpectations.get(p.id)?.fpl ?? null, true),
      model: rank((p) => pitchExpectations.get(p.id)?.model ?? null, true),
      minutes: rank((p) => pitchExpectations.get(p.id)?.expectedMinutes ?? null, true),
      price: rank((p) => p.price, false),
      // <price_view>: a squad player's purchase or selling price against everyone else's in his
      // position, whose own would be today's (the price they'd be bought at, and sold for, today).
      purchase: rank((p) => (squadPurchase.has(p.id) ? squadPurchase.get(p.id)! : squadPlayerIdSet.has(p.id) ? null : p.price), false),
      sell: rank((p) => (squadPurchase.has(p.id) ? sellingPrice(squadPurchase.get(p.id), p.price) : squadPlayerIdSet.has(p.id) ? null : p.price), false),
      ownership: rank((p) => p.ownership, false),
      // Ranked for their hovers only (<stat_hover>): nearer a rise ranks higher.
      progress: rank((p) => p.priceChange?.percent ?? null, true),
      predicted: rank((p) => p.priceChange?.projections.find((x) => x.offsetDays === 0)?.projectedPercent ?? null, true),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, pitchExpectations, active?.purchasePrices, active?.playerIds]);

  // Add Players' Add (<add_players_dialog>): the reason it's disabled is its hover text.
  const handleAddRef = useRef(handleAdd);
  handleAddRef.current = handleAdd;
  const addAction = useCallback(
    (player: NormalizedPlayer) => {
      const live = playersById.get(player.id) ?? player;
      const check = canAddPlayer(squadPlayers, live);
      return (
        <button
          type="button"
          className="inline-add-btn"
          disabled={!check.ok}
          title={check.ok ? `Add ${live.name} to the squad` : check.reason}
          onClick={(e) => {
            e.stopPropagation();
            handleAddRef.current(live);
          }}
        >
          Add
        </button>
      );
    },
    [playersById, squadPlayers],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team Building</h1>
        </div>
      </div>

      {showNewSquadModal && (
        <div className="dialog-backdrop" onClick={closeNewSquadModal}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">New Squad</div>
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
              <label htmlFor="new-squad-team-id">
                <span className="hint-term" title={TEAM_ID_HINT}>
                  FPL team ID
                </span>{" "}
                (import)
              </label>
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
                  Delete squad "{squadTitle(target)}"? This can't be undone.
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
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {confirmClear && active && (
        <div className="dialog-backdrop" onClick={() => setConfirmClear(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Clear draft</div>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Remove all {squadPlayers.length} players from "{active.name}"? This can't be undone.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ borderColor: "var(--accent-negative)", color: "var(--accent-negative)" }}
                onClick={handleClearSquad}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {!active && (
        <div className="empty-state">
          <h3>No squad loaded</h3>
          <p>
            Create a blank squad or import a real one from its{" "}
            <span className="hint-term" title={TEAM_ID_HINT}>
              FPL team ID
            </span>{" "}
            with New Squad below to start adding players.
          </p>
        </div>
      )}

      <SectionHeading icon="squad">{active ? squadTitle(active) : "Squad"}</SectionHeading>
      <SquadPicker
        squads={squads.map((s) => ({ id: s.id, title: squadTitle(s) }))}
        activeId={active?.id ?? null}
        name={active?.name ?? ""}
        onSelect={setActiveId}
        onRename={(name) => updateActive((s) => ({ ...s, name }))}
        onNew={openNewSquadModal}
        onDelete={handleDelete}
      />
      {missingSavedIds.length > 0 && (
        <div className="banner stale" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>
            {missingSavedIds.length === 1 ? "1 saved player is" : `${missingSavedIds.length} saved players are`} no longer in FPL's player list, so{" "}
            {missingSavedIds.length === 1 ? "it isn't" : "they aren't"} shown or counted (FPL id {missingSavedIds.join(", ")}).
          </span>
          <IconChipButton icon={<TrashIcon />} label="Remove players no longer in FPL from this squad" onClick={handleRemoveMissingPlayers} />
        </div>
      )}
      <div style={{ marginBottom: 24 }}>
        <SquadPitch
          squadName={active ? squadTitle(active) : ""}
          squadValidation={squadValidation}
          positionGroups={pitchPositionGroups}
          benchPlayers={benchPlayers}
          openSlots={openSlots}
          captainId={active?.captainId ?? null}
          viceCaptainId={active?.viceCaptainId ?? null}
          gameweeks={gameweeks}
          gameweek={pitchGameweek}
          onGameweekChange={setPitchEventId}
          expectationByPlayerId={pitchExpectations}
          purchasePrices={active?.purchasePrices ?? {}}
          purchaseUnknownHint={purchaseUnknownHint(active)}
          colourRanks={pitchColourRanks}
          fixturesByTeamId={fixturesByTeamId}
          captainPickMode={captainPickMode}
          onCaptainTileClick={handleCaptainTileClick}
          onPlayerCardClick={handlePlayerCardClick}
          onViewProfile={handleViewProfile}
          onSwap={handleSwapPlayers}
          onAddToPitch={handleDropOnPitch}
          onBench={handleDropOnBench}
          onRemove={handleRemovePlayer}
          onAddSlot={handleAddSlot}
          onClearSquad={() => setConfirmClear(true)}
          onBestDraft={handleBestDraft}
          hasSquad={!!active}
          budgetHint={budgetHint(active, money)}
          warning={warning}
        />
      </div>

      {active && (
        // <add_players_dialog>: hidden, not unmounted, while closed (see addOpen).
        <div className="add-players-backdrop" hidden={!addOpen} onClick={() => setAddOpen(false)}>
          <div
            className="add-players-panel"
            ref={addPanelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-players-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-players-head">
              <div className="dialog-title" id="add-players-title">
                Add Players
              </div>
              <button type="button" className="add-players-close" onClick={() => setAddOpen(false)} title="Close Add Players" aria-label="Close Add Players">
                <CloseIcon />
              </button>
            </div>
            <PlayerExplorerTable
              variant="panel"
              defaultVisibleColumns={ADD_PLAYERS_DEFAULT_COLUMNS}
              leadColumns={leadColumns}
              excludeIds={squadPlayerIdSet}
              playerAction={addAction}
              fixturesByTeamId={fixturesByTeamId}
              visible={addOpen}
              openRequest={addRequest}
              searchInputId="picker-search"
              csvName="team-building-add-players"
              notice={
                historicStatus === "loading" && (
                  <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
                    Still building historic data. Historic columns, Model Predicted and Exp. Mins will fill in shortly.
                  </p>
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
