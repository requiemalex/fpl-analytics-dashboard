import { useMemo } from "react";
import { horizonTotal, type Horizon, type PointsSource } from "../metrics/gameweekExpectations";
import { progressReading } from "../metrics/priceProgress";
import type { PlayerForecasts } from "../state/usePlayerForecasts";
import type { NormalizedPlayer } from "../types/normalized";
import { DASH } from "../utils/format";
import { HorizonPicker } from "./HorizonPicker";
import { headerMinWidth } from "./headerWidth";
import { horizonHint, minutesGameweekHint } from "./hoverText";
import type { LeadColumn } from "./PlayerExplorerTable";

/**
 * <predictive_columns>: the player tables' Predictive group, the same in
 * Player Explorer and Team Building's Add Players (the owner's call,
 * 2026-11-02: the same analysis in both): the two Exp. Pts, each added up
 * over its own horizon (<points_horizon>), Exp. Mins (always the next
 * gameweek: who starts in five weeks' time can't be known now, 2026-10-26),
 * and FPL's price-change Progress and Predicted Progress (<price_progress>).
 * The pitch's cards show the same figures for the gameweek its arrows pick
 * (<player_forecasts>). Drawn straight after Player; off by default in
 * Player Explorer, Exp. Pts and Exp. Mins on in Add Players.
 */

export const PREDICTIVE_KEYS = {
  fpl: "expFplOfficial",
  model: "expModelPredicted",
  minutes: "expectedMinutes",
  progress: "priceProgress",
  predicted: "pricePredictedProgress",
} as const;

/** The group's columns in the Columns picker's order. */
export const PREDICTIVE_COLUMN_KEYS: string[] = Object.values(PREDICTIVE_KEYS);
/** Those that need every player's Exp. Pts or Exp. Mins worked out (usePlayerForecasts' `expectations`). */
export const EXPECTATION_KEYS: ReadonlySet<string> = new Set([PREDICTIVE_KEYS.fpl, PREDICTIVE_KEYS.model, PREDICTIVE_KEYS.minutes]);
/** Add Players' starting Predictive columns (Player Explorer's start with none). */
export const ADD_PLAYERS_PREDICTIVE_COLUMNS: string[] = [PREDICTIVE_KEYS.fpl, PREDICTIVE_KEYS.model, PREDICTIVE_KEYS.minutes];

const LABELS: Record<string, string> = {
  [PREDICTIVE_KEYS.fpl]: "Exp. Pts (FPL Official)",
  [PREDICTIVE_KEYS.model]: "Exp. Pts (Model Predicted)",
  [PREDICTIVE_KEYS.minutes]: "Exp. Mins",
  [PREDICTIVE_KEYS.progress]: "Progress",
  [PREDICTIVE_KEYS.predicted]: "Predicted Progress",
};
/** Each column's floor: its header's longest word (<header_floor>). */
export const PREDICTIVE_MIN_WIDTHS: Record<string, number> = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [key, headerMinWidth(label)]));

export interface PredictiveHorizons {
  fpl: Horizon;
  model: Horizon;
}
export const DEFAULT_HORIZONS: PredictiveHorizons = { fpl: 1, model: 1 };

const POINTS_HINT: Record<PointsSource, string> = {
  fpl: "Expected points from FPL's own figures: his points a match this season, with goals and assists partly as xG and xA, and a little of his form (FPL's own expected points), adjusted for FPL's fixture difficulty and chance of playing. Hover a figure for its parts.",
  model: "Scoutline's own expected points: his chance of starting, his scoring rates and each match's forecast, through FPL's scoring rules. Hover a figure for its parts.",
};

export function usePredictiveColumns(
  players: readonly NormalizedPlayer[],
  forecasts: PlayerForecasts,
  horizons: PredictiveHorizons,
  setHorizon: (source: PointsSource, h: Horizon) => void,
): LeadColumn[] {
  const { expectationsByPlayerId } = forecasts;
  return useMemo(() => {
    const listFor = (id: number) => expectationsByPlayerId.get(id) ?? [];
    const points = (key: string, label: string, source: PointsSource): LeadColumn => {
      const horizon = horizons[source];
      const totals = new Map(players.map((p) => [p.id, horizonTotal(listFor(p.id), horizon, source)]));
      return {
        key,
        label,
        value: (id) => totals.get(id) ?? null,
        decimals: 1,
        hint: `${POINTS_HINT[source]} Added up over the gameweeks picked on the header (${horizon === 1 ? "the next one" : `the next ${horizon}`}).`,
        cellHint: (id) => horizonHint(listFor(id), horizon, source, totals.get(id) ?? null),
        trailing: <HorizonPicker value={horizon} onChange={(h) => setHorizon(source, h)} figure={label} />,
      };
    };
    const nextMinutes = new Map(players.map((p) => [p.id, listFor(p.id)[0]?.expectedMinutes ?? null]));
    const progress = (key: string, label: string, predicted: boolean): LeadColumn => {
      const readings = new Map(players.map((p) => [p.id, progressReading(p, predicted)]));
      return {
        key,
        label,
        value: (id) => readings.get(id)?.value ?? null,
        decimals: 1,
        render: (id) => readings.get(id)?.text ?? DASH,
        hint: predicted
          ? "Predicted Progress: where FPL expects his price-change progress to be at the next price update, + toward a rise, − toward a drop (100% is the threshold). Today's figure, whatever the Data View."
          : "Progress: FPL's own figure for how far he is toward his next price change, + toward a rise, − toward a drop (100% is the threshold). Today's figure, whatever the Data View.",
        cellHint: (id) => readings.get(id)?.title,
        // <price_progress>: coloured by the figure itself, as on the pitch; ranked for the hover only.
        tint: (id) => readings.get(id)?.tint,
        neutral: true,
      };
    };
    return [
      points(PREDICTIVE_KEYS.fpl, LABELS[PREDICTIVE_KEYS.fpl], "fpl"),
      points(PREDICTIVE_KEYS.model, LABELS[PREDICTIVE_KEYS.model], "model"),
      {
        key: PREDICTIVE_KEYS.minutes,
        label: LABELS[PREDICTIVE_KEYS.minutes],
        value: (id) => nextMinutes.get(id) ?? null,
        // <whole_numbers>: minutes run to dozens.
        decimals: 0,
        hint: "The minutes Scoutline's model expects him to play in the next gameweek (a double gameweek's two matches added up): his chance of starting, from his recent starts, last season's, a return from an absence, managers selling him and FPL's injury and suspension news, and how long he usually plays. Always the next gameweek: who starts later can't be known yet.",
        cellHint: (id) => minutesGameweekHint(listFor(id)[0] ?? null),
      },
      progress(PREDICTIVE_KEYS.progress, LABELS[PREDICTIVE_KEYS.progress], false),
      progress(PREDICTIVE_KEYS.predicted, LABELS[PREDICTIVE_KEYS.predicted], true),
    ];
  }, [players, expectationsByPlayerId, horizons, setHorizon]);
}
