import React, { useLayoutEffect, useRef, useState } from "react";
import { projectSquadPointsByMatch, projectionCoverageNote, type ProjectionSource } from "../metrics/squadProjection";
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
 * Highlight switch — rather than every figure at once. Points Prediction
 * is for each player's next match, from the source its FPL/Model toggle
 * picks. Fixtures shows the next five matches instead.
 */
export type KitView = "fixtures" | "points" | "price" | "ownership" | "reliability";

const KIT_VIEW_OPTIONS: SegmentOption<KitView>[] = [
  { value: "fixtures", label: "Fixtures", title: "Each player's next five matches, coloured by FPL difficulty" },
  { value: "points", label: "Points Prediction", title: "Expected points for each player's next match: FPL's official figure or Scoutline's model, as the toggle beside picks" },
  { value: "price", label: "Price", title: "Today's price" },
  { value: "ownership", label: "Owned", title: "Share of FPL managers who own him" },
  { value: "reliability", label: "Minutes", title: "Minutes Reliability: the share of each match he's expected to play" },
];

/** FPL Official or Model Predicted: the Points Prediction toggle and the Projected tile's. */
const SOURCE_OPTIONS: SegmentOption<ProjectionSource>[] = [
  { value: "fpl", label: "FPL", title: "Exp. Pts (FPL Official)" },
  { value: "model", label: "Model", title: "Exp. Pts (Model Predicted): Scoutline's own estimate" },
];

/** The next five matches as FPL-difficulty chips. */
function FixtureTicker({ fixtures }: { fixtures: UpcomingFixture[] }) {
  if (fixtures.length === 0) return <span className="value-muted">{DASH}</span>;
  return (
    <div className="pitch-card-fixtures">
      {fixtures.map((f) => (
        <span key={f.fixtureId} className="pitch-card-fixture" style={{ background: fdrColor(f.difficulty) }} title={fixtureHint(f)}>
          {f.opponentShortName.slice(0, 3)}
        </span>
      ))}
    </div>
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

/**
 * <squad_projection>: the Projected tile — the starting XI's Exp. Pts for
 * each of the next five matches on its own (GW+1 to GW+5), never summed
 * across them. Its FPL/Model toggle picks the source; per page, like the
 * other switches.
 */
function ProjectedTile({ starters, captainId, projectionByPlayerId }: { starters: NormalizedPlayer[]; captainId: number | null; projectionByPlayerId: ProjectionByPlayerId }) {
  const [source, setSource] = useState<ProjectionSource>("fpl");
  const byMatch = projectSquadPointsByMatch(starters.map((p) => ({ perMatch: projectionByPlayerId.get(p.id)?.[source] ?? [], isCaptain: p.id === captainId })));
  const sourceName = source === "fpl" ? "FPL Official" : "Model Predicted";
  return (
    <div className="stat-tile pitch-projected" role="group" aria-label="Projected">
      <div className="pitch-projected-head">
        <span className="stat-tile-label">Projected</span>
        <SegmentedControl options={SOURCE_OPTIONS} value={source} onChange={setSource} compact />
      </div>
      <div className="pitch-projected-matches">
        {byMatch.map((sum, i) => {
          const gw = `GW+${i + 1}`;
          const hint = [
            `${gw}: the starting XI's Exp. Pts (${sourceName}) for each player's ${i === 0 ? "next match" : `match ${i + 1} from now (his own, so a blank gameweek is skipped)`}, the captain's doubled. The bench isn't counted.`,
            projectionCoverageNote(sum),
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <div className="pitch-projected-match" key={gw} title={hint}>
              <span className="pitch-projected-gw">{gw}</span>
              <span className="stat-tile-value num">{sum ? fmtDecimal(sum.sum, 1) : DASH}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The squad's figures: value, money left and Projected, one strip under its name. */
function SquadTiles({
  validation,
  positionGroups,
  budgetHint,
  captainId,
  projectionByPlayerId,
}: {
  validation: SquadValidation;
  positionGroups: Record<Position, NormalizedPlayer[]>;
  budgetHint: string;
  captainId: number | null;
  projectionByPlayerId: ProjectionByPlayerId;
}) {
  // To the tenth, as budgetLeftText does.
  const tenths = Math.round(validation.budgetRemaining * 10);
  return (
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
  pointsSource,
  isCaptain,
  isViceCaptain,
  isPickable,
  expectedPoints,
  modelBreakdown,
  reliability,
  ranks,
  fixtures,
  onDropOnCard,
  onRemove,
  onClick,
  onViewProfile,
}: {
  player: NormalizedPlayer;
  zone: "pitch" | "bench";
  view: KitView;
  /** Which Exp. Pts Points Prediction shows. */
  pointsSource: ProjectionSource;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isPickable: boolean;
  /** FPL's own official figure for his next match — not yet captain-doubled, this component doubles it for display when isCaptain. */
  expectedPoints: number | null;
  /** Expected Points Tier 2 — this app's own independent estimate for the same match, in parts; same captain-doubling treatment. */
  modelBreakdown: ExpectedPointsV2Breakdown | null;
  /** 0-1 blended reliability share, or null with neither historic nor live data. */
  reliability: number | null;
  /** His ranks within his position for the card's figures (<comparative_colouring>) — none under the floor. */
  ranks: PitchCardRanks;
  /** His next five; both Exp. Pts figures are for the first. */
  fixtures: UpcomingFixture[];
  onDropOnCard: (draggedId: number, targetId: number, targetZone: "pitch" | "bench") => void;
  onRemove: (id: number) => void;
  onClick: (id: number) => void;
  onViewProfile: (id: number) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const modelPredicted = modelBreakdown?.total ?? null;
  const target = fixtures[0];
  const displayPoints = expectedPoints !== null && isCaptain ? expectedPoints * 2 : expectedPoints;
  const displayModelPredicted = modelPredicted !== null && isCaptain ? modelPredicted * 2 : modelPredicted;
  /** A figure's hover, then his rank within his position for it (<hover_text>). */
  const withRank = (text: string, rank: number | undefined) => {
    const phrase = playerRankHint(rank, player.position);
    return phrase ? `${text}\n${phrase}` : text;
  };
  const noMatch = "No upcoming match";
  const figure: { text: string; title: string; rank: number | undefined } | null =
    view === "points" && pointsSource === "fpl"
      ? {
          text: displayPoints !== null ? fmtDecimal(displayPoints, 1) : DASH,
          title: target ? `FPL's expected points${versusText(target)}${isCaptain ? " (captain ×2)" : ""}` : noMatch,
          rank: ranks.points,
        }
      : view === "points"
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
          </div>
        ) : (
          <FixtureTicker fixtures={fixtures} />
        )}
      </div>
    </div>
  );
}

/** <open_slots>: an empty place, on the pitch or the bench. Picking it lists that position in Add Players; a player dragged onto it lands there. */
function OpenSlot({ position, disabled, onAdd }: { position: Position; disabled: boolean; onAdd: (position: Position) => void }) {
  const label = `Add a ${POSITION_NOUN[position][0]}: lists ${POSITION_NOUN[position][1]} in Add Players`;
  return (
    <button type="button" className="pitch-slot-open" disabled={disabled} onClick={() => onAdd(position)} title={label} aria-label={label}>
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
  /** False before any squad exists: the whole tile is greyed out and nothing on it can be used, so no player can be added until New Squad makes one. */
  hasSquad: boolean;
  /** Hover text for the budget: where it comes from. */
  budgetHint: string;
}) {
  const [pitchDragOver, setPitchDragOver] = useState(false);
  const [benchDragOver, setBenchDragOver] = useState(false);
  // Per page, like every other view switch (<kit_view>).
  const [view, setView] = useState<KitView>("points");
  const [pointsSource, setPointsSource] = useState<ProjectionSource>("fpl");
  // With no squad the tile is inert: greyed out, and nothing on it can be
  // clicked, focused or dropped on. React 18 has no `inert` prop.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.toggleAttribute("inert", !hasSquad);
  }, [hasSquad]);

  const card = (p: NormalizedPlayer, zone: "pitch" | "bench") => (
    <PlayerCard
      key={p.id}
      player={p}
      zone={zone}
      view={view}
      pointsSource={pointsSource}
      isCaptain={zone === "pitch" && p.id === captainId}
      isViceCaptain={zone === "pitch" && p.id === viceCaptainId}
      isPickable={zone === "pitch" && captainPickMode !== null}
      expectedPoints={expectedPointsByPlayerId.get(p.id) ?? null}
      modelBreakdown={modelBreakdownByPlayerId.get(p.id) ?? null}
      reliability={reliabilityByPlayerId.get(p.id) ?? null}
      ranks={pitchCardRanks(colourRanks, p.id)}
      fixtures={fixturesByTeamId.get(p.teamId) ?? []}
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

  const xiSize = COMPOSITION_ORDER.reduce((n, pos) => n + positionGroups[pos].length, 0);
  const shape = [positionGroups.DEF.length, positionGroups.MID.length, positionGroups.FWD.length].join("-");
  const composition = COMPOSITION_ORDER.map((pos) => `${pos} ${squadValidation.composition[pos]}/${SQUAD_RULES.composition[pos]}`).join(" · ");

  // Three rows above the pitch: the squad (name, shape, size) with its
  // actions, then its figures, then what the kits highlight.
  return (
    <div className={`squad-pitch${hasSquad ? "" : " is-disabled"}`} ref={rootRef} aria-disabled={!hasSquad || undefined}>
      <div className="pitch-view-header">
        <div className="pitch-view-heading">
          {squadName && <span className="pitch-view-title">{squadName}</span>}
          {xiSize > 0 && (
            <span className="badge num" title={`Starting shape: ${xiSize} of ${SQUAD_RULES.startingXISize} starters (defenders-midfielders-forwards)`}>
              {shape}
            </span>
          )}
          <span className={`pitch-view-count num ${squadValidation.squadComplete ? "value-positive" : "value-muted"}`} title={composition}>
            {squadValidation.squadSize}/{SQUAD_RULES.squadSize} players
          </span>
        </div>
        <div className="pitch-view-actions">
          <button
            type="button"
            className={`btn${captainPickMode === "captain" ? " active" : ""}`}
            aria-pressed={captainPickMode === "captain"}
            onClick={() => onCaptainTileClick("captain")}
            title="Click, then click a starting player to make them captain"
          >
            Captain
          </button>
          <button
            type="button"
            className={`btn${captainPickMode === "viceCaptain" ? " active" : ""}`}
            aria-pressed={captainPickMode === "viceCaptain"}
            onClick={() => onCaptainTileClick("viceCaptain")}
            title="Click, then click a starting player to make them vice-captain"
          >
            Vice-Captain
          </button>
          <button type="button" className="btn" onClick={onClearSquad} title={`Remove every player from ${squadName || "this squad"}`}>
            Clear Draft
          </button>
        </div>
      </div>
      <SquadTiles
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
        <SegmentedControl label="Highlight" options={KIT_VIEW_OPTIONS} value={view} onChange={setView} />
        {view === "points" && <SegmentedControl label="Source" options={SOURCE_OPTIONS} value={pointsSource} onChange={setPointsSource} />}
      </div>
      {captainPickMode && (
        <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 8 }}>
          Click a starting player to make them {captainPickMode === "captain" ? "captain" : "vice-captain"}, or click the button again to
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
                <OpenSlot key={`open-${i}`} position={pos} disabled={!hasSquad} onAdd={onAddSlot} />
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
              {place.player ? card(place.player, "bench") : <OpenSlot position={place.position} disabled={!hasSquad} onAdd={onAddSlot} />}
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
