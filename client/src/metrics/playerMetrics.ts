import type { NormalizedPlayer } from "../types/normalized";
import {
  pointsPerMillion,
  xGPerMillion,
  xAPerMillion,
  xGIPerMillion,
  per90,
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
  pointsPer90: number | null;
  goalsPer90: number | null;
  assistsPer90: number | null;
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
    pointsPer90: per90(p.totalPoints, p.minutes),
    goalsPer90: per90(p.goals, p.minutes),
    assistsPer90: per90(p.assists, p.minutes),
    minutesPerPoint: minutesPerPoint(p.minutes, p.totalPoints),
    minutesPerGoal: minutesPerGoal(p.minutes, p.goals),
    minutesPerAssist: minutesPerAssist(p.minutes, p.assists),
    goalsMinusXG: goalsMinusXG(p.goals, p.xG),
    assistsMinusXA: assistsMinusXA(p.assists, p.xA),
    goalInvolvementsMinusXGI: goalInvolvementsMinusXGI(p.goals, p.assists, p.xGI),
  };
}
