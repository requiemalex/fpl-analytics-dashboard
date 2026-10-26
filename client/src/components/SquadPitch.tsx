import React, { useLayoutEffect, useRef, useState } from "react";
import type { GameweekExpectation, PointsSource } from "../metrics/gameweekExpectations";
import { bestDraft, bestDraftBlocker, type DraftPicks } from "../metrics/bestDraft";
import { sellingPrice } from "../metrics/squadPrices";
import { PositionBadge, AvailabilityFlag, availabilityTextClass, pressable } from "./primitives";
import { PitchMarkings } from "./PitchMarkings";
import { Kit } from "./Kit";
import { CloseIcon, PlusIcon } from "./IconToolbar";
import { GameweekArrows, SegmentedControl, type SegmentOption } from "./MenuControls";
import { fmtDate, fmtPrice, fmtPercent, fmtDecimal, DASH } from "../utils/format";
import { fdrColor, type UpcomingFixture } from "../metrics/fixtureTicker";
import { percentileTint } from "../utils/colorScale";
import { SQUAD_RULES } from "../types/team";
import type { OpenSlots, SquadValidation } from "../metrics/squadRules";
import type { NormalizedPlayer, Position } from "../types/normalized";
import { fixtureHint, fplGameweekHint, minutesGameweekHint, modelGameweekHint, playerRankHint } from "./hoverText";

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
 * and Minutes are for the gameweek the pitch's arrows pick
 * (<gameweek_arrows>; a double's two matches added up): Points from the
 * source its FPL/Model toggle picks, Minutes the Model's expected minutes
 * (<expected_minutes>). Price shows the figure its own toggle picks
 * (<price_view>). Fixtures shows the next five matches instead.
 */
export type KitView = "fixtures" | "points" | "price" | "ownership" | "minutes";

const KIT_VIEW_OPTIONS: SegmentOption<KitView>[] = [
  { value: "fixtures", label: "Fixtures", title: "Each player's next five matches, coloured by FPL difficulty" },
  { value: "price", label: "Price", title: "Price: today's, his selling price, his purchase price or its change, as the toggle beside picks" },
  { value: "ownership", label: "Owned", title: "Share of FPL managers who own him" },
  { value: "minutes", label: "Minutes", title: "Expected minutes: how long Scoutline's model expects him to play in the gameweek picked" },
  { value: "points", label: "Points Prediction", title: "Expected points for the gameweek picked (a double's two matches added up): FPL's official figure or Scoutline's model, as the toggle beside picks" },
];

/** FPL Official or Model Predicted: Points Prediction's source, and Best Draft's. */
const SOURCE_OPTIONS: SegmentOption<PointsSource>[] = [
  { value: "fpl", label: "FPL", title: "Exp. Pts (FPL Official), for Points Prediction, Projected Points and Best Draft" },
  { value: "model", label: "Model", title: "Exp. Pts (Model Predicted): Scoutline's own estimate, for Points Prediction, Projected Points and Best Draft" },
];
const SOURCE_NAME: Record<PointsSource, string> = { fpl: "FPL Official", model: "Model Predicted" };

/** <price_view>: which price figure the Price highlight shows. */
export type PriceView = "current" | "purchase" | "sell" | "progress" | "predicted";

const PRICE_VIEW_OPTIONS: SegmentOption<PriceView>[] = [
  { value: "current", label: "Current", title: "Today's price" },
  { value: "purchase", label: "Purchase", title: "Purchase price: what he cost when he joined this squad" },
  { value: "sell", label: "Sell", title: "Selling price: what FPL would pay for him, his purchase price plus half of any rise since (rounded down to £0.1m), or today's price after a fall" },
  { value: "progress", label: "Progress", title: "Progress: FPL's own figure for how far he is toward his next price change, + toward a rise, − toward a drop (100% is the threshold)" },
  { value: "predicted", label: "Predicted Progress", title: "Predicted Progress: where FPL expects his progress to be at the next price update" },
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

/** The squad's figures: value and money left, one strip under its name. */
function SquadTiles({ validation, budgetHint }: { validation: SquadValidation; budgetHint: string }) {
  // To the tenth, as budgetLeftText does.
  const tenths = Math.round(validation.budgetRemaining * 10);
  return (
    <div className="pitch-view-tiles">
      <div className="stat-tile" title={budgetHint}>
        <span className="stat-tile-label">Squad Value</span>
        <span className="stat-tile-value num">{fmtPrice(validation.budgetUsed)}</span>
      </div>
      <div className="stat-tile" title={`${budgetLeftText(validation.budgetRemaining)} of ${fmtPrice(validation.budget)}. ${budgetHint}`}>
        <span className="stat-tile-label">Bank</span>
        <span className={`stat-tile-value num${tenths < 0 ? " value-negative" : ""}`}>{tenths < 0 ? `−${fmtPrice(-tenths / 10)}` : fmtPrice(Math.max(0, tenths) / 10)}</span>
      </div>
    </div>
  );
}

/**
 * <projected_points>: the starting XI's Exp. Pts for the pitch's gameweek
 * from its source, the captain's counted twice, as FPL scores them. A
 * starter with no match that gameweek adds 0; one with a match but no
 * figure leaves the total unknown, never part-counted. Null with no
 * starter, or no gameweek left.
 */
export function projectedPoints(
  starters: readonly NormalizedPlayer[],
  bench: readonly NormalizedPlayer[],
  captainId: number | null,
  expectationByPlayerId: Map<number, GameweekExpectation | null>,
  source: PointsSource,
): { total: number | null; missing: string[]; captain: { name: string; points: number } | null; bench: number | null } {
  const figure = (p: NormalizedPlayer): number | null | undefined => {
    const g = expectationByPlayerId.get(p.id) ?? null;
    if (g === null) return undefined;
    return g.fixtures.length === 0 ? 0 : g[source];
  };
  const missing: string[] = [];
  let total = 0;
  let captain: { name: string; points: number } | null = null;
  for (const p of starters) {
    const value = figure(p);
    if (value === null || value === undefined) {
      missing.push(p.name);
      continue;
    }
    const counted = p.id === captainId ? value * 2 : value;
    if (p.id === captainId) captain = { name: p.name, points: counted };
    total += counted;
  }
  let benchTotal: number | null = 0;
  for (const p of bench) {
    const value = figure(p);
    if (value === null || value === undefined) benchTotal = null;
    else if (benchTotal !== null) benchTotal += value;
  }
  return { total: starters.length > 0 && missing.length === 0 ? total : null, missing, captain, bench: bench.length > 0 ? benchTotal : null };
}

/** <projected_points>: the summary box beside the squad's figures. */
function ProjectedPointsBox({
  starters,
  bench,
  captainId,
  expectationByPlayerId,
  source,
  gameweek,
}: {
  starters: NormalizedPlayer[];
  bench: NormalizedPlayer[];
  captainId: number | null;
  expectationByPlayerId: Map<number, GameweekExpectation | null>;
  source: PointsSource;
  gameweek: number | null;
}) {
  const p = projectedPoints(starters, bench, captainId, expectationByPlayerId, source);
  const sourceName = SOURCE_NAME[source];
  const hint =
    gameweek === null
      ? "No gameweek left to pick for this season"
      : starters.length === 0
        ? "No starting XI yet: start players to see their projected points"
        : p.total === null
          ? `No total yet: ${p.missing.length > 0 ? `${p.missing.join(", ")} ${p.missing.length === 1 ? "has" : "have"} no ${sourceName} figure for GW${gameweek}` : "the figures are still loading"}`
          : `The starting XI's Exp. Pts (${sourceName}) for GW${gameweek}, the captain's counted twice. Changes with the gameweek arrows and the Source toggle.`;
  return (
    <div className="projected-box" title={hint}>
      <div className="projected-box-head">
        <span className="projected-box-label">Projected Points</span>
        <span className="projected-box-tag">
          {gameweek !== null ? `GW${gameweek}` : DASH} · {source === "fpl" ? "FPL" : "Model"}
        </span>
      </div>
      <div className="projected-box-value num">{p.total !== null ? fmtDecimal(p.total, 1) : DASH}</div>
      <div className="projected-box-parts">
        <span>
          Starting XI{starters.length > 0 && starters.length < SQUAD_RULES.startingXISize ? ` (${starters.length})` : ""}
        </span>
        {p.captain && (
          <span>
            Captain {p.captain.name} <span className="num">{fmtDecimal(p.captain.points, 1)}</span>
          </span>
        )}
        {p.bench !== null && (
          <span>
            Bench <span className="num">{fmtDecimal(p.bench, 1)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** FPL's own words for its next-update projection's likelihood, as its Price Changes page shows them. */
const PROJECTION_STATUS: Record<number, string> = { 5: "very likely to rise", 4: "likely to rise", [-4]: "likely to drop", [-5]: "very likely to drop" };

/** "+51.2%", "−105.0%": FPL's progress figures, to one decimal as FPL shows them (the 100% threshold makes 99.6 and 100.0 different things). */
function fmtProgress(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
}

/**
 * <price_progress>: FPL's own Progress (`price_change_percent`) or Predicted
 * Progress (its projection for the next price update,
 * `price_change_projections[0]`), as FPL's Price Changes page reads them.
 * Coloured by the figure itself, not a rank (the owner's call, 2026-10-26):
 * grey at 0 to full green at +100% and full red at −100%, through the
 * shared scale so the palette switch turns it off with the rest. A locked
 * or calibrating price says so instead.
 */
function progressFigure(player: NormalizedPlayer, predicted: boolean): { text: string; title: string; rank: undefined; tint: number | undefined } {
  const pc = player.priceChange;
  const plain = (text: string, title: string) => ({ text, title, rank: undefined, tint: undefined });
  if (!pc) return plain(DASH, "FPL hasn't sent his price change progress");
  if (pc.lockedUntil) return plain("Locked", `FPL has locked his price until ${fmtDate(pc.lockedUntil)}`);
  if (pc.calibrating) return plain("Calibrating", "FPL is still calibrating his price change progress");
  const next = pc.projections.find((p) => p.offsetDays === 0) ?? null;
  const status = next ? (PROJECTION_STATUS[next.likelihood] ?? "unlikely to change") : null;
  const value = predicted ? (next?.projectedPercent ?? null) : pc.percent;
  if (value === null) return plain(DASH, "FPL hasn't sent a prediction for him");
  const towards = value >= 0 ? "a rise" : "a drop";
  const title = predicted
    ? `Predicted Progress ${fmtProgress(value)}: where FPL expects him to be toward ${towards} at the next price update${status ? `, ${status}` : ""}. Now ${fmtProgress(pc.percent)}.`
    : `Progress ${fmtProgress(value)}: FPL's figure for how far he is toward ${towards} (100% is the threshold)${next ? `. Predicted at the next update: ${fmtProgress(next.projectedPercent)}, ${status}` : ""}.`;
  return { text: fmtProgress(value), title, rank: undefined, tint: Math.max(0, Math.min(100, 50 + value / 2)) };
}

/** Every player's ranks for the pitch cards' figures (<comparative_colouring>). Purchase and selling prices rank a squad player's against everyone else's in his position at today's price. */
export interface PitchColourRanks {
  points?: Map<number, number>;
  model?: Map<number, number>;
  minutes?: Map<number, number>;
  price?: Map<number, number>;
  purchase?: Map<number, number>;
  sell?: Map<number, number>;
  ownership?: Map<number, number>;
}
type PitchCardRanks = { [K in keyof PitchColourRanks]?: number };

function pitchCardRanks(ranks: PitchColourRanks, id: number): PitchCardRanks {
  return Object.fromEntries((Object.keys(ranks) as (keyof PitchColourRanks)[]).map((k) => [k, ranks[k]?.get(id)])) as PitchCardRanks;
}

/** A card's one figure: its text and hover; `rank` (his rank within his position) colours it and is named in the hover, `tint` colours it on its own scale. */
interface CardFigure {
  text: string;
  title: string;
  rank: number | undefined;
  tint?: number;
}

/** The nameplate's figure for the Price highlight's choice (<price_view>). */
function priceFigure(player: NormalizedPlayer, priceView: PriceView, purchase: number | null, purchaseUnknownHint: string, ranks: PitchCardRanks): CardFigure {
  if (priceView === "current") return { text: fmtPrice(player.price), title: `${fmtPrice(player.price)} today`, rank: ranks.price };
  if (priceView === "progress" || priceView === "predicted") return progressFigure(player, priceView === "predicted");
  if (purchase === null) return { text: DASH, title: purchaseUnknownHint, rank: undefined };
  if (priceView === "purchase") return { text: fmtPrice(purchase), title: `Bought for ${fmtPrice(purchase)}, ${fmtPrice(player.price)} today`, rank: ranks.purchase };
  const sell = sellingPrice(purchase, player.price);
  return {
    text: fmtPrice(sell),
    title: `Sells for ${fmtPrice(sell)}: bought for ${fmtPrice(purchase)}, ${fmtPrice(player.price)} today (FPL keeps half of a rise, rounded down to £0.1m)`,
    rank: ranks.sell,
  };
}

function PlayerCard({
  player,
  zone,
  view,
  pointsSource,
  priceView,
  isCaptain,
  isViceCaptain,
  isPickable,
  gameweek,
  purchasePrice,
  purchaseUnknownHint,
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
  pointsSource: PointsSource;
  /** Which price Price shows. */
  priceView: PriceView;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isPickable: boolean;
  /** His figures for the gameweek the arrows pick (a double's matches added up) — Exp. Pts not yet captain-doubled, this component doubles them for display when isCaptain. Null with no gameweek left. */
  gameweek: GameweekExpectation | null;
  /** £m paid for him (<purchase_prices>); null when not known. */
  purchasePrice: number | null;
  /** Why his purchase price isn't known, for the hover. */
  purchaseUnknownHint: string;
  /** His ranks within his position for the card's figures (<comparative_colouring>) — none under the floor. */
  ranks: PitchCardRanks;
  /** His next five, for Fixtures. */
  fixtures: UpcomingFixture[];
  onDropOnCard: (draggedId: number, targetId: number, targetZone: "pitch" | "bench") => void;
  onRemove: (id: number) => void;
  onClick: (id: number) => void;
  onViewProfile: (id: number) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const expectedPoints = gameweek?.fpl ?? null;
  const modelPredicted = gameweek?.model ?? null;
  const displayPoints = expectedPoints !== null && isCaptain ? expectedPoints * 2 : expectedPoints;
  const displayModelPredicted = modelPredicted !== null && isCaptain ? modelPredicted * 2 : modelPredicted;
  const expectedMinutes = gameweek?.expectedMinutes ?? null;
  /** A figure's hover, then his rank within his position for it (<hover_text>). */
  const withRank = (text: string, rank: number | undefined) => {
    const phrase = playerRankHint(rank, player.position);
    return phrase ? `${text}\n${phrase}` : text;
  };
  const figure: CardFigure | null =
    view === "points" && pointsSource === "fpl"
      ? {
          text: displayPoints !== null ? fmtDecimal(displayPoints, 1) : DASH,
          title: fplGameweekHint(gameweek, isCaptain),
          rank: ranks.points,
        }
      : view === "points"
        ? {
            text: displayModelPredicted !== null ? fmtDecimal(displayModelPredicted, 1) : DASH,
            title: modelGameweekHint(gameweek, isCaptain),
            rank: ranks.model,
          }
        : view === "price"
          ? priceFigure(player, priceView, purchasePrice, purchaseUnknownHint, ranks)
          : view === "ownership"
            ? { text: fmtPercent(player.ownership, 1), title: `Owned by ${fmtPercent(player.ownership, 1)} of FPL managers`, rank: ranks.ownership }
            : view === "minutes"
              ? {
                  // <whole_numbers>: minutes run to dozens.
                  text: expectedMinutes !== null ? String(Math.round(expectedMinutes)) : DASH,
                  title: minutesGameweekHint(gameweek),
                  rank: ranks.minutes,
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
            <span className="pitch-card-figure num" style={{ background: percentileTint(figure.tint ?? figure.rank) }} title={withRank(figure.title, figure.rank)}>
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

/** <open_slots>: an empty place, on the pitch or the bench. Picking it opens Add Players listing that position (<add_players_dialog>); a player dragged onto it lands there. */
function OpenSlot({ position, disabled, onAdd }: { position: Position; disabled: boolean; onAdd: (position: Position) => void }) {
  const label = `Add a ${POSITION_NOUN[position][0]}: opens Add Players listing ${POSITION_NOUN[position][1]}`;
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
  gameweeks,
  gameweek,
  onGameweekChange,
  expectationByPlayerId,
  purchasePrices,
  purchaseUnknownHint,
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
  onBestDraft,
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
  /** The upcoming gameweeks the arrows step through, by FPL's numbering (<upcoming_gameweeks>); empty with none left this season. */
  gameweeks: number[];
  /** The gameweek the arrows show (<gameweek_arrows>); null with none left. */
  gameweek: number | null;
  onGameweekChange: (eventId: number) => void;
  /** Each squad player's figures for `gameweek`: Points Prediction, Minutes and Best Draft read them. */
  expectationByPlayerId: Map<number, GameweekExpectation | null>;
  /** £m paid for each player, by id (<purchase_prices>): Price's Sell and Purchase. */
  purchasePrices: Record<number, number>;
  /** Why a player's purchase price isn't known, for the hover. */
  purchaseUnknownHint: string;
  /** Every player's ranks for the cards' figures, from the whole player pool (<comparative_colouring>). */
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
  /** <best_draft>: the starting XI and armbands to put in place. */
  onBestDraft: (picks: DraftPicks) => void;
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
  const [pointsSource, setPointsSource] = useState<PointsSource>("fpl");
  const [priceView, setPriceView] = useState<PriceView>("current");
  // With no squad the tile is inert: greyed out, and nothing on it can be
  // clicked, focused or dropped on. React 18 has no `inert` prop.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.toggleAttribute("inert", !hasSquad);
  }, [hasSquad]);

  // <best_draft>: every squad player's figure for the gameweek shown, from Points Prediction's source.
  const starters = COMPOSITION_ORDER.flatMap((pos) => positionGroups[pos]);
  const candidates = [...starters, ...benchPlayers].map((p) => {
    const g = expectationByPlayerId.get(p.id) ?? null;
    return { id: p.id, position: p.position, points: g?.[pointsSource] ?? null, playing: (g?.fixtures.length ?? 0) > 0 };
  });
  const draftBlocker = gameweek === null ? "No gameweek left to pick for this season" : bestDraftBlocker(candidates);
  const handleBestDraft = () => {
    const picks = bestDraft(candidates, { startingXI: starters.map((p) => p.id), captainId, viceCaptainId });
    if (picks) onBestDraft(picks);
  };

  const card = (p: NormalizedPlayer, zone: "pitch" | "bench") => (
    <PlayerCard
      key={p.id}
      player={p}
      zone={zone}
      view={view}
      pointsSource={pointsSource}
      priceView={priceView}
      isCaptain={zone === "pitch" && p.id === captainId}
      isViceCaptain={zone === "pitch" && p.id === viceCaptainId}
      isPickable={zone === "pitch" && captainPickMode !== null}
      gameweek={expectationByPlayerId.get(p.id) ?? null}
      purchasePrice={purchasePrices[p.id] ?? null}
      purchaseUnknownHint={purchaseUnknownHint}
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

  // Three rows above the pitch: the squad's name with its actions, then
  // its figures, then the gameweek and what the kits highlight.
  return (
    <div className={`squad-pitch${hasSquad ? "" : " is-disabled"}`} ref={rootRef} aria-disabled={!hasSquad || undefined}>
      <div className="pitch-view-header">
        <div className="pitch-view-heading">
          {squadName && <span className="pitch-view-title">{squadName}</span>}
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
          <button
            type="button"
            className="btn"
            onClick={handleBestDraft}
            disabled={draftBlocker !== null}
            title={draftBlocker ?? `Pick the starting XI, captain and vice-captain with the most Exp. Pts (${SOURCE_NAME[pointsSource]}) in GW${gameweek}, in a formation FPL allows`}
          >
            Best Draft
          </button>
        </div>
      </div>
      {/* The squad's figures and the pitch's controls, with Projected Points beside them (<projected_points>). */}
      <div className="pitch-view-top">
        <div className="pitch-view-top-main">
          <SquadTiles validation={squadValidation} budgetHint={budgetHint} />
          {squadValidation.clubViolations.length > 0 && (
            <div className="banner error">
              Over {SQUAD_RULES.maxPerClub} from one club: {squadValidation.clubViolations.map((v) => `${v.teamName} ${v.count}/${SQUAD_RULES.maxPerClub}`).join(", ")}
            </div>
          )}
          <div className="pitch-controls">
            <GameweekArrows
              label="Gameweek"
              gameweeks={gameweeks}
              value={gameweek}
              onChange={onGameweekChange}
              describe={(eventId) => `Points Prediction, Minutes, Projected Points and Best Draft are for GW${eventId}`}
            />
            <SegmentedControl label="Highlight" options={KIT_VIEW_OPTIONS} value={view} onChange={setView} />
            {/* Always shown: Projected Points and Best Draft follow it whatever the kits highlight. */}
            <SegmentedControl label="Source" options={SOURCE_OPTIONS} value={pointsSource} onChange={setPointsSource} />
            {view === "price" && <SegmentedControl label="Price" options={PRICE_VIEW_OPTIONS} value={priceView} onChange={setPriceView} />}
          </div>
        </div>
        <ProjectedPointsBox
          starters={starters}
          bench={benchPlayers}
          captainId={captainId}
          expectationByPlayerId={expectationByPlayerId}
          source={pointsSource}
          gameweek={gameweek}
        />
      </div>
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
