import React from "react";

/**
 * Understat's own User Guide section (shown by pages/UserGuide.tsx through
 * extensions/externalStats.ts, so it goes when Understat goes). Plain
 * language; every metric the Understat columns show is defined here.
 */

const PLAYER_METRICS: [string, string][] = [
  ["xG, xA, xGI (Understat)", "Understat's own expected goals and assists model — a different model from FPL's, so the numbers differ. xGI = xG + xA."],
  ["Assists, Mins (Understat)", "Understat's count. FPL awards assists more widely (about 2% of player-matches differ), and FPL counts stoppage time in minutes."],
  ["Goals − xG, Assists − xA (Understat)", "Understat's goals and assists minus Understat's xG and xA: finishing (or team-mates finishing his chances) above (+) or below (−) the chances' quality."],
  ["Shots, Shots/Game", "Every attempt, blocked ones included."],
  ["On Target, On Target %", "Shots scored or saved (a shot off the post isn't on target), and their share of all shots."],
  ["xG/Shot", "Average chance quality: xG ÷ shots."],
  ["Conversion %", "Goals from shots as a share of shots (own goals aren't anyone's shots)."],
  ["NP Goals, NPxG, NPxG/Game", "Goals and xG without penalties."],
  ["NPxG/Shot, NP Goals − NPxG", "Chance quality and finishing with penalties left out, so a penalty taker isn't flattered."],
  ["Woodwork, Blocked Shots, Blocked %", "Shots that hit the post or bar, and shots blocked before reaching goal (and their share of all shots)."],
  ["Headed Shots, Headed Goals, Headed xG", "Attempts with the head, the goals from them, and their xG."],
  ["Open-Play / Set-Piece Shots, Goals and xG", "Split by how the chance came about. Set pieces are corners, free kicks taken directly, and other set-piece moves; penalties are separate."],
  ["Corner xG, Free-Kick xG, Penalty xG, Penalties Taken, Penalty Goals", "xG from chances after a corner, direct free kicks, and penalties; penalties taken and scored."],
  ["Set-Piece xG %", "Set-piece xG as a share of non-penalty xG."],
  ["Assisted Shots %", "Shots where Understat names a team-mate as setting it up; the rest he made himself (a dribble, a rebound, a loose ball, a direct free kick)."],
  ["Shots from Crosses, Through-Ball Shots, Shots after Dribbles, Rebound Shots (and their xG)", "Shots split by the action just before them."],
  ["Key Passes, Key Passes/Game, xA/Key Pass", "Passes that led straight to a shot, and the average xA of those chances."],
  ["NPxGI, NPxGI/Game", "NPxG + xA: goal involvement without penalties."],
  ["xGChain, xGChain/Game", "The xG of every attack the player was involved in at any point, the shot and the key pass included."],
  ["xGBuildup, xGBuildup/Game", "The same without the shot and the key pass, so it credits players who start attacks."],
  ["Apps", "Matches he played in (Understat)."],
];

const CLUB_METRICS: [string, string][] = [
  ["xG, xGC, NPxG, NPxGA, NPxGD", "Understat's club figures, which count a shot and its rebound as one chance — so they can be lower than the club's players' xG added up."],
  ["xA, xGI, Assists (Understat)", "The club's players' Understat xA and assists added up; xGI = club xG + xA."],
  ["Shots, Shots on Target (and Against)", "Every attempt for and against the club."],
  ["xG/Shot, xGA/Shot", "Average chance quality created and allowed, from the individual shots."],
  ["Conversion %", "The club's goals from shots as a share of its shots (own goals left out)."],
  ["Open-Play / Set-Piece / Penalty xG (and xGA)", "The club's shots for and against, split by how the chance came about."],
  ["Open-Play / Set-Piece Goals (and Against)", "Goals for and against by how the chance came about, own goals left out."],
  ["Woodwork, Shots Blocked (and Woodwork Against, Blocks Made)", "The club's shots off the woodwork or blocked, and the same for its opponents' shots."],
  ["Shots from Crosses, Through-Ball Shots, Cross Shots Against", "The club's shots by the action just before them, and opponents' shots from crosses."],
  ["Penalties Taken, Penalties Conceded", "Penalties the club took, and penalties taken against it."],
  ["xGD", "Club xG minus xGC, penalties included (NPxGD leaves them out)."],
  ["Key Passes", "The club's players' key passes added up."],
  ["Deep Completions, Deep Allowed", "Passes completed close to the opponent's goal (within about 20 yards, crosses excluded), for and against."],
  ["PPDA", "Opponent passes allowed per defensive action in their half: lower means the club presses harder."],
  ["Opp. PPDA", "The same measured on opponents: lower means the club gets pressed harder."],
  ["xPts, Pts − xPts", "Points the club would expect from its chances (Understat simulates every shot), and how far actual points are above (+) or below (−)."],
];

function MetricList({ rows }: { rows: [string, string][] }) {
  return (
    <div className="table-wrap" style={{ marginBottom: 12 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Metric</th>
            <th style={{ textAlign: "left" }}>What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, meaning]) => (
            <tr key={name} style={{ cursor: "default" }}>
              <td style={{ textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{name}</td>
              <td style={{ textAlign: "left", fontSize: 12.5, color: "var(--text-secondary)" }}>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UnderstatGuide() {
  const list = { margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 } as const;
  return (
    <>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        <strong>Understat</strong> (understat.com) is an independent football-data site with its own xG model and shot-by-shot
        data. Player Explorer and Team Explorer add its figures as a clearly separate second source; everything else in the app is
        FPL. It's updated once a day.
      </p>
      <ul style={list}>
        <li>
          <strong>Its colour is <span style={{ color: "var(--col-understat)" }}>violet</span>.</strong> Every Understat column header
          is violet. FPL headers are green (they follow the Data View) or muted red (always today's live figure). Columns uses the
          same colours: green FPL groups, violet "Understat ·" groups, and one{" "}
          <span style={{ color: "var(--col-crossover)" }}>rose "FPL &amp; Understat"</span> group for the figures both sources have.
        </li>
        <li>
          <strong>The <span style={{ color: "var(--col-crossover)" }}>⇄</span> icon on a header</strong> switches that whole column
          between FPL's figure and Understat's: on xG, xA, xGI (and their per-game and per-£m versions), Assists, Minutes, Goals − xG
          and Assists − xA, where the two sources disagree. It starts on FPL; the header text is green while it shows FPL and violet
          while it shows Understat. Goals − xG and Assists − xA always compare a source with itself. Goals, own goals, scores and results almost always agree in the two
          sources, so they're FPL only. Understat's own Goals − xG and NP Goals use Understat's goal count, which can differ
          now and then: a goal one source gives a player, the other may record as an own goal.
        </li>
        <li>
          <strong>The Data Views work the same way:</strong> Current Season, Last Completed Season, or a Historic Average of the
          last four completed seasons (the same seasons as the player's FPL figures, Premier League only). Per-game figures use
          Understat's own minutes.
        </li>
        <li>
          <strong>Players are matched automatically</strong> by the matches they played in and their names. One the app isn't
          sure of yet (a new arrival Understat names very differently) shows "—" until it is, never another player's figures.
        </li>
        <li>
          <strong>Club figures are what the club did</strong>, whoever played, as everywhere else.
        </li>
        <li>
          <strong>A small amber dot</strong> on an Understat header means its figures are out of date (hover it for why). FPL figures
          are never affected.
        </li>
        <li>
          Not available yet: shot zones, shot maps and match xG timelines. Not available from Understat at all: pass maps, average
          positions and sprint data. Seasons outside the Premier League aren't covered, so a promoted player's previous season shows "—".
        </li>
      </ul>
      <h3 className="guide-subheading">Player metrics</h3>
      <MetricList rows={PLAYER_METRICS} />
      <h3 className="guide-subheading">Club metrics</h3>
      <MetricList rows={CLUB_METRICS} />
    </>
  );
}
