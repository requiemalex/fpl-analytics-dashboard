// Written by client/scripts/pointsModel/fit.ts (npx tsx client/scripts/pointsModel/fit.ts) — don't edit by hand.
// Fitted on 2022/23, 2023/24, 2024/25 (defensive contribution: 2025/26 GW1–19); README "Team Building — Model Predicted".
import type { ModelParams } from "./pointsModel";

export const MODEL_PARAMS: ModelParams = {
  "byPosition": {
    "GKP": {
      "start": {
        "intercept": -8.875,
        "price": 1.179,
        "lastStarted": 1.237,
        "recentShare": 4.603,
        "seasonShare": 1.021,
        "noMatches": 2.685,
        "lastSeasonShare": 0.3809,
        "noLastSeason": -0.1045,
        "returnFirst": 2.108,
        "returnSecond": 1.38,
        "sellOff": 0.4429,
        "sellOffByRecent": 20.46
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
        "intercept": -4.753,
        "price": 0.3669,
        "lastStarted": 0.905,
        "recentShare": 3.272,
        "seasonShare": 1.666,
        "noMatches": 2.202,
        "lastSeasonShare": 0.5857,
        "noLastSeason": 0.1421,
        "returnFirst": 1.2,
        "returnSecond": 1.012,
        "sellOff": 1.444,
        "sellOffByRecent": 15.79
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
        "intercept": -4.184,
        "price": 0.2069,
        "lastStarted": 0.7594,
        "recentShare": 3.31,
        "seasonShare": 1.698,
        "noMatches": 2.086,
        "lastSeasonShare": 0.3738,
        "noLastSeason": 0.04248,
        "returnFirst": 1.076,
        "returnSecond": 1.27,
        "sellOff": -1.681,
        "sellOffByRecent": 12.85
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
        "intercept": -4.289,
        "price": 0.1562,
        "lastStarted": 1.208,
        "recentShare": 2.709,
        "seasonShare": 1.956,
        "noMatches": 1.789,
        "lastSeasonShare": 0.6776,
        "noLastSeason": 0.2955,
        "returnFirst": 1.157,
        "returnSecond": 1.708,
        "sellOff": 0.7405,
        "sellOffByRecent": 8.604
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
