import React, { useEffect, useRef, useState } from "react";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { horizonLabel, projectSquadPoints, projectionCoverageNote, type ProjectionHorizon, type ProjectionSource } from "../metrics/squadProjection";
import { PositionBadge, AvailabilityFlag, availabilityTextClass, pressable } from "./primitives";
import { PitchMarkings } from "./PitchMarkings";
import { Kit } from "./Kit";
import { CloseIcon, PlusIcon } from "./IconToolbar";
import { SegmentedControl, type SegmentOption } from "./MenuControls";
import { fmtPrice, fmtPercent, fmtDecimal, DASH } from "../utils/format";
import { fdrColor, type UpcomingFixture } from "../metrics/fixtureTicker";
import { percentileTint } from "../utils/colorScale";
import { SQUAD_RULES } from "../types/team";
import type { OpenSlots, SquadValidation } from "../metrics/squadRules";
import type { NormalizedPlayer, Position } from "../types/normalized";
import type { ExpectedPointsV2Breakdown } from "../metrics/expectedPointsV2";
import { fixtureHint, modelBreakdownHint, playerRankHint, versusText } from "./hoverText";

const PITCH_ROW_ORDER: Position[] = ["FWD", "MID", "DEF", "GKP"];
const COMPOSITION_ORDER: Position[] = ["GKP", "DEF", "MID", "FWD"];
const POSITION_NOUN: Record<Position, [string, string]> = {
  GKP: ["goalkeeper", "goalkeepers"],
  DEF: ["defender", "defenders"],
  MID: ["midfielder", "midfielders"],
  FWD: ["forward", "forwards"],
};

/**
 * <kit_view>: the one figure each kit's nameplate shows, picked with the
 * "Show on kits" switch — rather than every figure at once. Beside it, the
 * match the Match switch picks. Fixtures shows the next five instead.
 */
export type KitView = "fixtures" | "fpl" | "model" | "price" | "ownership" | "reliability";

const KIT_VIEW_OPTIONS: SegmentOption<KitView>[] = [
  { value: "fixtures", label: "Fixtures", title: "Each player's next five matches, coloured by FPL difficulty" },
  { value: "fpl", label: "FPL pts", title: "Exp. Pts (FPL Official) for the match picked in Match" },
  { value: "model", label: "Model pts", title: "Exp. Pts (Model Predicted): Scoutline's own estimate for the match picked in Match" },
  { value: "price", label: "Price", title: "Today's price" },
  { value: "ownership", label: "Owned", title: "Share of FPL managers who own him" },
  { value: "reliability", label: "Minutes", title: "Minutes Reliability: the share of each match he's expected to play" },
];

type GwOffset = 1 | 2 | 3 | 4 | 5;
const GW_OPTIONS: SegmentOption<`${GwOffset}`>[] = ([1, 2, 3, 4, 5] as const).map((offset) => ({
  value: `${offset}`,
  label: `GW+${offset}`,
  title: offset === 1 ? "Each player's next match" : `Each player's ${offset}${offset === 2 ? "nd" : offset === 3 ? "rd" : "th"} match from now (his own, so a blank gameweek is skipped)`,
}));

/** The next five matches as FPL-difficulty chips; the one the Match switch picks is outlined. */
function FixtureTicker({ fixtures, selected }: { fixtures: UpcomingFixture[]; selected: number }) {
  if (fixtures.length === 0) return <span className="value-muted">{DASH}</span>;
  return (
    <div className="pitch-card-fixtures">
      {fixtures.map((f, i) => (
        <span
          key={f.fixtureId}
          className={`pitch-card-fixture${i === selected ? " is-selected" : ""}`}
          style={{ background: fdrColor(f.difficulty) }}
          title={fixtureHint(f)}
        >
          {f.opponentShortName.slice(0, 3)}
        </span>
      ))}
    </div>
  );
}

/** One match as a chip: opponent and (H)/(A), coloured by FPL difficulty. */
function FixturePill({ fixture, gwOffset }: { fixture: UpcomingFixture | undefined; gwOffset: number }) {
  if (!fixture) {
    return (
      <span className="pitch-card-match is-blank" title={`No match at GW+${gwOffset}`}>
        {DASH}
      </span>
    );
  }
  return (
    <span className="pitch-card-match" style={{ background: fdrColor(fixture.difficulty) }} title={fixtureHint(fixture)}>
      {fixture.opponentShortName.slice(0, 3)} ({fixture.isHome ? "H" : "A"})
    </span>
  );
}

/** "£0.1m left", or "£2.1m over" rather than a negative amount left. */
export function budgetLeftText(remaining: number): string {
  // To the tenth, as prices are, so float dust (-0.0000001) isn't "over".
  const tenths = Math.round(remaining * 10);
  // Math.max also turns a rounded -0 into 0, which would print as "£-0.0m".
  return tenths < 0 ? `${fmtPrice(-tenths / 10)} over` : `${fmtPrice(Math.max(0, tenths) / 10)} left`;
}

/** Each squad player's Exp. Pts for his next five matches, by source (index 0 = GW+1). */
export type ProjectionByPlayerId = Map<number, Record<ProjectionSource, (number | null)[]>>;

const SOURCE_OPTIONS: SegmentOption<ProjectionSource>[] = [
  { value: "fpl", label: "FPL", title: "Exp. Pts (FPL Official)" },
  { value: "model", label: "Model", title: "Exp. Pts (Model Predicted): Scoutline's own estimate" },
];
const HORIZON_OPTIONS: SegmentOption<`${ProjectionHorizon}`>[] = ([1, 2, 3, 4, 5] as const).map((n) => ({
  value: `${n}`,
  label: `${n}`,
  title: n === 1 ? "Each player's next match (GW+1)" : `Each player's next ${n} matches (${horizonLabel(n)})`,
}));

/**
 * <squad_projection>: the Projected tile — the starting XI's Exp. Pts
 * added up. Clicking it opens a small menu picking the source (FPL or
 * Model) and how many matches ahead (1–5); the tile's label says which.
 * Per page, like the other switches.
 */
function ProjectedTile({ starters, captainId, projectionByPlayerId }: { starters: NormalizedPlayer[]; captainId: number | null; projectionByPlayerId: ProjectionByPlayerId }) {
  const [source, setSource] = useState<ProjectionSource>("fpl");
  const [horizon, setHorizon] = useState<ProjectionHorizon>(1);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Closes on Escape or a click anywhere outside it, as the Columns picker does.
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const sum = projectSquadPoints(
    starters.map((p) => ({ perMatch: projectionByPlayerId.get(p.id)?.[source] ?? [], isCaptain: p.id === captainId })),
    horizon,
  );
  const sourceName = source === "fpl" ? "FPL" : "Model";
  const hint = [
    `The starting XI's Exp. Pts (${source === "fpl" ? "FPL Official" : "Model Predicted"}) added up over each player's next ${horizon === 1 ? "match" : `${horizon} matches`} (${horizonLabel(horizon)}), the captain's doubled. The bench isn't counted.`,
    projectionCoverageNote(sum),
    "Click to change the source or how many matches.",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div className="pitch-projected" ref={ref}>
      <button type="button" className="stat-tile pitch-projected-tile" aria-expanded={open} title={hint} onClick={() => setOpen((o) => !o)}>
        <span className="stat-tile-label">
          Projected · {sourceName} · {horizonLabel(horizon)}
        </span>
        <span className="stat-tile-value num">
          {sum ? fmtDecimal(sum.sum, 1) : DASH}
          <span className="pitch-projected-unit"> pts</span>
        </span>
      </button>
      {open && (
        <div className="popover pitch-projected-menu" role="group" aria-label="Projected points: source and matches">
          <SegmentedControl label="Source" options={SOURCE_OPTIONS} value={source} onChange={setSource} />
          <SegmentedControl label="Matches" options={HORIZON_OPTIONS} value={`${horizon}`} onChange={(v) => setHorizon(Number(v) as ProjectionHorizon)} />
        </div>
      )}
    </div>
  );
}

/** The pitch header: the squad's name, its starting shape and size on the left; value, money left and Projected as tiles on the right. */
function SquadHeader({
  squadName,
  validation,
  positionGroups,
  budgetHint,
  captainId,
  projectionByPlayerId,
}: {
  squadName: string;
  validation: SquadValidation;
  positionGroups: Record<Position, NormalizedPlayer[]>;
  budgetHint: string;
  captainId: number | null;
  projectionByPlayerId: ProjectionByPlayerId;
}) {
  const xiSize = COMPOSITION_ORDER.reduce((n, pos) => n + positionGroups[pos].length, 0);
  const shape = [positionGroups.DEF.length, positionGroups.MID.length, positionGroups.FWD.length].join("-");
  const composition = COMPOSITION_ORDER.map((pos) => `${pos} ${validation.composition[pos]}/${SQUAD_RULES.composition[pos]}`).join(" · ");
  // To the tenth, as budgetLeftText does.
  const tenths = Math.round(validation.budgetRemaining * 10);
  return (
    <div className="pitch-view-header">
      <div className="pitch-view-heading">
        <span className="pitch-view-title">{squadName}</span>
        {xiSize > 0 && (
          <span className="badge num" title={`Starting shape: ${xiSize} of ${SQUAD_RULES.startingXISize} starters (defenders-midfielders-forwards)`}>
            {shape}
          </span>
        )}
        <span className={`pitch-view-count num ${validation.squadComplete ? "value-positive" : "value-muted"}`} title={composition}>
          {validation.squadSize}/{SQUAD_RULES.squadSize} players
        </span>
      </div>
      <div className="pitch-view-tiles">
        <div className="stat-tile" title={budgetHint}>
          <span className="stat-tile-label">Squad value</span>
          <span className="stat-tile-value num">{fmtPrice(validation.budgetUsed)}</span>
        </div>
        <div className="stat-tile" title={`${budgetLeftText(validation.budgetRemaining)} of ${fmtPrice(validation.budget)}. ${budgetHint}`}>
          <span className="stat-tile-label">In the bank</span>
          <span className={`stat-tile-value num${tenths < 0 ? " value-negative" : ""}`}>{tenths < 0 ? `−${fmtPrice(-tenths / 10)}` : fmtPrice(Math.max(0, tenths) / 10)}</span>
        </div>
        <ProjectedTile starters={COMPOSITION_ORDER.flatMap((pos) => positionGroups[pos])} captainId={captainId} projectionByPlayerId={projectionByPlayerId} />
      </div>
    </div>
  );
}

/** Every player's ranks for the pitch cards' figures, by player id (<comparative_colouring>). */
export interface PitchColourRanks {
  points?: Map<number, number>;
  model?: Map<number, number>;
  reliability?: Map<number, number>;
  price?: Map<number, number>;
  ownership?: Map<number, number>;
}
type PitchCardRanks = { [K in keyof PitchColourRanks]?: number };

function pitchCardRanks(ranks: PitchColourRanks, id: number): PitchCardRanks {
  return { points: ranks.points?.get(id), model: ranks.model?.get(id), reliability: ranks.reliability?.get(id), price: ranks.price?.get(id), ownership: ranks.ownership?.get(id) };
}

function PlayerCard({
  player,
  zone,
  view,
  isCaptain,
  isViceCaptain,
  isPickable,
  expectedPoints,
  modelBreakdown,
  reliability,
  ranks,
  fixtures,
  gwOffset,
  onDropOnCard,
  onRemove,
  onClick,
  onViewProfile,
}: {
  player: NormalizedPlayer;
  zone: "pitch" | "bench";
  view: KitView;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isPickable: boolean;
  /** FPL's own official figure for the navigator-selected gameweek — not yet captain-doubled, this component doubles it for display when isCaptain. */
  expectedPoints: number | null;
  /** Expected Points Tier 2 — this app's own independent estimate for the same gameweek, in parts; same captain-doubling treatment. */
  modelBreakdown: ExpectedPointsV2Breakdown | null;
  /** 0-1 blended reliability share, or null with neither historic nor live data. */
  reliability: number | null;
  /** His ranks within his position for the card's figures (<comparative_colouring>) — none under the floor. */
  ranks: PitchCardRanks;
  fixtures: UpcomingFixture[];
  /** The navigator's selection: both Exp. Pts figures are for fixtures[gwOffset - 1]. */
  gwOffset: number;
  onDropOnCard: (draggedId: number, targetId: number, targetZone: "pitch" | "bench") => void;
  onRemove: (id: number) => void;
  onClick: (id: number) => void;
  onViewProfile: (id: number) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const modelPredicted = modelBreakdown?.total ?? null;
  const target = fixtures[gwOffset - 1];
  const displayPoints = expectedPoints !== null && isCaptain ? expectedPoints * 2 : expectedPoints;
  const displayModelPredicted = modelPredicted !== null && isCaptain ? modelPredicted * 2 : modelPredicted;
  /** A figure's hover, then his rank within his position for it (<hover_text>). */
  const withRank = (text: string, rank: number | undefined) => {
    const phrase = playerRankHint(rank, player.position);
    return phrase ? `${text}\n${phrase}` : text;
  };
  const noMatch = `No match at GW+${gwOffset}`;
  const figure: { text: string; title: string; rank: number | undefined } | null =
    view === "fpl"
      ? {
          text: displayPoints !== null ? fmtDecimal(displayPoints, 1) : DASH,
          title: target ? `FPL's expected points${versusText(target)}${isCaptain ? " (captain ×2)" : ""}` : noMatch,
          rank: ranks.points,
        }
      : view === "model"
        ? {
            text: displayModelPredicted !== null ? fmtDecimal(displayModelPredicted, 1) : DASH,
            title: modelBreakdown ? modelBreakdownHint(modelBreakdown, target, isCaptain) : target ? "Scoutline's model has no figure: there's no playing-time estimate for him" : noMatch,
            rank: ranks.model,
          }
        : view === "price"
          ? { text: fmtPrice(player.price), title: `${fmtPrice(player.price)} today`, rank: ranks.price }
          : view === "ownership"
            ? { text: fmtPercent(player.ownership, 1), title: `Owned by ${fmtPercent(player.ownership, 1)} of FPL managers`, rank: ranks.ownership }
            : view === "reliability"
              ? {
                  text: reliability !== null ? fmtPercent(reliability * 100, 0) : DASH,
                  title: reliability !== null ? `Expected to play about ${fmtPercent(reliability * 100, 0)} of each match` : "No playing-time estimate for him",
                  rank: ranks.reliability,
                }
              : null;

  return (
    <div
      className={`pitch-card ${isDragOver ? "drag-over" : ""} ${isPickable ? "pickable" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(player.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const draggedId = Number(e.dataTransfer.getData("text/plain"));
        if (draggedId && draggedId !== player.id) onDropOnCard(draggedId, player.id, zone);
      }}
      onClick={() => onClick(player.id)}
    >
      <button
        type="button"
        className="pitch-card-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(player.id);
        }}
        title={`Remove ${player.name} from the squad`}
        aria-label={`Remove ${player.name} from the squad`}
      >
        <CloseIcon size={10} />
      </button>
      {isCaptain && (
        <span className="pitch-card-armband" title="Captain">
          C
        </span>
      )}
      {isViceCaptain && (
        <span className="pitch-card-armband vc" title="Vice-Captain">
          V
        </span>
      )}
      <Kit club={{ id: player.teamId, shortName: player.teamShortName }} goalkeeper={player.position === "GKP"} title={player.teamName} />
      <div className="pitch-card-plate">
        <div
          className="pitch-card-name"
          // A distinct reference point: viewing a profile shouldn't also
          // trigger the card's own click (captain-assign) behaviour; pressable stops it.
          {...pressable(() => onViewProfile(player.id), `View ${player.name}'s profile`)}
        >
          <span className={availabilityTextClass(player.status)}>{player.name}</span>
          <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
        </div>
        {figure ? (
          <div className="pitch-card-info">
            <span className="pitch-card-figure num" style={{ background: percentileTint(figure.rank) }} title={withRank(figure.title, figure.rank)}>
              {figure.text}
            </span>
            <FixturePill fixture={target} gwOffset={gwOffset} />
          </div>
        ) : (
          <FixtureTicker fixtures={fixtures} selected={gwOffset - 1} />
        )}
      </div>
    </div>
  );
}

/** <open_slots>: an empty place, on the pitch or the bench. Picking it lists that position in Add Players; a player dragged onto it lands there. */
function OpenSlot({ position, onAdd }: { position: Position; onAdd: (position: Position) => void }) {
  const label = `Add a ${POSITION_NOUN[position][0]}: lists ${POSITION_NOUN[position][1]} in Add Players`;
  return (
    <button type="button" className="pitch-slot-open" onClick={() => onAdd(position)} title={label} aria-label={label}>
      <span className="pitch-slot-plus" aria-hidden="true">
        <PlusIcon size={16} />
      </span>
      <span className="pitch-slot-label">{position}</span>
    </button>
  );
}

export function SquadPitch({
  squadName,
  squadValidation,
  positionGroups,
  benchPlayers,
  openSlots,
  captainId,
  viceCaptainId,
  expectedPointsByPlayerId,
  modelBreakdownByPlayerId,
  projectionByPlayerId,
  reliabilityByPlayerId,
  colourRanks,
  fixturesByTeamId,
  gwOffset,
  onGwOffsetChange,
  captainPickMode,
  onCaptainTileClick,
  onPlayerCardClick,
  onViewProfile,
  onSwap,
  onAddToPitch,
  onBench,
  onRemove,
  onAddSlot,
  onClearSquad,
  warning,
  hasSquad,
  budgetHint,
}: {
  squadName: string;
  squadValidation: SquadValidation;
  positionGroups: Record<Position, NormalizedPlayer[]>;
  benchPlayers: NormalizedPlayer[];
  /** The empty places still to fill (<open_slots>). */
  openSlots: OpenSlots;
  captainId: number | null;
  viceCaptainId: number | null;
  expectedPointsByPlayerId: Map<number, number | null>;
  modelBreakdownByPlayerId: Map<number, ExpectedPointsV2Breakdown | null>;
  /** Both Exp. Pts for each player's next five matches, for the Projected total (<squad_projection>). */
  projectionByPlayerId: ProjectionByPlayerId;
  reliabilityByPlayerId: Map<number, number | null>;
  /** Every player's ranks for the cards' figures, from the Add Players table's pool (<comparative_colouring>). */
  colourRanks: PitchColourRanks;
  fixturesByTeamId: Map<number, UpcomingFixture[]>;
  /** Which of the squad's next 1-5 upcoming fixtures both Exp. Pts figures currently estimate — 1 = the very next fixture. Same "next N fixtures" unit used throughout this app, not a calendar gameweek number (a blank gameweek has no fixture to select). */
  gwOffset: GwOffset;
  onGwOffsetChange: (offset: GwOffset) => void;
  captainPickMode: "captain" | "viceCaptain" | null;
  onCaptainTileClick: (role: "captain" | "viceCaptain") => void;
  onPlayerCardClick: (playerId: number) => void;
  onViewProfile: (playerId: number) => void;
  onSwap: (draggedId: number, targetId: number, targetZone: "pitch" | "bench") => void;
  onAddToPitch: (draggedId: number) => void;
  onBench: (draggedId: number) => void;
  onRemove: (id: number) => void;
  /** An open slot was picked: list that position in Add Players. */
  onAddSlot: (position: Position) => void;
  onClearSquad: () => void;
  /** A rejected drag/drop shows its reason here briefly (e.g. a club-limit breach). */
  warning: string | null;
  /** False before any squad exists: the armband and Clear Draft buttons have nothing to act on, so they're left out. */
  hasSquad: boolean;
  /** Hover text for the budget: where it comes from. */
  budgetHint: string;
}) {
  const [pitchDragOver, setPitchDragOver] = useState(false);
  const [benchDragOver, setBenchDragOver] = useState(false);
  // Per page, like every other view switch (<kit_view>).
  const [view, setView] = useState<KitView>("fpl");

  const card = (p: NormalizedPlayer, zone: "pitch" | "bench") => (
    <PlayerCard
      key={p.id}
      player={p}
      zone={zone}
      view={view}
      isCaptain={zone === "pitch" && p.id === captainId}
      isViceCaptain={zone === "pitch" && p.id === viceCaptainId}
      isPickable={zone === "pitch" && captainPickMode !== null}
      expectedPoints={expectedPointsByPlayerId.get(p.id) ?? null}
      modelBreakdown={modelBreakdownByPlayerId.get(p.id) ?? null}
      reliability={reliabilityByPlayerId.get(p.id) ?? null}
      ranks={pitchCardRanks(colourRanks, p.id)}
      fixtures={fixturesByTeamId.get(p.teamId) ?? []}
      gwOffset={gwOffset}
      onDropOnCard={onSwap}
      onRemove={onRemove}
      onClick={onPlayerCardClick}
      onViewProfile={onViewProfile}
    />
  );
  // The bench in position order, goalkeeper first; each position's players before its open places.
  const benchPlaces = COMPOSITION_ORDER.flatMap((pos) => [
    ...benchPlayers.filter((p) => p.position === pos).map((p) => ({ position: pos, player: p })),
    ...openSlots.bench.filter((b) => b === pos).map(() => ({ position: pos, player: null })),
  ]);

  return (
    <div>
      <SquadHeader
        squadName={squadName}
        validation={squadValidation}
        positionGroups={positionGroups}
        budgetHint={budgetHint}
        captainId={captainId}
        projectionByPlayerId={projectionByPlayerId}
      />
      {squadValidation.clubViolations.length > 0 && (
        <div className="banner error">
          Over {SQUAD_RULES.maxPerClub} from one club: {squadValidation.clubViolations.map((v) => `${v.teamName} ${v.count}/${SQUAD_RULES.maxPerClub}`).join(", ")}
        </div>
      )}
      <div className="pitch-controls">
        <SegmentedControl label="Show on kits" options={KIT_VIEW_OPTIONS} value={view} onChange={setView} />
        <SegmentedControl label="Match" options={GW_OPTIONS} value={`${gwOffset}`} onChange={(v) => onGwOffsetChange(Number(v) as GwOffset)} />
        {hasSquad && (
          <div className="captain-tiles">
            <button
              type="button"
              className={`captain-tile ${captainPickMode === "captain" ? "active" : ""}`}
              onClick={() => onCaptainTileClick("captain")}
              title="Click, then click a starting player to make them captain"
            >
              Captain
            </button>
            <button
              type="button"
              className={`captain-tile vc ${captainPickMode === "viceCaptain" ? "active" : ""}`}
              onClick={() => onCaptainTileClick("viceCaptain")}
              title="Click, then click a starting player to make them vice-captain"
            >
              Vice-Captain
            </button>
            <button type="button" className="chip" onClick={onClearSquad} title={`Remove every player from ${squadName}`}>
              Clear Draft
            </button>
          </div>
        )}
      </div>
      {captainPickMode && (
        <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 8 }}>
          Click a starting player to make them {captainPickMode === "captain" ? "captain" : "vice-captain"}, or click the tile again to
          cancel. Click a player's name instead to view their profile.
        </p>
      )}
      {warning && <div className="banner error">{warning}</div>}

      <div
        className={`pitch ${pitchDragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setPitchDragOver(true);
        }}
        onDragLeave={() => setPitchDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setPitchDragOver(false);
          const draggedId = Number(e.dataTransfer.getData("text/plain"));
          if (draggedId) onAddToPitch(draggedId);
        }}
      >
        <PitchMarkings />
        {PITCH_ROW_ORDER.map((pos) => {
          const players = positionGroups[pos];
          const open = openSlots.pitch[pos];
          if (players.length === 0 && open === 0) return null;
          return (
            <div className="pitch-row" key={pos}>
              {players.map((p) => card(p, "pitch"))}
              {Array.from({ length: open }, (_, i) => (
                <OpenSlot key={`open-${i}`} position={pos} onAdd={onAddSlot} />
              ))}
            </div>
          );
        })}
      </div>

      <div
        className={`bench-strip ${benchDragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setBenchDragOver(true);
        }}
        onDragLeave={() => setBenchDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setBenchDragOver(false);
          const draggedId = Number(e.dataTransfer.getData("text/plain"));
          if (draggedId) onBench(draggedId);
        }}
      >
        <div className="bench-label">Bench</div>
        <div className="bench-row">
          {benchPlaces.map((place, i) => (
            <div className={`bench-slot${place.player ? "" : " is-open"}`} key={place.player?.id ?? `open-${place.position}-${i}`}>
              <span className="bench-slot-position">
                <PositionBadge position={place.position} />
              </span>
              {place.player ? card(place.player, "bench") : <OpenSlot position={place.position} onAdd={onAddSlot} />}
            </div>
          ))}
          {benchPlaces.length === 0 && (
            <p className="page-subtitle" style={{ margin: 0 }}>
              No bench players.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
