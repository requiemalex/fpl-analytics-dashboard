import type { NormalizedPlayer } from "../types/normalized";
import {
  pointsPerMillion,
  xGPerMillion,
  xAPerMillion,
  xGIPerMillion,
  perEstimatedGame,
  minutesPerPoint,
  minutesPerGoal,
  minutesPerAssist,
  goalsMinusXG,
  assistsMinusXA,
  goalInvolvementsMinusXGI,
} from "./calculations";

export interface PlayerDerivedMetrics {
  pointsPerMillion: number | null;
  xGPerMillion: number | null;
  xAPerMillion: number | null;
  xGIPerMillion: number | null;
  /** Points-per-game already exists on NormalizedPlayer itself (player.pointsPerGame — points per estimated game in every mode, set by resolvePlayerStats); no separate derived copy needed here now that this used to be pointsPer90. */
  goalsPerGame: number | null;
  assistsPerGame: number | null;
  minutesPerPoint: number | null;
  minutesPerGoal: number | null;
  minutesPerAssist: number | null;
  goalsMinusXG: number | null;
  assistsMinusXA: number | null;
  goalInvolvementsMinusXGI: number | null;
}

export function getPlayerDerivedMetrics(p: NormalizedPlayer): PlayerDerivedMetrics {
  return {
    pointsPerMillion: pointsPerMillion(p.totalPoints, p.price),
    xGPerMillion: xGPerMillion(p.xG, p.price),
    xAPerMillion: xAPerMillion(p.xA, p.price),
    xGIPerMillion: xGIPerMillion(p.xGI, p.price),
    goalsPerGame: perEstimatedGame(p.goals, p.estimatedGames),
    assistsPerGame: perEstimatedGame(p.assists, p.estimatedGames),
    minutesPerPoint: minutesPerPoint(p.minutes, p.totalPoints),
    minutesPerGoal: minutesPerGoal(p.minutes, p.goals),
    minutesPerAssist: minutesPerAssist(p.minutes, p.assists),
    goalsMinusXG: goalsMinusXG(p.goals, p.xG),
    assistsMinusXA: assistsMinusXA(p.assists, p.xA),
    goalInvolvementsMinusXGI: goalInvolvementsMinusXGI(p.goals, p.assists, p.xGI),
  };
}
