# Model Predicted — backtest

Written by `client/scripts/pointsModel/backtest.ts` — don't edit by hand; re-run it after refitting (`fit.ts`). How the model works and what each setting means: README "Team Building — Model Predicted".

Every prediction is made as of before its gameweek, from what the app would have known then, and scored against the points actually scored. Neither model is told about injuries here (FPL's availability news is only on record from 2026/27 GW9); the new model does see managers' net selling of each player before the deadline, as it does in the app. RMSE and MAE: the typical miss in points (RMSE weighs big misses more). MAE favours a figure pulled toward 0: about half of all players in a gameweek score exactly 0, so an under-predicting model (the replaced one's bias is negative) gets the smaller average absolute miss without being a better expected-points figure; RMSE and bias judge an expectation fairly. Bias: the average miss (+ over-predicts). Correlation: between predicted and actual points among players of the same position in the same gameweek, averaged (how well it orders them). Top 5 per position, Top 10 and Captain: the average actual points of the model's 5 highest predictions in each position, 10 highest overall, and single highest, each gameweek.

<rank_ties>: "Rank (ties)" is the same correlation by rank. It's shown, but isn't the headline, because about half the players in a gameweek don't play and all score exactly 0: a predictor that also gives them all exactly the same figure (points per match so far gives every unused player 0) is rewarded for the tie, while one that tells a 3% starter from a 10% one is marked down for it, though no pick changes. The "Playing time and ordering" section below separates the two things it mixes.

## 2025/26, GW1–38 (every setting unseen except defensive contribution's (fitted on GW1–19))

29621 player-matches (of 29747: the replaced model has no figure for the rest — no minutes on record).

| Model | RMSE | MAE | Bias | Correlation | Top 5 per position | Top 10 | Captain | Rank (ties) |
|---|---|---|---|---|---|---|---|---|
| New model (FPL data) | 1.915 | 1.026 | +0.030 | 0.605 | 4.42 | 4.96 | 5.18 | 0.704 |
| New model + Understat penalties | 1.916 | 1.025 | +0.028 | 0.605 | 4.43 | 4.92 | 5.11 | 0.704 |
| Replaced model | 2.017 | 0.994 | -0.187 | 0.542 | 4.25 | 4.63 | 6.08 | 0.687 |
| Points per match so far | 2.059 | 1.062 | +0.035 | 0.537 | 3.93 | 4.29 | 5.74 | 0.705 |
| New model, every fixture average | 1.924 | 1.031 | +0.028 | 0.600 | 4.21 | 4.60 | 5.08 | 0.703 |

The new model on every row of the set (29747, including players with no minutes on record): RMSE 1.920, bias 0.029, correlation 0.604.

By position (correlation; RMSE; average actual points of the top 5 picks):

| Position | New model (FPL data) | New model + Understat penalties | Replaced model | Points per match so far |
|---|---|---|---|---|
| GKP | 0.699; 1.38; 3.71 | 0.699; 1.38; 3.71 | 0.632; 1.48; 3.68 | 0.624; 1.53; 3.34 |
| DEF | 0.553; 2.08; 4.67 | 0.553; 2.08; 4.67 | 0.483; 2.20; 4.49 | 0.467; 2.26; 3.68 |
| MID | 0.581; 1.87; 4.83 | 0.581; 1.87; 4.73 | 0.529; 1.96; 4.54 | 0.523; 1.99; 4.35 |
| FWD | 0.587; 2.06; 4.46 | 0.586; 2.06; 4.61 | 0.523; 2.18; 4.28 | 0.533; 2.20; 4.33 |

## 2025/26, GW20–38 (fully unseen)

15572 player-matches (of 15572: the replaced model has no figure for the rest — no minutes on record).

| Model | RMSE | MAE | Bias | Correlation | Top 5 per position | Top 10 | Captain | Rank (ties) |
|---|---|---|---|---|---|---|---|---|
| New model (FPL data) | 1.842 | 0.988 | +0.071 | 0.605 | 4.37 | 5.08 | 4.21 | 0.703 |
| New model + Understat penalties | 1.842 | 0.987 | +0.068 | 0.605 | 4.42 | 5.00 | 4.37 | 0.703 |
| Replaced model | 1.947 | 0.958 | -0.155 | 0.537 | 4.43 | 4.84 | 4.47 | 0.686 |
| Points per match so far | 1.955 | 1.024 | +0.048 | 0.537 | 3.98 | 4.51 | 4.42 | 0.691 |
| New model, every fixture average | 1.851 | 0.993 | +0.067 | 0.600 | 4.07 | 4.44 | 3.89 | 0.702 |

The new model on every row of the set (15572, including players with no minutes on record): RMSE 1.842, bias 0.071, correlation 0.605.

By position (correlation; RMSE; average actual points of the top 5 picks):

| Position | New model (FPL data) | New model + Understat penalties | Replaced model | Points per match so far |
|---|---|---|---|---|
| GKP | 0.682; 1.38; 3.61 | 0.682; 1.38; 3.61 | 0.613; 1.49; 3.79 | 0.606; 1.50; 2.96 |
| DEF | 0.563; 1.97; 4.48 | 0.563; 1.97; 4.48 | 0.486; 2.09; 4.55 | 0.474; 2.11; 3.85 |
| MID | 0.599; 1.78; 5.02 | 0.599; 1.78; 5.00 | 0.544; 1.87; 5.28 | 0.542; 1.87; 4.74 |
| FWD | 0.574; 2.10; 4.35 | 0.575; 2.10; 4.57 | 0.507; 2.24; 4.09 | 0.525; 2.20; 4.37 |

## 2026/27 so far (fully unseen, the live season)

4445 player-matches (of 4551: the replaced model has no figure for the rest — no minutes on record).

| Model | RMSE | MAE | Bias | Correlation | Top 5 per position | Top 10 | Captain | Rank (ties) |
|---|---|---|---|---|---|---|---|---|
| New model (FPL data) | 2.143 | 1.225 | -0.065 | 0.571 | 4.57 | 5.67 | 8.86 | 0.652 |
| New model + Understat penalties | 2.144 | 1.225 | -0.067 | 0.570 | 4.44 | 5.57 | 8.86 | 0.651 |
| Replaced model | 2.287 | 1.229 | -0.311 | 0.506 | 3.79 | 3.67 | 4.14 | 0.605 |
| Points per match so far | 2.441 | 1.323 | +0.032 | 0.496 | 4.05 | 3.89 | 3.00 | 0.662 |
| New model, every fixture average | 2.154 | 1.227 | -0.077 | 0.566 | 4.54 | 5.03 | 8.29 | 0.656 |

The new model on every row of the set (4551, including players with no minutes on record): RMSE 2.163, bias -0.072, correlation 0.566.

By position (correlation; RMSE; average actual points of the top 5 picks):

| Position | New model (FPL data) | New model + Understat penalties | Replaced model | Points per match so far |
|---|---|---|---|---|
| GKP | 0.698; 1.57; 4.26 | 0.698; 1.57; 4.26 | 0.644; 1.67; 3.97 | 0.625; 1.77; 4.09 |
| DEF | 0.506; 2.32; 4.23 | 0.506; 2.32; 4.23 | 0.397; 2.51; 3.71 | 0.418; 2.66; 4.43 |
| MID | 0.537; 2.14; 5.26 | 0.536; 2.14; 4.77 | 0.464; 2.27; 2.83 | 0.450; 2.44; 3.17 |
| FWD | 0.542; 2.12; 4.54 | 0.540; 2.12; 4.49 | 0.519; 2.21; 4.63 | 0.492; 2.32; 4.51 |

## Playing time and ordering (2025/26 and 2026/27)

Who starts: how well each model's figure separates the players who started from those who didn't (AUC: 0.5 is a coin toss, 1 perfect). Among the players who did start: the correlation of each model's figure with the points they scored.

| Position | New model (FPL data) (AUC; starters) | New model + Understat penalties (AUC; starters) | Replaced model (AUC; starters) | Points per match so far (AUC; starters) |
|---|---|---|---|---|
| GKP | 0.980; 0.119 | 0.980; 0.119 | 0.961; 0.098 | 0.964; 0.065 |
| DEF | 0.931; 0.154 | 0.931; 0.154 | 0.895; 0.113 | 0.889; 0.091 |
| MID | 0.934; 0.159 | 0.934; 0.157 | 0.897; 0.168 | 0.901; 0.115 |
| FWD | 0.943; 0.186 | 0.943; 0.182 | 0.894; 0.195 | 0.907; 0.152 |

## Calibration (new model, 2025/26 and 2026/27)

Players grouped by predicted points: the average prediction against the average actual.

| Tenth | Predicted | Actual | Player-matches |
|---|---|---|---|
| 1 | 0.07 | 0.03 | 3429 |
| 2 | 0.15 | 0.01 | 3430 |
| 3 | 0.18 | 0.03 | 3430 |
| 4 | 0.24 | 0.09 | 3430 |
| 5 | 0.41 | 0.35 | 3430 |
| 6 | 0.77 | 0.85 | 3429 |
| 7 | 1.23 | 1.38 | 3430 |
| 8 | 2.09 | 2.21 | 3430 |
| 9 | 2.97 | 2.97 | 3430 |
| 10 | 3.93 | 3.98 | 3430 |

Each part: average predicted against average actually paid, per player-match.

| Position | Part | Predicted | Actual |
|---|---|---|---|
| GKP | appearance | 0.477 | 0.460 |
| GKP | goals | 0.000 | 0.000 |
| GKP | assists | 0.003 | 0.005 |
| GKP | cleanSheet | 0.241 | 0.235 |
| GKP | goalsConceded | -0.115 | -0.106 |
| GKP | saves | 0.181 | 0.150 |
| GKP | bonus | 0.060 | 0.050 |
| GKP | cards | -0.022 | -0.019 |
| DEF | appearance | 0.744 | 0.738 |
| DEF | goals | 0.093 | 0.090 |
| DEF | assists | 0.070 | 0.075 |
| DEF | cleanSheet | 0.342 | 0.350 |
| DEF | goalsConceded | -0.157 | -0.148 |
| DEF | defensiveContribution | 0.175 | 0.174 |
| DEF | bonus | 0.067 | 0.071 |
| DEF | cards | -0.074 | -0.073 |
| MID | appearance | 0.699 | 0.668 |
| MID | goals | 0.227 | 0.210 |
| MID | assists | 0.140 | 0.138 |
| MID | cleanSheet | 0.075 | 0.078 |
| MID | defensiveContribution | 0.081 | 0.087 |
| MID | bonus | 0.081 | 0.085 |
| MID | cards | -0.063 | -0.056 |
| FWD | appearance | 0.670 | 0.675 |
| FWD | goals | 0.421 | 0.407 |
| FWD | assists | 0.111 | 0.108 |
| FWD | defensiveContribution | 0.003 | 0.005 |
| FWD | bonus | 0.148 | 0.147 |
| FWD | cards | -0.043 | -0.045 |

Chance of starting, grouped: predicted against how often they started.

| Predicted | Average predicted | Started | Player-matches |
|---|---|---|---|
| 0.0%–10.0% | 4.2% | 3.0% | 18665 |
| 10.0%–30.0% | 19.2% | 20.2% | 4397 |
| 30.0%–50.0% | 38.4% | 43.3% | 2085 |
| 50.0%–70.0% | 60.4% | 62.2% | 1586 |
| 70.0%–90.0% | 82.0% | 80.4% | 3141 |
| 90.0%–100.0% | 94.5% | 91.2% | 4424 |
