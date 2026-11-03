import React, { useLayoutEffect, useRef, useState } from "react";
import type { GameweekExpectation, PointsSource } from "../metrics/gameweekExpectations";
import { bestDraft, bestDraftBlocker, type DraftPicks } from "../metrics/bestDraft";
import { sellingPrice } from "../metrics/squadPrices";
import { PositionBadge, AvailabilityFlag, availabilityTextClass, pressable } from "./primitives";
import { PitchMarkings } from "./PitchMarkings";
import { Kit } from "./Kit";
import {
  ArmbandIcon,
  BestDraftIcon,
  CalendarIcon,
  ClearDraftIcon,
  ClockIcon,
  CloseIcon,
  ForecastIcon,
  GameweekSummaryIcon,
  IconChipButton,
  ModelIcon,
  OwnershipIcon,
  PlusIcon,
  PriceIcon,
  PriceTagIcon,
  ProgressIcon,
  PurchaseIcon,
  ResetIcon,
  SellIcon,
} from "./IconToolbar";
import { FplSourceIcon } from "./SourceToggle";
import { PlayerNameCell } from "./PlayerNameCell";
import type { ChipName } from "../types/team";
import { GameweekArrows, SegmentedControl, type SegmentOption } from "./MenuControls";
import { fmtPrice, fmtPercent, fmtDecimal, DASH } from "../utils/format";
import { fdrColor, type UpcomingFixture } from "../metrics/fixtureTicker";
import { percentileColour, percentileTint } from "../utils/colorScale";
import { SQUAD_RULES } from "../types/team";
import type { OpenSlots, SquadValidation } from "../metrics/squadRules";
import type { NormalizedPlayer, Position } from "../types/normalized";
import { oddsFigureFor, type FixtureOdds } from "../metrics/fixtureOdds";
import { progressReading } from "../metrics/priceProgress";
import { FIXTURES_VIEW_OPTIONS, ODDS_KIND, fmtOdds, oddsDefinition, type FixturesView } from "./fixturesView";
import { fixtureHint, fplGameweekHint, minutesGameweekHint, modelGameweekHint, percentileHint, playerRankHint, statHover } from "./hoverText";

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
 * Highlight switch — rather than every figure at once. Exp. Pts
 * and Minutes are for the gameweek the pitch's arrows pick
 * (<gameweek_arrows>; a double's two matches added up): Points from the
 * source its FPL/Model toggle picks, Minutes the Model's expected minutes
 * (<expected_minutes>). Price shows the figure its own toggle picks
 * (<price_view>). Fixtures shows the next five matches instead, as its
 * own toggle picks (<fixture_odds>): Games, the opponents coloured by FPL
 * difficulty, or Odds, the club's Fixture Forecast for each. Each toggle
 * shows only beside its own highlight. Every switch is icons, each named in
 * its hover, as the page's actions are (the owner's call, 2026-11-02).
 */
export type KitView = "fixtures" | "points" | "price" | "ownership" | "minutes";

const KIT_VIEW_OPTIONS: SegmentOption<KitView>[] = [
  { value: "fixtures", icon: <CalendarIcon size={16} />, title: "Fixtures: each player's next five matches, the opponents or his club's odds in each, as the toggle beside picks" },
  { value: "price", icon: <PriceIcon />, title: "Price: today's, his selling price, his purchase price or its progress toward a change, as the toggle beside picks" },
  { value: "ownership", icon: <OwnershipIcon />, title: "Owned: share of FPL managers who own him" },
  { value: "minutes", icon: <ClockIcon />, title: "Exp. Mins: how long Scoutline's model expects him to play in the gameweek picked" },
  {
    value: "points",
    icon: <ForecastIcon />,
    title: "Exp. Pts: expected points for the gameweek picked (a double's two matches added up), from the FPL or Model source beside Projected Points",
  },
];

/** FPL Official or Model Predicted: Exp. Pts' source, and Best Draft's. */
const SOURCE_OPTIONS: SegmentOption<PointsSource>[] = [
  { value: "fpl", icon: <FplSourceIcon size={16} />, title: "Exp. Pts (FPL Official), for the cards' Exp. Pts, Projected Points and Best Draft" },
  { value: "model", icon: <ModelIcon />, title: "Exp. Pts (Model Predicted): Scoutline's own estimate, for the cards' Exp. Pts, Projected Points and Best Draft" },
];
const SOURCE_NAME: Record<PointsSource, string> = { fpl: "FPL Official", model: "Model Predicted" };

/** <price_view>: which price figure the Price highlight shows. */
export type PriceView = "current" | "purchase" | "sell" | "progress" | "predicted";

const PRICE_VIEW_OPTIONS: SegmentOption<PriceView>[] = [
  { value: "current", icon: <PriceTagIcon />, title: "Current: today's price" },
  { value: "purchase", icon: <PurchaseIcon />, title: "Purchase price: what he cost when he joined this squad" },
  { value: "sell", icon: <SellIcon />, title: "Selling price: what FPL would pay for him, his purchase price plus half of any rise since (rounded down to £0.1m), or today's price after a fall" },
  { value: "progress", icon: <ProgressIcon />, title: "Progress: FPL's own figure for how far he is toward his next price change, + toward a rise, − toward a drop (100% is the threshold)" },
  { value: "predicted", icon: <ProgressIcon predicted />, title: "Predicted Progress: where FPL expects his progress to be at the next price update" },
];

/** What each price figure is: the first line of its hover on a card (<stat_hover>). */
const PRICE_DEFINITION: Record<PriceView, string> = {
  current: "Price: his FPL price today.",
  purchase: "Purchase price: what he cost when he joined this squad.",
  sell: "Selling price: what FPL would pay for him, his purchase price plus half of any rise since (rounded down to £0.1m), or today's price after a fall.",
  progress: "Progress: FPL's own figure for how far he is toward his next price change, + toward a rise, − toward a drop (100% is the threshold).",
  predicted: "Predicted Progress: where FPL expects his progress to be at the next price update.",
};

/**
 * One match's odds chip (<fixture_odds>): the opponent over the club
 * figure his position reads, so each reads as that match's, tinted by its
 * rank among every club's fixtures.
 */
function OddsChip({ fixture, odds, position }: { fixture: UpcomingFixture; odds: FixtureOdds | null; position: Position }) {
  const figure = oddsFigureFor(position);
  const where = `${fixture.opponentShortName} ${fixture.isHome ? "at home" : "away"}`;
  const opponent = <span className="pitch-card-fixture-opponent">{fixture.opponentShortName.slice(0, 3)}</span>;
  if (!odds) {
    return (
      <span className="pitch-card-fixture is-odds" title={`${where}: no forecast yet (club records still loading)`}>
        {opponent}
        <span className="pitch-card-fixture-value">{DASH}</span>
      </span>
    );
  }
  const value = odds.forecast[figure];
  const text = fmtOdds(figure, value);
  const definition = oddsDefinition(fixture, figure, value);
  const rank = odds.rank[figure];
  return (
    <span className="pitch-card-fixture is-odds" style={{ background: percentileTint(rank) }} title={statHover(definition, percentileHint(rank, "every club's upcoming fixtures"))}>
      {opponent}
      <span className="pitch-card-fixture-value">{text}</span>
    </span>
  );
}

/** The next five matches: FPL-difficulty chips (Games), or the club's odds for each (Odds, <fixture_odds>), led by what they are. */
function FixtureTicker({
  fixtures,
  view,
  odds,
  position,
}: {
  fixtures: UpcomingFixture[];
  view: FixturesView;
  odds: Map<number, FixtureOdds | null> | undefined;
  position: Position;
}) {
  if (fixtures.length === 0) return <span className="value-muted">{DASH}</span>;
  const kind = view === "odds" ? ODDS_KIND[oddsFigureFor(position)] : null;
  return (
    <div className={`pitch-card-fixtures${kind ? " is-odds" : ""}`}>
      {kind && (
        <span className="pitch-card-odds-kind" title={kind.title} aria-label={kind.title} role="img">
          {kind.icon(11)}
        </span>
      )}
      {fixtures.map((f) =>
        view === "odds" ? (
          <OddsChip key={f.fixtureId} fixture={f} odds={odds?.get(f.fixtureId) ?? null} position={position} />
        ) : (
          <span key={f.fixtureId} className="pitch-card-fixture" style={{ background: fdrColor(f.difficulty) }} title={fixtureHint(f)}>
            {f.opponentShortName.slice(0, 3)}
          </span>
        ),
      )}
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

/**
 * <squad_value>: FPL's own Squad Value — the squad's players at today's
 * prices (the owner's call, 2026-10-26, so it reads as FPL's does). What
 * they count against the budget can be less: an imported player he still
 * holds counts at his selling price (<imported_budget>), FPL keeping half
 * of each rise; the hover gives that figure where it differs.
 */
export function squadMarketValue(players: readonly Pick<NormalizedPlayer, "price">[]): number {
  return players.reduce((sum, p) => sum + Math.round(p.price * 10), 0) / 10;
}

/** <squad_chips>: how a chip played this gameweek counts in Projected Points, as FPL scores it: the captain's multiplier, and whether the bench counts. */
export function chipScoring(chip: ChipName | null): { captainMultiplier: number; benchCounts: boolean } {
  return { captainMultiplier: chip === "3xc" ? 3 : 2, benchCounts: chip === "bboost" };
}

/**
 * <projected_points>: the starting XI's Exp. Pts for the pitch's gameweek
 * from its source, the captain's counted twice (three times under Triple
 * Captain), as FPL scores them; under Bench Boost the bench counts too. A
 * player with no match that gameweek adds 0; one with a match but no
 * figure leaves the total unknown, never part-counted. Null with no
 * starter, or no gameweek left.
 */
export function projectedPoints(
  starters: readonly NormalizedPlayer[],
  captainId: number | null,
  expectationByPlayerId: Map<number, GameweekExpectation | null>,
  source: PointsSource,
  chip: { captainMultiplier: number; bench: readonly NormalizedPlayer[] } = { captainMultiplier: 2, bench: [] },
): { total: number | null; missing: string[]; captain: { id: number; name: string; points: number } | null } {
  const missing: string[] = [];
  let total = 0;
  let captain: { id: number; name: string; points: number } | null = null;
  for (const p of [...starters, ...chip.bench]) {
    const g = expectationByPlayerId.get(p.id) ?? null;
    const value = g === null ? null : g.fixtures.length === 0 ? 0 : g[source];
    if (value === null) {
      missing.push(p.name);
      continue;
    }
    const counted = p.id === captainId ? value * chip.captainMultiplier : value;
    if (p.id === captainId) captain = { id: p.id, name: p.name, points: counted };
    total += counted;
  }
  return { total: starters.length > 0 && missing.length === 0 ? total : null, missing, captain };
}

/** <projected_points_colour>: how far short of Best Draft's total turns Projected Points full red (a fifth); half of it is neutral grey. */
const PROJECTED_SHORTFALL_RED = 0.2;

/**
 * <projected_points_colour>: Projected Points against the best this squad
 * could score (Best Draft's XI and armbands, same gameweek and source), on
 * the shared scale: full green at Best Draft's total, grey a tenth short,
 * full red a fifth or more short. The owner's call (2026-10-30), like FPL's
 * price Progress coloured by the figure itself rather than a rank, and
 * through percentileColour so the palette switch turns it off. Null when
 * either total isn't known.
 */
export function projectedPointsScore(current: number | null, best: number | null): number | null {
  if (current === null || best === null || best <= 0) return null;
  const shortfall = Math.max(0, (best - current) / best);
  return Math.max(0, 100 - (shortfall / PROJECTED_SHORTFALL_RED) * 100);
}

/** One figure in the summary's top row: its label over its value. */
function SummaryFigure({ label, value, title, colour, negative }: { label: string; value: string; title: string; colour?: string; negative?: boolean }) {
  return (
    <div className="squad-summary-figure" title={title}>
      <span className="squad-summary-label">{label}</span>
      <span className={`squad-summary-value num${negative ? " value-negative" : ""}`} style={colour ? { color: colour } : undefined}>
        {value}
      </span>
    </div>
  );
}

/**
 * The summary's top row (<squad_summary>): Projected Points and the
 * captain's share of it, then Squad Value, Bank, and the squad's transfers
 * and chips (<squad_transfers>, <squad_chips>: `planning`, from Team
 * Building). The Exp. Pts source toggle sits in Projected Points' own box,
 * beside the figure: the cards' Exp. Pts, Projected Points, the captain's
 * figure and Best Draft all follow it, whatever the kits highlight (the
 * owner's call, 2026-11-02). The captain is shown as the Explorers' Player
 * column shows a player (PlayerNameCell), his figure beside him.
 */
function SummaryFigures({
  starters,
  bench,
  captainId,
  expectationByPlayerId,
  source,
  onSourceChange,
  gameweek,
  bestPicks,
  validation,
  budgetHint,
  marketValue,
  chip,
  planning,
  onViewProfile,
}: {
  starters: NormalizedPlayer[];
  bench: NormalizedPlayer[];
  captainId: number | null;
  expectationByPlayerId: Map<number, GameweekExpectation | null>;
  source: PointsSource;
  onSourceChange: (source: PointsSource) => void;
  gameweek: number | null;
  /** Best Draft's starters, bench and captain for the same gameweek and source; null when it can't run. */
  bestPicks: { starters: NormalizedPlayer[]; bench: NormalizedPlayer[]; captainId: number | null } | null;
  validation: SquadValidation;
  budgetHint: string;
  marketValue: number;
  /** The chip played for the pitch's gameweek, if any (<squad_chips>). */
  chip: ChipName | null;
  planning: React.ReactNode;
  onViewProfile: (id: number) => void;
}) {
  const scoring = chipScoring(chip);
  const p = projectedPoints(starters, captainId, expectationByPlayerId, source, { captainMultiplier: scoring.captainMultiplier, bench: scoring.benchCounts ? bench : [] });
  const best = bestPicks
    ? projectedPoints(bestPicks.starters, bestPicks.captainId, expectationByPlayerId, source, {
        captainMultiplier: scoring.captainMultiplier,
        bench: scoring.benchCounts ? bestPicks.bench : [],
      }).total
    : null;
  const counted = `${scoring.benchCounts ? "The whole squad's" : "The starting XI's"} Exp. Pts (${SOURCE_NAME[source]}) for GW${gameweek}, the captain's counted ${scoring.captainMultiplier === 3 ? "three times (Triple Captain)" : "twice"}${scoring.benchCounts ? " (Bench Boost)" : ""}`;
  const captainPlayer = p.captain ? starters.find((s) => s.id === p.captain!.id) : undefined;
  const score = projectedPointsScore(p.total, best);
  const sourceName = SOURCE_NAME[source];
  const projectedHint =
    gameweek === null
      ? "No gameweek left to pick for this season"
      : starters.length === 0
        ? "No starting XI yet: start players to see their projected points"
        : p.total === null
          ? `No total yet: ${p.missing.length > 0 ? `${p.missing.join(", ")} ${p.missing.length === 1 ? "has" : "have"} no ${sourceName} figure for GW${gameweek}` : "the figures are still loading"}`
          : `${counted}, before any transfer's hit.${best !== null ? ` Best Draft would make it ${fmtDecimal(best, 1)}: green at that, red the further short of it.` : ""}`;
  // To the tenth, as budgetLeftText does.
  const tenths = Math.round(validation.budgetRemaining * 10);
  const sellingDiffers = Math.round(validation.budgetUsed * 10) !== Math.round(marketValue * 10);
  const valueHint = `Squad Value ${fmtPrice(marketValue)}: the squad's players at today's prices, as FPL shows it.${
    sellingDiffers ? ` Against the budget they count ${fmtPrice(validation.budgetUsed)}: a player you've held since the import counts at his selling price, as FPL keeps half of each rise.` : ""
  }`;
  return (
    <div className="squad-summary-figures">
      <div className="squad-summary-figure is-split">
        <SummaryFigure label="Projected Points" value={p.total !== null ? fmtDecimal(p.total, 1) : DASH} title={projectedHint} colour={percentileColour(score)} />
        <SegmentedControl label="Source" hideLabel options={SOURCE_OPTIONS} value={source} onChange={onSourceChange} />
      </div>
      <div className="squad-summary-figure is-captain">
        <span className="squad-summary-label">Captain</span>
        <div className="squad-summary-captain">
          <span
            className="squad-summary-value num"
            title={
              p.captain
                ? `${p.captain.name}'s Exp. Pts (${sourceName}) for GW${gameweek}, ${scoring.captainMultiplier === 3 ? "tripled (Triple Captain)" : "doubled as captain"}`
                : "No captain yet: pick one with the armband icon"
            }
          >
            {p.captain ? fmtDecimal(p.captain.points, 1) : DASH}
          </span>
          {captainPlayer && <PlayerNameCell player={captainPlayer} onOpen={onViewProfile} />}
        </div>
      </div>
      <SummaryFigure label="Squad Value" value={fmtPrice(marketValue)} title={valueHint} />
      <SummaryFigure
        label="Bank"
        value={tenths < 0 ? `−${fmtPrice(-tenths / 10)}` : fmtPrice(Math.max(0, tenths) / 10)}
        title={`${budgetLeftText(validation.budgetRemaining)} of ${fmtPrice(validation.budget)}. ${budgetHint}`}
        negative={tenths < 0}
      />
      {planning}
    </div>
  );
}

/** <price_progress>: Progress or Predicted Progress (metrics/priceProgress.ts), as the player tables read it; its hover still ranks it within his position, as a neutral figure: nearer a rise ranks higher (<stat_hover>). */
function progressFigure(player: NormalizedPlayer, predicted: boolean, hoverRank: number | undefined): CardFigure {
  const r = progressReading(player, predicted);
  if (r.value === null) return { text: r.text, title: r.title, rank: undefined, tint: undefined };
  return { text: r.text, title: r.title, rank: undefined, tint: r.tint, hoverRank, neutral: true };
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
  /** Progress and Predicted Progress: ranked for the hover only (neutral, never a tint: they're coloured by the figure itself). */
  progress?: Map<number, number>;
  predicted?: Map<number, number>;
}
type PitchCardRanks = { [K in keyof PitchColourRanks]?: number };

function pitchCardRanks(ranks: PitchColourRanks, id: number): PitchCardRanks {
  return Object.fromEntries((Object.keys(ranks) as (keyof PitchColourRanks)[]).map((k) => [k, ranks[k]?.get(id)])) as PitchCardRanks;
}

/**
 * A card's one figure: its text and hover; `rank` (his rank within his position) colours it and is named in the hover, `tint`
 * colours it on its own scale. `hoverRank`: a rank for the hover alone (`neutral`: neither better nor worse).
 */
interface CardFigure {
  text: string;
  title: string;
  rank: number | undefined;
  tint?: number;
  hoverRank?: number;
  neutral?: boolean;
}

/** The nameplate's figure for the Price highlight's choice (<price_view>). */
function priceFigure(player: NormalizedPlayer, priceView: PriceView, purchase: number | null, purchaseUnknownHint: string, ranks: PitchCardRanks): CardFigure {
  if (priceView === "current") return { text: fmtPrice(player.price), title: `${fmtPrice(player.price)} today`, rank: ranks.price };
  if (priceView === "progress" || priceView === "predicted") return progressFigure(player, priceView === "predicted", ranks[priceView]);
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
  captainMultiplier,
  pointsSource,
  priceView,
  fixturesView,
  odds,
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
  /** The captain's multiplier: 2, or 3 under Triple Captain (<squad_chips>). */
  captainMultiplier: number;
  /** Which Exp. Pts the cards show. */
  pointsSource: PointsSource;
  /** Which price Price shows. */
  priceView: PriceView;
  /** What Fixtures shows (<fixture_odds>). */
  fixturesView: FixturesView;
  /** His club's odds for each of his next five, by fixture id. */
  odds: Map<number, FixtureOdds | null> | undefined;
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
  const displayPoints = expectedPoints !== null && isCaptain ? expectedPoints * captainMultiplier : expectedPoints;
  const displayModelPredicted = modelPredicted !== null && isCaptain ? modelPredicted * captainMultiplier : modelPredicted;
  const captaincy = isCaptain ? captainMultiplier : false;
  const expectedMinutes = gameweek?.expectedMinutes ?? null;
  /** A figure's hover (<stat_hover>): what it is, his figure explained, then his percentile within his position. */
  const definition =
    view === "points"
      ? `Exp. Pts (${SOURCE_NAME[pointsSource]}): expected points for the gameweek picked, a double's two matches added up.`
      : view === "price"
        ? PRICE_DEFINITION[priceView]
        : view === "ownership"
          ? "Owned: share of FPL managers who own him."
          : view === "minutes"
            ? "Minutes: how long Scoutline's model expects him to play in the gameweek picked."
            : undefined;
  const withRank = (f: CardFigure) =>
    statHover([definition, f.title].filter(Boolean).join("\n"), playerRankHint(f.rank ?? f.hoverRank, player.position, { neutral: f.neutral }));
  const figure: CardFigure | null =
    view === "points" && pointsSource === "fpl"
      ? {
          text: displayPoints !== null ? fmtDecimal(displayPoints, 1) : DASH,
          title: fplGameweekHint(gameweek, captaincy),
          rank: ranks.points,
        }
      : view === "points"
        ? {
            text: displayModelPredicted !== null ? fmtDecimal(displayModelPredicted, 1) : DASH,
            title: modelGameweekHint(gameweek, captaincy),
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
            <span className="pitch-card-figure num" style={{ background: percentileTint(figure.tint ?? figure.rank) }} title={withRank(figure)}>
              {figure.text}
            </span>
          </div>
        ) : (
          <FixtureTicker fixtures={fixtures} view={fixturesView} odds={odds} position={player.position} />
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
  fixtureOddsByTeamId,
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
  onResetDraft,
  resetBlocker,
  onBestDraft,
  onOpenSummary,
  summaryBlocker,
  chip,
  planning,
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
  /** Each squad player's figures for `gameweek`: Exp. Pts, Exp. Mins and Best Draft read them. */
  expectationByPlayerId: Map<number, GameweekExpectation | null>;
  /** £m paid for each player, by id (<purchase_prices>): Price's Sell and Purchase. */
  purchasePrices: Record<number, number>;
  /** Why a player's purchase price isn't known, for the hover. */
  purchaseUnknownHint: string;
  /** Every player's ranks for the cards' figures, from the whole player pool (<comparative_colouring>). */
  colourRanks: PitchColourRanks;
  fixturesByTeamId: Map<number, UpcomingFixture[]>;
  /** Each club's odds for its next five (<fixture_odds>): Fixtures → Odds. */
  fixtureOddsByTeamId: Map<number, Map<number, FixtureOdds | null>>;
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
  /** <reset_draft>: puts the squad back as it was after the last deadline. */
  onResetDraft?: () => void;
  /** Why Reset Draft can't run (nothing to go back to, or nothing changed); null when it can. */
  resetBlocker?: string | null;
  /** <best_draft>: the starting XI and armbands to put in place. */
  onBestDraft: (picks: DraftPicks) => void;
  /** <gameweek_summary>: opens the Gameweek Summary and Log. */
  onOpenSummary?: () => void;
  /** Why the Gameweek Summary can't open yet (no gameweek played); null when it can. */
  summaryBlocker?: string | null;
  /** <squad_chips>: the chip played for the pitch's gameweek, if any: Projected Points, the captain's figures and Best Draft's total count it. */
  chip?: ChipName | null;
  /** <squad_transfers>, <squad_chips>: the Transfers and Chips figures, after Bank. */
  planning?: React.ReactNode;
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
  const [fixturesView, setFixturesView] = useState<FixturesView>("games");
  // With no squad the tile is inert: greyed out, and nothing on it can be
  // clicked, focused or dropped on. React 18 has no `inert` prop.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.toggleAttribute("inert", !hasSquad);
  }, [hasSquad]);

  // <best_draft>: every squad player's figure for the gameweek shown, from the cards' Exp. Pts source.
  const starters = COMPOSITION_ORDER.flatMap((pos) => positionGroups[pos]);
  const candidates = [...starters, ...benchPlayers].map((p) => {
    const g = expectationByPlayerId.get(p.id) ?? null;
    return { id: p.id, position: p.position, points: g?.[pointsSource] ?? null, playing: (g?.fixtures.length ?? 0) > 0 };
  });
  const draftBlocker = gameweek === null ? "No gameweek left to pick for this season" : bestDraftBlocker(candidates);
  const draftPicks = draftBlocker === null ? bestDraft(candidates, { startingXI: starters.map((p) => p.id), captainId, viceCaptainId }) : null;
  const handleBestDraft = () => {
    if (draftPicks) onBestDraft(draftPicks);
  };
  // <projected_points_colour>: what Best Draft's picks would score, to colour Projected Points against.
  const squadById = new Map([...starters, ...benchPlayers].map((p) => [p.id, p]));
  const bestPicks = draftPicks
    ? {
        starters: draftPicks.startingXI.map((id) => squadById.get(id)).filter((p): p is NormalizedPlayer => !!p),
        bench: [...starters, ...benchPlayers].filter((p) => !draftPicks.startingXI.includes(p.id)),
        captainId: draftPicks.captainId,
      }
    : null;
  const activeChip = chip ?? null;
  const { captainMultiplier } = chipScoring(activeChip);

  const card = (p: NormalizedPlayer, zone: "pitch" | "bench") => (
    <PlayerCard
      key={p.id}
      player={p}
      zone={zone}
      view={view}
      captainMultiplier={captainMultiplier}
      pointsSource={pointsSource}
      priceView={priceView}
      fixturesView={fixturesView}
      odds={fixtureOddsByTeamId.get(p.teamId)}
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

  // <squad_summary>: one card above the pitch's own (the squad's name is
  // the page's section heading, its picker under it): the squad's figures
  // along the top; under a rule, what the kits highlight and the points
  // source, then the buttons with the gameweek at the far end.
  return (
    <div className={`squad-pitch${hasSquad ? "" : " is-disabled"}`} ref={rootRef} aria-disabled={!hasSquad || undefined}>
      <div className="card squad-summary">
        <SummaryFigures
          starters={starters}
          bench={benchPlayers}
          captainId={captainId}
          expectationByPlayerId={expectationByPlayerId}
          source={pointsSource}
          onSourceChange={setPointsSource}
          gameweek={gameweek}
          bestPicks={bestPicks}
          validation={squadValidation}
          budgetHint={budgetHint}
          marketValue={squadMarketValue([...starters, ...benchPlayers])}
          chip={activeChip}
          planning={planning}
          onViewProfile={onViewProfile}
        />
        <div className="squad-summary-controls">
          <div className="squad-summary-highlight">
            <SegmentedControl label="Highlight" hideLabel options={KIT_VIEW_OPTIONS} value={view} onChange={setView} />
            {/* Each highlight's own toggle, beside it only (<kit_view>); Exp. Pts' source is in Projected Points' box. */}
            {view === "fixtures" && <SegmentedControl label="Fixtures" hideLabel options={FIXTURES_VIEW_OPTIONS} value={fixturesView} onChange={setFixturesView} />}
            {view === "price" && <SegmentedControl label="Price" hideLabel options={PRICE_VIEW_OPTIONS} value={priceView} onChange={setPriceView} />}
          </div>
          <div className="squad-summary-end">
            {/* The squad's actions as icons, as every other section's are (the owner's call, 2026-11-02). */}
            <div className="icon-toolbar pitch-view-actions">
              <IconChipButton
                icon={<ArmbandIcon letter="C" />}
                label="Captain"
                title="Captain: click, then click a starting player to give him the armband"
                pressed={captainPickMode === "captain"}
                onClick={() => onCaptainTileClick("captain")}
              />
              <IconChipButton
                icon={<ArmbandIcon letter="V" />}
                label="Vice-Captain"
                title="Vice-Captain: click, then click a starting player to make him vice-captain"
                pressed={captainPickMode === "viceCaptain"}
                onClick={() => onCaptainTileClick("viceCaptain")}
              />
              <IconChipButton icon={<ClearDraftIcon />} label="Clear Draft" title={`Clear Draft: remove every player from ${squadName || "this squad"}`} onClick={onClearSquad} />
              {onResetDraft && (
                <IconChipButton
                  icon={<ResetIcon />}
                  label="Reset Draft"
                  title={resetBlocker ?? `Reset Draft: put ${squadName || "this squad"} back as it was after the last deadline, undoing every transfer and change since`}
                  onClick={onResetDraft}
                  disabled={!!resetBlocker}
                />
              )}
              <IconChipButton
                icon={<BestDraftIcon />}
                label="Best Draft"
                title={
                  draftBlocker ??
                  `Best Draft: pick the starting XI, captain and vice-captain with the most Exp. Pts (${SOURCE_NAME[pointsSource]}) in GW${gameweek}, in a formation FPL allows`
                }
                onClick={handleBestDraft}
                disabled={draftBlocker !== null}
              />
              {onOpenSummary && (
                <IconChipButton
                  icon={<GameweekSummaryIcon />}
                  label="Gameweek Summary"
                  title={summaryBlocker ?? "Gameweek Summary: each gameweek this squad has played against every FPL manager, and the Gameweek Log of them all"}
                  onClick={onOpenSummary}
                  disabled={!!summaryBlocker}
                />
              )}
            </div>
            <GameweekArrows
              gameweeks={gameweeks}
              value={gameweek}
              onChange={onGameweekChange}
              describe={(eventId) => `Exp. Pts, Exp. Mins, Projected Points and Best Draft are for GW${eventId}`}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {squadValidation.clubViolations.length > 0 && (
          <div className="banner error">
            Over {SQUAD_RULES.maxPerClub} from one club: {squadValidation.clubViolations.map((v) => `${v.teamName} ${v.count}/${SQUAD_RULES.maxPerClub}`).join(", ")}
          </div>
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
    </div>
  );
}
