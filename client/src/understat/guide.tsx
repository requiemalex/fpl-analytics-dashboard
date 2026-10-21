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
        data. Player Explorer, Team Explorer, the player and team profiles, the Dashboard and Player Comparison add its figures as a
        clearly separate second source; everything else in the app is FPL. It's updated once a day.
      </p>
      <ul style={list}>
        <li>
          <strong>Its colour is <span style={{ color: "var(--col-understat)" }}>violet</span>.</strong> Every Understat column header
          is violet. FPL headers are green (they follow the Data View) or muted red (always today's live figure). Columns uses the
          same colours: green "FPL ·" groups, violet "Understat ·" groups, and one{" "}
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
          <strong>In the profiles</strong>, an <span style={{ color: "var(--col-understat)" }}>Understat · Views</span> section follows
          the profile's Data View. A <strong>Shot Map</strong> splits the last 35 metres into zones (the six-yard box, the middle
          and sides of the penalty area, wide of it, the edge of the box and further out): each zone shows its share of the shots,
          how many shots that was (a season, in Historic Average) and their average xG, and is shaded darker the more shots came
          from there. Hover a zone for its goals too; shots from further out get a band of their own along the bottom. Midfielders
          and forwards get <strong>Shot Map · Taken</strong>. Defenders also get <strong>Shot Map · Faced</strong>, the shots their
          club faced while they were on the pitch (worked out from their minutes, so a shot around a substitution can be a minute
          out). Goalkeepers get Faced only, and a club gets both. Beside or under each map: shots, on target and On Target %,
          goals and Conversion % (goals per shot), xG, non-penalty xG, xG per shot, Penalties Taken and Penalty Goals (on a Faced
          map, Penalties Conceded and the Penalty Goals scored against). The Match Log gains violet columns: a player's <strong>Position</strong> in
          each match (hover it for the full name; Sub means off the bench) and a club's <strong>Win, Draw and Loss
          Chance</strong>: the result its chances deserved, worked out by Understat after the match from the shots both sides
          took. Their Average is coloured against every club that season: a higher win chance greener, a higher loss chance redder. The shot maps' figures are coloured too: a player's against his position, a club's against every club (fewer shots faced is better). More penalties taken and scored is better. A player's Shots Faced are coloured against his position, fewer better, per 90 minutes on the pitch so playing more isn't held against him. Its figures both sources have (a player's
          Minutes, Assists, xG, xA and xGI; a club's Assists, xG, xA, xGI and xGC) have the{" "}
          <span style={{ color: "var(--col-crossover)" }}>⇄</span> icon, switching that column, Totals included, to
          Understat's.
        </li>
        <li>
          <strong>On a team profile</strong>, an <span style={{ color: "var(--col-understat)" }}>Understat · Formations</span> section
          shows this season's formations, whatever the Data View: those used for at least 90 minutes (the grey stopwatch), the
          three most-used at most, with arrows to step between them. Each is drawn on a pitch with who started in each position and
          how many starts they've had. Click a name to open that player's profile. A greyed-out name is a player who isn't in FPL
          any more. Beside the pitch: the share of the club's minutes in that formation, its minutes and starts, xG and xG against
          per 90 minutes, and goals scored and conceded in it, coloured against every club's per-90 figures for the season (more xG and goals greener, less xG against and fewer conceded greener).
        </li>
        <li>
          <strong>On the Dashboard and in Player Comparison</strong> it works as in the Explorers. When you build a tile, graph or
          card, the pickers have the same groups as Columns: FPL, the rose "FPL &amp; Understat" figures, then Understat's own.
          A figure both sources have gets the <span style={{ color: "var(--col-crossover)" }}>⇄</span> icon: in a tile's header, beside
          an Outputs row's name, or in the header of a graph, radar or trend graph (where it switches all of that chart's shared
          figures together). It starts on FPL each visit. A tile, graph or card showing any Understat figure has the{" "}
          <span style={{ color: "var(--col-understat)" }}>violet</span> Understat icon in its header (hover it to see which figures);
          a graph's axis says "(Understat)", and Understat's names are violet on Outputs rows and radars. Colours, Min Minutes, Hide
          and the stopwatch work as for FPL figures, on FPL's minutes. A player Understat has no figure for isn't listed, never
          shown as 0. Trend graphs can plot Understat's figures season by season too; a season it has nothing for is a gap.
        </li>
        <li>
          <strong>A small amber dot</strong> on an Understat header or icon means its figures are out of date (hover it for why). FPL
          figures are never affected.
        </li>
        <li>
          Not available yet: match xG timelines. Not available from Understat at all: pass maps, average positions, sprint data,
          figures for each formation in each match (only season totals), and forecasts for matches not yet played (its result
          chances are worked out afterwards). Seasons outside the Premier League aren't covered, so a promoted player's previous season shows "—".
        </li>
      </ul>
      <h3 className="guide-subheading">Player metrics</h3>
      <MetricList rows={PLAYER_METRICS} />
      <h3 className="guide-subheading">Club metrics</h3>
      <MetricList rows={CLUB_METRICS} />
    </>
  );
}
