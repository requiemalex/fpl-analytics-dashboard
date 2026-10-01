import React from "react";
import { useAppState } from "../state/AppStateContext";
import { METRIC_LIST } from "../metrics/dictionary";

const FIELD_LABELS: Record<string, string> = {
  expected_goals: "xG (expected_goals)",
  expected_assists: "xA (expected_assists)",
  expected_goal_involvements: "xGI (expected_goal_involvements)",
  expected_goals_conceded: "xGC (expected_goals_conceded)",
  expected_goals_per_90: "xG/90 (expected_goals_per_90)",
  expected_assists_per_90: "xA/90 (expected_assists_per_90)",
  expected_goal_involvements_per_90: "xGI/90 (expected_goal_involvements_per_90)",
  expected_goals_conceded_per_90: "xGC/90 (expected_goals_conceded_per_90)",
  defensive_contribution: "Defensive Contributions (defensive_contribution)",
  defensive_contribution_per_90: "Defensive Contributions/90 (defensive_contribution_per_90)",
  starts: "Starts (starts)",
  starts_per_90: "Starts/90 (starts_per_90)",
  transfers_in: "Transfers In, total (transfers_in)",
  transfers_out: "Transfers Out, total (transfers_out)",
  transfers_in_event: "Transfers In, this event (transfers_in_event)",
  transfers_out_event: "Transfers Out, this event (transfers_out_event)",
  cost_change_event: "Price Change, this event (cost_change_event)",
  cost_change_start: "Price Change, season (cost_change_start)",
  form: "Form (form)",
  price_change_percent: "Price Change Predictor: live % (price_change_percent)",
  price_change_projections: "Price Change Predictor: Today/Tomorrow/Day After (price_change_projections)",
  price_change_calibrating: "Price Change Predictor: calibrating flag (price_change_calibrating)",
};

/**
 * One source of truth for section nav and numbering: the "On this page"
 * chips and each section's own heading both read from this, so they can't
 * drift out of sync with each other.
 */
const SECTION_META = [
  { id: "overview", label: "Overview" },
  { id: "modes", label: "Analysis modes" },
  { id: "dashboard", label: "Dashboard" },
  { id: "player-explorer", label: "Player Explorer" },
  { id: "team-building", label: "Team Building" },
  { id: "player-comparison", label: "Player Comparison" },
  { id: "teams", label: "Team Explorer" },
  { id: "player-profile", label: "Player Profile" },
  { id: "limitations", label: "Data sourcing & known limitations" },
  { id: "metric-reference", label: "Metric reference" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const number = SECTION_META.findIndex((s) => s.id === id) + 1;
  return (
    <div className="card guide-section" id={id}>
      <h2 className="guide-section-title">
        <span className="guide-section-number">{String(number).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Try({ children }: { children: React.ReactNode }) {
  return (
    <div className="banner info" style={{ marginTop: 12 }}>
      <strong>Try it:</strong> {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="guide-subheading">{children}</h3>;
}

export function UserGuide() {
  const { advancedFieldAvailability, validationReport, skippedPlayerCount } = useAppState();
  const apiMetrics = METRIC_LIST.filter((m) => m.source === "FPL API");
  const derivedMetrics = METRIC_LIST.filter((m) => m.source === "Derived");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>User Guide</h1>
          <p className="page-subtitle">
            What each page does, where its numbers come from, and how to use it. Where FPL doesn't supply a figure, the app shows
            "—" rather than an estimate.
          </p>
        </div>
      </div>

      <div className="card guide-section">
        <div className="card-title">On this page</div>
        <div className="chip-row">
          {SECTION_META.map((c) => (
            <a key={c.id} className="chip" href={`#${c.id}`} style={{ textDecoration: "none" }}>
              {c.label}
            </a>
          ))}
        </div>
      </div>

      <Section id="overview" title="Overview">
        <p className="page-subtitle" style={{ margin: 0 }}>
          An FPL scouting dashboard built on the official Fantasy Premier League API, with no manual data entry and no third-party estimates
          passed off as fact. Almost everything comes from the live <code>bootstrap-static</code> snapshot (today's prices, ownership,
          current-season stats, fixtures) and every player's season-by-season history (<code>element-summary</code>'s{" "}
          <code>history_past</code>), which feeds the historic modes below.
        </p>
        <p className="page-subtitle">
          Every section is <strong>descriptive</strong> (it shows what has happened, never what will) except Team Building, which
          is built to predict. Its guide below explains what it predicts and how.
        </p>
      </Section>

      <Section id="modes" title="Analysis modes: Last Completed Season / Historic Average / Current Season">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Most pages (Dashboard, Player Explorer, Player Comparison, Team Explorer, Team Profile, the player profile) have the same
          toggle near the top. Each page's toggle, and its Search/Position/Team/Min Minutes criteria where it has them, is its
          own: changing one page never changes what another shows.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Last Completed Season:</strong> a player's actual totals from the most recently finished season, however much
            or little he played. An injury-hit season is real data when the question is "what happened last season".
          </li>
          <li>
            <strong>Historic Average:</strong> the average of the last 4 completed seasons a player has, light or injury-hit ones
            included, so a bad season isn't quietly dropped. Per-game figures (PPG, xG/Game and the rest) are the seasons' totals
            divided by their total games, with games counted from total minutes. Where you can't set minimum minutes yourself (see
            below), only seasons of 450+ minutes count. A cameo year, one lost to injury or a year out of the Premier League is too
            small a sample. The window is always the last 4 completed seasons; an older season never takes a skipped one's place.
          </li>
          <li>
            <strong>Current Season:</strong> this season's live figures. Before a player's team has played, points, goals, minutes
            and the like are genuinely zero. Live figures update every 10 minutes; the Refresh button at the top fetches everything
            straight away, this season's club figures and league table included (those can take up to a minute; the current ones
            stay on screen meanwhile).
          </li>
        </ul>
        <p className="page-subtitle">
          <strong>Minimum minutes.</strong> Where you set a minutes filter yourself (Player Explorer's Mins column, the tiles and
          graphs you build on the Dashboard, the cards you build on Player Comparison, Team Building) the app adds none of its own:
          raise it if one short appearance is topping a per-game list. Where you can't (the player profile and the Starter views on
          the Dashboard and Player Comparison) a fixed floor applies: 90 minutes in Current Season, 450 (five full games) otherwise,
          and Historic Average counts only seasons of 450+ minutes (so a player who never reached 450 in the last 4 seasons has no
          Historic Average there). In the player profile and Player Comparison's Starter view, a player under the floor is a{" "}
          <em>small sample</em>: shown, but with no percentile, no green/red colour, and never marked the best. Starter tiles and
          graphs leave him out. A small stopwatch badge, by the mode toggle or in a card's header, shows where the floor applies
          (hover it for the figure); in amber, it marks a player under it.
        </p>
        <p className="page-subtitle" style={{ margin: 0 }}>
          Price, ownership and availability are always today's, in every mode, including anything worked out from price like
          Points/£m, because what a player costs now is what matters for picking a squad. The one exception is Points History's
          season-by-season table, which shows what a player cost at the time.
        </p>
      </Section>

      <Section id="dashboard" title="Dashboard">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          A snapshot: Top-5 leaderboard tiles with graphs underneath, all customisable. The <strong>Players / Teams</strong> toggle
          (top right) switches between the two sets. Click any row or chart point to open that player's profile or that team's page.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Views.</strong> <strong>My View</strong> is where you start: blank, with a + card in the tile grid and the graph
            grid. <strong>Starter</strong> is the app's ready-made layout. It's always in the dropdown and can't be changed or
            deleted. <strong>Create View</strong> (next to the dropdown) starts another blank view, up to 5 each for Players and
            Teams, Starter included. The pencil icon on a tile or graph edits it and its bin removes it; the bin next to the dropdown
            deletes the selected view after you confirm (no undo). Everything saves as you go, and switching views changes only the
            Players or Teams side you're on.
          </li>
          <li>
            <strong>Each tile has its own settings</strong>, set in its dialog: a name, a Data View (shown as an{" "}
            <code>LS</code>/<code>HA</code>/<code>CS</code> badge in its header) and, for player tiles, its own Search, Position,
            Team and Min Minutes, so two tiles can watch different slices of the pool. Min Minutes is a slider in whole matches;
            type in the box beside it for an exact figure. It starts at 0 in every Data View, so per-game statistics rank everyone
            your criteria let through. Raise it (e.g. 450 for five full games) to rank only players with a real sample. Team tiles
            show club figures for their Data View and have no criteria.
          </li>
          <li>
            Each row reads club pill, position, name, bar, value. Bars start at the same point and the top row's is full length, so
            a shorter bar shows how far behind that row is. The three "vs xG/xA/xGI" tiles colour green/red for above/below
            expected; everything else is one colour.
          </li>
        </ul>
        <p className="page-subtitle">
          <strong>Graphs</strong> work like tiles: add one with the + card, edit it with its pencil. Pick a name, a chart type (a{" "}
          <strong>Scatter Plot</strong> of two metrics, or a <strong>Bar Chart</strong> ranking 15 by one, in the order you choose;
          it starts with the natural one, so League Position lists the best first), the metric(s), a Data View, and what to
          include: Filters or up to 5 players, or All Teams or up to 5 teams. A scatter plot can add a dashed 45° trend line (
          <strong>Add Trend Line</strong>) marking where X equals Y. It's useful only when both are on the same scale, like xG and Goals.
          The Starter graphs are xG vs Goals, xA vs Assists and Price vs Points for players, and Team xG vs Goals and Team xGC vs
          Goals Against for teams; the player ones leave out players under the fixed minutes floor, who would otherwise pile up at
          zero.
        </p>
        <p className="page-subtitle">
          Scatter axes fit the data rather than starting at 0. If one axis is five or more times the other's size, the trend line
          is left out (a note says so). If a few big values crowd everyone else into a narrow band, that axis switches to a log
          scale (√ if it has zeros) and its title says so; hovering a point always shows the real values. With a trend line, both
          axes share the same range and scale.
        </p>
        <p className="page-subtitle">
          Team figures are <em>club</em> figures for the tile or graph's Data View (see Team Explorer &amp; Team Profile below). A
          team tile set to Last Completed Season shows that season's final League Position, League Points, Goals For/Against and so
          on, not today's table.
        </p>
        <Try>Spot a name in a leaderboard or an outlier on a chart, click through, then dig deeper in Player Explorer or the profile.</Try>
      </Section>

      <Section id="player-explorer" title="Player Explorer">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          The full player database as one customisable table. Its columns come from the same list as Player Comparison and Team
          Building, so a metric means the same thing everywhere.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Reorder:</strong> drag a column header. <strong>Resize:</strong> drag its right edge. Columns fit the space
            available; one you've resized keeps its width until Reset, and the others share the rest. When they can't all fit, the
            table scrolls sideways.
          </li>
          <li>
            <strong>Sort:</strong> click a header; shift-click another to add a tiebreaker. A blank (—) counts as lower than any
            value. Names sort alphabetically, ignoring accents (Ødegaard sits among the Os); Position sorts GKP, DEF, MID, FWD.
          </li>
          <li>
            <strong>Filter:</strong> the ▾ on a header. ≤ / ≥ / = for numbers, a list for Position and Team. Enter confirms, Escape
            cancels. Numbers compare as shown, so = 15.3 finds a player shown as 15.3. Hiding a column clears its filter and its sort.
          </li>
          <li>
            <strong>Search:</strong> the toolbar box finds players by name, here and on Team Building and Player Comparison. It
            ignores accents ("odegaard" finds Ødegaard), takes names in any order or as FPL writes them ("B.Fernandes"), and
            tolerates small typos.
          </li>
          <li>
            <strong>Toolbar icons</strong> (hover each for its name): Reset restores the default columns, order and widths and clears
            every filter; Columns picks which columns show; Clear filters empties the search and every column filter; Export CSV
            downloads exactly what's on screen.
          </li>
          <li>Each cell is tinted green/red against the rest of its column on screen.</li>
          <li>
            <strong>Next 5 Fixtures</strong> (off by default; turn it on in Columns) is always the player's actual upcoming
            fixtures, whatever the mode.
          </li>
          <li>The page starts fresh each visit: columns, widths, sort and filters return to the defaults when you leave.</li>
        </ul>
        <Try>
          Looking for undervalued midfielders? Filter Position to MID, sort Pts/£m descending, and cap Price at your budget with its ▾.
        </Try>
      </Section>

      <Section id="team-building" title="Team Building: the one predictive section">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Picking a squad for the season ahead. Start with <strong>New Squad</strong>: a blank one (just give it a name), or import
          a real squad by its FPL team ID, the number in your team's FPL web address (Pick Team → Gameweek History shows it).
          Importing reads FPL's public data for that team, chip history included; no login, nothing written back. The rest of the
          page appears once a squad is loaded. Up to 5 squads can be saved; <strong>Delete</strong> asks you to confirm the name
          first (no undo).
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            The <strong>pitch</strong> is drag-and-drop: drag a player from Add Players onto the pitch or bench, or one card onto
            another to swap. Click a name for the profile; click <strong>Captain</strong>/<strong>Vice-Captain</strong>, then a
            starter, to assign it; <strong>Clear Draft</strong> empties the squad. Cards show live price, ownership, minutes
            reliability, the next fixtures and both Expected Points figures (doubled for the captain).
          </li>
          <li>
            The <strong>GW+1..GW+5 navigator</strong> picks which of each player's next five fixtures the Expected Points figures
            estimate: his own Nth fixture, not a calendar gameweek, so a blank gameweek has nothing to select and a double
            gameweek's two fixtures are consecutive steps.
          </li>
          <li>
            Two Expected Points figures, never blended: <strong>FPL Official</strong> is FPL's own <code>ep_next</code> prediction
            (extended to later fixtures using fixture difficulty). <strong>Model Predicted</strong> is this app's independent
            estimate from live per-90 stats (xG, xA, xGC, defensive contributions, saves) and FPL's scoring rules. Hover it for its
            caveats: it's a second opinion, rougher for goalkeepers and nailed-on popular picks (see the README's backtest).
          </li>
          <li>
            The status line above the pitch shows squad size, budget, composition and any club-limit breach. Going over £100m turns
            the budget red but never stops you adding a player.
          </li>
          <li>
            The <strong>Add Players</strong> table has Player Explorer's toolkit, in two groups either side of a divider:{" "}
            <strong>Predictive</strong> (the Expected Points columns, Minutes Reliability, a fixture ticker) and{" "}
            <strong>Historic/Raw</strong> (with its own mode toggle). Price and club limits always use today's price and club.
          </li>
        </ul>
        <Try>Sort Add Players by "Exp. Pts (Model Predicted)" and compare it with "FPL Official". Where they disagree most is worth a second look.</Try>
      </Section>

      <Section id="player-comparison" title="Player Comparison">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Side-by-side analysis of up to 5 players, added with the search box at the top. Each gets a tag (ownership · today's
          price, club, position) and a colour (blue, gold, green, red, then grey, in the order added) used for him on every chart.
          Click a name for his profile; × removes him.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Charts</strong> are percentile radars: each axis is a player's percentile within his position, outward always
            better (xGC and xGC/Game are turned round, since fewer is better). Pick 3–8 statistics and a Data View.
          </li>
          <li>
            <strong>Outputs</strong> list up to 12 statistics as rows. Each row's track runs from 0 to the highest figure among the
            players, with each player's marker at his own figure and the best in bold; faint ticks mark a quarter, half and three
            quarters of the leader. For xGC and xGC/Game, the best is furthest left.
          </li>
          <li>
            <strong>Trends</strong> graph one statistic season by season across the completed seasons on record. A season with no
            figure is a gap, not a zero.
          </li>
          <li>
            <strong>Views</strong> work like the Dashboard's: <strong>My View</strong> starts blank, with a + card in each section
            (up to 4 cards per section); pencil edits, bin removes, and cards drag to reorder. <strong>Starter</strong> is a
            read-only set of radars, outputs and trends that works for any players. Create View adds another (up to 5, Starter
            included). A view keeps the layout, not the players.
          </li>
        </ul>
        <p className="page-subtitle">
          <strong>Min Minutes</strong> is set per card you build (0 unless you set it). A player under it gets an amber stopwatch on
          that card (hover for his minutes): he isn't drawn on a radar (radars rank only players who reach it), has no Outputs marker
          and can't be the best. On a Trends
          graph, a season under it still shows his figure, but as an amber ring rather than a dot. Starter cards use the fixed floor
          instead (see Minimum minutes above).
        </p>
        <Try>Add two players you're deciding between and switch to Starter. If one leads on totals but the other on per-game rows, the first may just have played more.</Try>
      </Section>

      <Section id="teams" title="Team Explorer &amp; Team Profile">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Team figures are always <em>what the club did</em> that season, whoever was playing for it, built from a match-by-match
          record of which club each player played for. A summer signing's previous season stays with his previous club; a player
          who leaves mid-season keeps what he did counted for the club. To judge what a signing would bring, look at the player
          instead. The Data View picks the season: Current Season, Last Completed Season, or a Historic Average of the last four
          completed seasons the club was in the Premier League (a season in the Championship shows "—", never zero). Club figures
          have no minimum-minutes floor.
        </p>
        <p className="page-subtitle">
          <strong>Team Explorer</strong> is a league-table view of that season (position, points, goals for and against, clean
          sheets, xG, xGC, xA and FPL points) with Player Explorer's toolbar and column toolkit. Columns adds more team metrics
          (played, wins, draws, losses, goal difference, goals, assists, bonus, xGI, defensive contributions), and the "Team name…"
          box searches by name or short name. A team's pill, a swatch of its real kit colours where known, opens its Team
          Profile wherever it appears in the app.
        </p>
        <p className="page-subtitle">
          <strong>Team Profile</strong> shows season totals, the team radars, upcoming fixtures and the match log: club figures
          only, no players (for a club's players, use Player Explorer's Team column). The header's position, points and results
          follow the Data View; in Historic Average, position and points are rounded (two clubs can both be "2nd") and wins, draws
          and losses always add up to the games played. On the Defense radar, more Defensive Contributions counts as better, so a
          dominant side that rarely defends can sit low on that axis.
        </p>
        <p className="page-subtitle">
          <strong>Live Data</strong> is this season's match log, newest first: opponent, home or away, score, then the club's FPL
          points, goals, assists, xG, xA, xGI, clean sheet, xGC and defensive contributions, with Totals and a per-match Average,
          coloured against every other club. FPL records xG and the rest per player, so each match adds up whoever played.{" "}
          <strong>Points History</strong> charts the club's FPL points per season back to 2016/17 (this season as an outlined bar),
          with the same rolling 4-season average as the player profile; older seasons are grey, marked † on hover, and a season
          outside the Premier League has no bar.
        </p>
        <p className="page-subtitle">
          Where the club record comes from: the API only serves this season's match data and wipes it each summer, so 2016/17 to
          2025/26 were filled in once from a well-known community archive of FPL's own data, checked against FPL's season totals and
          every match's real score. From 2026/27 the app archives it from the official API twice a week. Club xG, xA and xGC start
          in 2023/24 (FPL began tracking them partway through 2022/23, which shows "—"); club Defensive Contributions start in
          2025/26.
        </p>
      </Section>

      <Section id="player-profile" title="Player Profile">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Click a player's name almost anywhere to open it; × or Escape closes it. The "Views" zone (Actual vs Expected, Underlying
          Numbers, Percentile Radar, Value) follows the analysis mode; "Live Data", Playing Time and Points History always show real
          figures. The Percentile Radar is position-specific: defenders and midfielders get Defense and Offense radars, goalkeepers
          and forwards one combined radar. Underlying Numbers and Value are tinted green/red by his percentile within his position.
          Goalkeepers get no Defensive Contribution tiles, since FPL's defensive-contribution points exclude them.
        </p>
        <p className="page-subtitle">
          The profile has no minutes setting, so its percentiles use the fixed floor (see Analysis modes): only players with 450+
          minutes (90 in Current Season) are ranked. A player under it is a <em>small sample</em>: his radars carry an amber
          stopwatch (hover for the figures) and nothing is coloured. If he has no figures in the chosen mode, the profile suggests
          Data Views that do.
        </p>
        <p className="page-subtitle">
          <strong>Live Data</strong> is a match-by-match table of this season (a double gameweek is two rows): result, then Points,
          Minutes, Goals, Assists, xG, xA, xGI, Clean Sheets, xGC, Defensive Contributions and BPS (Saves instead of Defensive
          Contributions for a goalkeeper). Totals adds up the matches listed; Average divides by them, including ones he didn't play.
          Both are tinted against his position using this season's figures and the Current Season floor, Average per match, so a
          late signing's strong per-match numbers show green even while his total is low. <strong>Playing Time</strong>, a
          minutes-per-match gauge with matches and average minutes, sits below.
        </p>
        <p className="page-subtitle">
          <strong>Points History</strong> has a bar per season: green if counted in the average, grey if not, this season as an
          outline. The line is the average of the last 4 completed seasons; top right is the change between the last two. The icons
          underneath are per-season averages of points, minutes, goals and assists (hover for which). The chevron opens the
          season-by-season table: <strong>*</strong> marks a light season that still counts, <strong>†</strong> one that doesn't
          (outside the 4 seasons, or under 450 minutes). The table is tinted against his own other seasons, except Price (the
          middle of that season's start and end price), which is compared with every player who played 450+ minutes that season
          (90 for this one): cheaper is greener. Past seasons compare with players still in FPL today, and a season of his under
          those minutes has no colour.
        </p>
      </Section>

      <Section id="limitations" title="Data sourcing & known limitations">
        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Club history before 2026/27 comes from a community archive.</strong> The official API's per-season player history
            has no club attribution, and it doesn't serve past seasons' match data at all, so 2016/17–2025/26 club figures were
            backfilled from the vaastav/Fantasy-Premier-League archive (a mirror of FPL's own data). See Team Explorer &amp; Team Profile.
            From 2026/27 on it's archived straight from the official API.
          </li>
          <li>
            <strong>xG-family stats are placeholder zeros before 2022/23</strong> and <strong>Defensive Contribution before 2024/25</strong>,
            confirmed directly against the raw data. Historic Average correctly excludes these rather than diluting an average with a
            fake zero.
          </li>
          <li>
            <strong>Set-piece order data exists</strong> in the API (penalty/free-kick/corner pecking order) but isn't surfaced in this
            app yet.
          </li>
          <li>
            <strong>No predicted-lineup data exists anywhere in the FPL API</strong>. That's third-party editorial judgement on other
            sites, not something this dashboard could source honestly.
          </li>
          <li>Ownership has no historic equivalent at all. It always shows today's live figure, in every mode, clearly labelled as such.</li>
        </ul>
      </Section>

      <Section id="metric-reference" title="Metric reference">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Every statistic in this app, where it comes from, and exactly how it's calculated.
        </p>

        {advancedFieldAvailability && (
          <div style={{ marginBottom: 20 }}>
            <SubHeading>Live API Field Availability (checked at load time)</SubHeading>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Field</th>
                    <th style={{ textAlign: "left" }}>Present on this build?</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(advancedFieldAvailability).map(([field, present]) => (
                    <tr key={field}>
                      <td style={{ textAlign: "left", fontFamily: "var(--font-mono)" }}>{FIELD_LABELS[field] ?? field}</td>
                      <td style={{ textAlign: "left" }}>
                        {present ? (
                          <span className="value-positive">Yes</span>
                        ) : (
                          <span className="value-negative">No, shown as "—" throughout the app</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {skippedPlayerCount > 0 && (
              <p className="page-subtitle">
                {skippedPlayerCount} player record(s) were excluded (invalid or missing required data, or a reference to an
                unknown team or position id) and could not be normalised.
              </p>
            )}
          </div>
        )}

        {validationReport && (
          <div style={{ marginBottom: 20 }}>
            <SubHeading>xGI Cross-Check (development validation)</SubHeading>
            <p className="page-subtitle" style={{ marginBottom: 6 }}>
              The app recomputes xGI as xG + xA and compares it with the API's own figure (tolerance 0.01). The API's figure is
              always the one shown; this check only surfaces any disagreement.
            </p>
            <div className="stat-row">
              <span className="stat-row-name">Players checked</span>
              <span className="stat-row-value">{validationReport.playersChecked}</span>
            </div>
            <div className="stat-row">
              <span className="stat-row-name">Discrepancies beyond tolerance</span>
              <span className="stat-row-value">{validationReport.discrepancies.length}</span>
            </div>
            {validationReport.discrepancies.length > 0 && <p className="page-subtitle">See the browser console for the full discrepancy list.</p>}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <SubHeading>Supplied directly by the FPL API</SubHeading>
          <MetricTable metrics={apiMetrics} />
        </div>

        <div>
          <SubHeading>Calculated by this app</SubHeading>
          <MetricTable metrics={derivedMetrics} />
        </div>
      </Section>
    </div>
  );
}

function MetricTable({ metrics }: { metrics: typeof METRIC_LIST }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Metric</th>
            <th style={{ textAlign: "left" }}>API Field(s)</th>
            <th style={{ textAlign: "left" }}>Formula</th>
            <th style={{ textAlign: "left" }}>Units</th>
            <th style={{ textAlign: "left" }}>Availability / Caveats</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.internalName} style={{ cursor: "default" }}>
              <td style={{ textAlign: "left", fontFamily: "var(--font-body)", fontWeight: 600 }}>{m.displayName}</td>
              <td style={{ textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{m.apiFields.join(", ")}</td>
              <td style={{ textAlign: "left", fontFamily: "var(--font-body)", fontSize: 12 }}>{m.formula ?? "\u2014"}</td>
              <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>{m.units ?? "\u2014"}</td>
              <td style={{ textAlign: "left", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>
                {m.availabilityNote} {m.caveats ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
