// Written by client/scripts/pointsModel/fit.ts (npx tsx client/scripts/pointsModel/fit.ts) — don't edit by hand.
// Fitted on 2022/23, 2023/24, 2024/25 (defensive contribution: 2025/26 GW1–19); README "Team Building — Model Predicted".
import type { ModelParams } from "./pointsModel";

export const MODEL_PARAMS: ModelParams = {
  "byPosition": {
    "GKP": {
      "start": {
        "intercept": -8.403,
        "price": 1.128,
        "lastStarted": 2.873,
        "recentShare": 2.383,
        "seasonShare": 0.9864,
        "noMatches": 2.524,
        "lastSeasonShare": 0.2682,
        "noLastSeason": -0.1933
      },
      "sixtyGivenStart": 0.9912,
      "minutesLongStart": 89.94,
      "minutesShortStart": 40.55,
      "subRate": 0.005885,
      "minutesSub": 36.73,
      "goalPrior": {
        "base": -9.723e-7,
        "perPrice": 9.527e-8
      },
      "assistPrior": {
        "base": 0.002383,
        "perPrice": 0.0004744
      },
      "bonusPrior": {
        "base": 0.2766,
        "perPrice": -0.002321
      },
      "savesPrior": 3.347,
      "dcPrior": 5,
      "yellowPrior": 0.07539,
      "redPer90": 0.0008773,
      "ownGoalPer90": 0.006579,
      "penaltySavePer90": 0.01711,
      "bonusWin": 0.000002814,
      "dcDispersion": 1
    },
    "DEF": {
      "start": {
        "intercept": -4.283,
        "price": 0.2945,
        "lastStarted": 1.606,
        "recentShare": 2.04,
        "seasonShare": 1.44,
        "noMatches": 2.065,
        "lastSeasonShare": 0.5536,
        "noLastSeason": 0.1343
      },
      "sixtyGivenStart": 0.9536,
      "minutesLongStart": 87.64,
      "minutesShortStart": 44.06,
      "subRate": 0.1136,
      "minutesSub": 19.13,
      "goalPrior": {
        "base": 0.03366,
        "perPrice": 0.0003952
      },
      "assistPrior": {
        "base": 0.06936,
        "perPrice": 0.0007842
      },
      "bonusPrior": {
        "base": 0.1681,
        "perPrice": 0.0009039
      },
      "savesPrior": 0,
      "dcPrior": 7.824,
      "yellowPrior": 0.1829,
      "redPer90": 0.006677,
      "ownGoalPer90": 0.009693,
      "penaltySavePer90": 0,
      "bonusWin": 2.995,
      "dcDispersion": 1.343
    },
    "MID": {
      "start": {
        "intercept": -3.776,
        "price": 0.158,
        "lastStarted": 1.11,
        "recentShare": 2.402,
        "seasonShare": 1.637,
        "noMatches": 1.935,
        "lastSeasonShare": 0.3813,
        "noLastSeason": 0.0425
      },
      "sixtyGivenStart": 0.9202,
      "minutesLongStart": 83.23,
      "minutesShortStart": 48.35,
      "subRate": 0.2146,
      "minutesSub": 18.9,
      "goalPrior": {
        "base": 0.1223,
        "perPrice": 0.004094
      },
      "assistPrior": {
        "base": 0.149,
        "perPrice": 0.004729
      },
      "bonusPrior": {
        "base": 0.1961,
        "perPrice": 0.008053
      },
      "savesPrior": 0,
      "dcPrior": 8.54,
      "yellowPrior": 0.2013,
      "redPer90": 0.005791,
      "ownGoalPer90": 0.002114,
      "penaltySavePer90": 0,
      "bonusWin": 2.093,
      "dcDispersion": 1.252
    },
    "FWD": {
      "start": {
        "intercept": -4.226,
        "price": 0.1638,
        "lastStarted": 1.681,
        "recentShare": 1.461,
        "seasonShare": 1.968,
        "noMatches": 1.66,
        "lastSeasonShare": 0.6417,
        "noLastSeason": 0.3247
      },
      "sixtyGivenStart": 0.9245,
      "minutesLongStart": 81.87,
      "minutesShortStart": 48.61,
      "subRate": 0.23,
      "minutesSub": 17.75,
      "goalPrior": {
        "base": 0.3401,
        "perPrice": 0.006677
      },
      "assistPrior": {
        "base": 0.1619,
        "perPrice": 0.00465
      },
      "bonusPrior": {
        "base": 0.4824,
        "perPrice": 0.006352
      },
      "savesPrior": 0,
      "dcPrior": 4.543,
      "yellowPrior": 0.1652,
      "redPer90": 0.005173,
      "ownGoalPer90": 0.0007958,
      "penaltySavePer90": 0,
      "bonusWin": 1.987,
      "dcDispersion": 1.204
    }
  },
  "goalXgWeight": 0.6527,
  "assistXaWeight": 0.486,
  "seasonDecay": 0.4924,
  "goalShrink": 10,
  "assistShrink": 9.577,
  "bonusShrink": 25.48,
  "savesShrink": 12.44,
  "dcShrink": 3.232,
  "yellowShrink": 20.09,
  "subShrink": 2.163,
  "startMinutesShrink": 4.026,
  "attackExponent": 0.8452,
  "savesExponent": 0.6582,
  "concedeScale": 1.009,
  "penalty": {
    "perClubMatch": 0.1253,
    "conversion": 0.829,
    "xG": 0.79
  }
};
