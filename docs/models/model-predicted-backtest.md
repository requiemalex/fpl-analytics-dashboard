# Model Predicted — backtest

Written by `client/scripts/pointsModel/backtest.ts` — don't edit by hand; re-run it after refitting (`fit.ts`). How the model works and what each setting means: README "Team Building — Model Predicted".

Every prediction is made as of before its gameweek, from what the app would have known then, and scored against the points actually scored. Neither model is told about injuries here (past availability isn't on record). RMSE and MAE: the typical miss in points (RMSE weighs big misses more). MAE favours a figure pulled toward 0: about half of all players in a gameweek score exactly 0, so an under-predicting model (the replaced one's bias is negative) gets the smaller average absolute miss without being a better expected-points figure; RMSE and bias judge an expectation fairly. Bias: the average miss (+ over-predicts). Correlation: between predicted and actual points among players of the same position in the same gameweek, averaged (how well it orders them). Top 5 per position, Top 10 and Captain: the average actual points of the model's 5 highest predictions in each position, 10 highest overall, and single highest, each gameweek.

<rank_ties>: "Rank (ties)" is the same correlation by rank. It's shown, but isn't the headline, because about half the players in a gameweek don't play and all score exactly 0: a predictor that also gives them all exactly the same figure (points per match so far gives every unused player 0) is rewarded for the tie, while one that tells a 3% starter from a 10% one is marked down for it, though no pick changes. The "Playing time and ordering" section below separates the two things it mixes.

## 2025/26, GW1–38 (every setting unseen except defensive contribution's (fitted on GW1–19))

29621 player-matches (of 29747: the replaced model has no figure for the rest — no minutes on record).

| Model | RMSE | MAE | Bias | Correlation | Top 5 per position | Top 10 | Captain | Rank (ties) |
|---|---|---|---|---|---|---|---|---|
| New model (FPL data) | 1.934 | 1.044 | +0.030 | 0.595 | 4.26 | 4.84 | 5.24 | 0.694 |
| New model + Understat penalties | 1.934 | 1.044 | +0.028 | 0.595 | 4.30 | 4.73 | 5.16 | 0.694 |
| Replaced model | 2.017 | 0.994 | -0.187 | 0.542 | 4.25 | 4.63 | 6.08 | 0.687 |
| Points per match so far | 2.059 | 1.062 | +0.035 | 0.537 | 3.93 | 4.29 | 5.74 | 0.705 |
| New model, every fixture average | 1.944 | 1.051 | +0.029 | 0.590 | 4.01 | 4.51 | 5.13 | 0.693 |

The new model on every row of the set (29747, including players with no minutes on record): RMSE 1.939, bias 0.029, correlation 0.594.

By position (correlation; RMSE; average actual points of the top 5 picks):

| Position | New model (FPL data) | New model + Understat penalties | Replaced model | Points per match so far |
|---|---|---|---|---|
| GKP | 0.695; 1.39; 3.82 | 0.695; 1.39; 3.82 | 0.632; 1.48; 3.68 | 0.624; 1.53; 3.34 |
| DEF | 0.539; 2.10; 4.35 | 0.539; 2.10; 4.35 | 0.483; 2.20; 4.49 | 0.467; 2.26; 3.68 |
| MID | 0.569; 1.89; 4.59 | 0.569; 1.89; 4.59 | 0.529; 1.96; 4.54 | 0.523; 1.99; 4.35 |
| FWD | 0.578; 2.08; 4.27 | 0.576; 2.08; 4.45 | 0.523; 2.18; 4.28 | 0.533; 2.20; 4.33 |

## 2025/26, GW20–38 (fully unseen)

15572 player-matches (of 15572: the replaced model has no figure for the rest — no minutes on record).

| Model | RMSE | MAE | Bias | Correlation | Top 5 per position | Top 10 | Captain | Rank (ties) |
|---|---|---|---|---|---|---|---|---|
| New model (FPL data) | 1.858 | 1.000 | +0.053 | 0.596 | 4.17 | 4.93 | 4.37 | 0.694 |
| New model + Understat penalties | 1.858 | 0.999 | +0.051 | 0.596 | 4.23 | 4.80 | 4.63 | 0.694 |
| Replaced model | 1.947 | 0.958 | -0.155 | 0.537 | 4.43 | 4.84 | 4.47 | 0.686 |
| Points per match so far | 1.955 | 1.024 | +0.048 | 0.537 | 3.98 | 4.51 | 4.42 | 0.691 |
| New model, every fixture average | 1.868 | 1.006 | +0.051 | 0.590 | 3.88 | 4.43 | 4.58 | 0.693 |

The new model on every row of the set (15572, including players with no minutes on record): RMSE 1.858, bias 0.053, correlation 0.596.

By position (correlation; RMSE; average actual points of the top 5 picks):

| Position | New model (FPL data) | New model + Understat penalties | Replaced model | Points per match so far |
|---|---|---|---|---|
| GKP | 0.680; 1.39; 3.74 | 0.680; 1.39; 3.74 | 0.613; 1.49; 3.79 | 0.606; 1.50; 2.96 |
| DEF | 0.551; 1.99; 4.03 | 0.551; 1.99; 4.03 | 0.486; 2.09; 4.55 | 0.474; 2.11; 3.85 |
| MID | 0.589; 1.80; 4.74 | 0.589; 1.80; 4.85 | 0.544; 1.87; 5.28 | 0.542; 1.87; 4.74 |
| FWD | 0.563; 2.13; 4.17 | 0.563; 2.13; 4.28 | 0.507; 2.24; 4.09 | 0.525; 2.20; 4.37 |

## 2026/27 so far (fully unseen, the live season)

4445 player-matches (of 4551: the replaced model has no figure for the rest — no minutes on record).

| Model | RMSE | MAE | Bias | Correlation | Top 5 per position | Top 10 | Captain | Rank (ties) |
|---|---|---|---|---|---|---|---|---|
| New model (FPL data) | 2.152 | 1.254 | -0.021 | 0.567 | 4.72 | 5.61 | 8.86 | 0.642 |
| New model + Understat penalties | 2.153 | 1.254 | -0.024 | 0.566 | 4.62 | 5.46 | 8.86 | 0.642 |
| Replaced model | 2.287 | 1.229 | -0.311 | 0.506 | 3.79 | 3.67 | 4.14 | 0.605 |
| Points per match so far | 2.441 | 1.323 | +0.032 | 0.496 | 4.05 | 3.89 | 3.00 | 0.662 |
| New model, every fixture average | 2.166 | 1.258 | -0.032 | 0.560 | 4.54 | 5.01 | 8.29 | 0.644 |

The new model on every row of the set (4551, including players with no minutes on record): RMSE 2.172, bias -0.029, correlation 0.561.

By position (correlation; RMSE; average actual points of the top 5 picks):

| Position | New model (FPL data) | New model + Understat penalties | Replaced model | Points per match so far |
|---|---|---|---|---|
| GKP | 0.699; 1.57; 4.14 | 0.699; 1.57; 4.14 | 0.644; 1.67; 3.97 | 0.625; 1.77; 4.09 |
| DEF | 0.499; 2.33; 4.60 | 0.499; 2.33; 4.60 | 0.397; 2.51; 3.71 | 0.418; 2.66; 4.43 |
| MID | 0.530; 2.15; 5.23 | 0.529; 2.15; 4.77 | 0.464; 2.27; 2.83 | 0.450; 2.44; 3.17 |
| FWD | 0.539; 2.13; 4.91 | 0.537; 2.13; 4.97 | 0.519; 2.21; 4.63 | 0.492; 2.32; 4.51 |

## Playing time and ordering (2025/26 and 2026/27)

Who starts: how well each model's figure separates the players who started from those who didn't (AUC: 0.5 is a coin toss, 1 perfect). Among the players who did start: the correlation of each model's figure with the points they scored.

| Position | New model (FPL data) (AUC; starters) | New model + Understat penalties (AUC; starters) | Replaced model (AUC; starters) | Points per match so far (AUC; starters) |
|---|---|---|---|---|
| GKP | 0.979; 0.110 | 0.979; 0.110 | 0.961; 0.098 | 0.964; 0.065 |
| DEF | 0.923; 0.152 | 0.923; 0.152 | 0.895; 0.113 | 0.889; 0.091 |
| MID | 0.928; 0.158 | 0.928; 0.156 | 0.897; 0.168 | 0.901; 0.115 |
| FWD | 0.939; 0.186 | 0.939; 0.182 | 0.894; 0.195 | 0.907; 0.152 |

## Calibration (new model, 2025/26 and 2026/27)

Players grouped by predicted points: the average prediction against the average actual.

| Tenth | Predicted | Actual | Player-matches |
|---|---|---|---|
| 1 | 0.09 | 0.03 | 3429 |
| 2 | 0.18 | 0.02 | 3430 |
| 3 | 0.21 | 0.03 | 3430 |
| 4 | 0.27 | 0.09 | 3430 |
| 5 | 0.42 | 0.38 | 3430 |
| 6 | 0.77 | 0.87 | 3429 |
| 7 | 1.23 | 1.39 | 3430 |
| 8 | 2.12 | 2.23 | 3430 |
| 9 | 2.96 | 2.97 | 3430 |
| 10 | 3.86 | 3.87 | 3430 |

Each part: average predicted against average actually paid, per player-match.

| Position | Part | Predicted | Actual |
|---|---|---|---|
| GKP | appearance | 0.479 | 0.460 |
| GKP | goals | 0.000 | 0.000 |
| GKP | assists | 0.003 | 0.005 |
| GKP | cleanSheet | 0.242 | 0.235 |
| GKP | goalsConceded | -0.115 | -0.106 |
| GKP | saves | 0.182 | 0.150 |
| GKP | bonus | 0.060 | 0.050 |
| GKP | cards | -0.022 | -0.019 |
| DEF | appearance | 0.750 | 0.738 |
| DEF | goals | 0.094 | 0.090 |
| DEF | assists | 0.070 | 0.075 |
| DEF | cleanSheet | 0.343 | 0.350 |
| DEF | goalsConceded | -0.159 | -0.148 |
| DEF | defensiveContribution | 0.176 | 0.174 |
| DEF | bonus | 0.067 | 0.071 |
| DEF | cards | -0.074 | -0.073 |
| MID | appearance | 0.703 | 0.668 |
| MID | goals | 0.229 | 0.210 |
| MID | assists | 0.141 | 0.138 |
| MID | cleanSheet | 0.075 | 0.078 |
| MID | defensiveContribution | 0.081 | 0.087 |
| MID | bonus | 0.081 | 0.085 |
| MID | cards | -0.063 | -0.056 |
| FWD | appearance | 0.667 | 0.675 |
| FWD | goals | 0.417 | 0.407 |
| FWD | assists | 0.110 | 0.108 |
| FWD | defensiveContribution | 0.003 | 0.005 |
| FWD | bonus | 0.147 | 0.147 |
| FWD | cards | -0.043 | -0.045 |

Chance of starting, grouped: predicted against how often they started.

| Predicted | Average predicted | Started | Player-matches |
|---|---|---|---|
| 0.0%–10.0% | 4.9% | 3.4% | 18949 |
| 10.0%–30.0% | 19.2% | 21.0% | 4036 |
| 30.0%–50.0% | 38.8% | 43.7% | 2103 |
| 50.0%–70.0% | 60.5% | 64.6% | 1599 |
| 70.0%–90.0% | 83.0% | 80.7% | 3655 |
| 90.0%–100.0% | 93.4% | 88.8% | 3956 |
