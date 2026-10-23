import React from "react";
import { useAppState } from "../state/AppStateContext";
import { METRIC_LIST } from "../metrics/dictionary";
import { useExternalStats } from "../extensions/externalStats";

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
 * One source of truth for section nav, numbering and colour: the "On this
 * page" chips and each section's own heading both read from this, so they
 * can't drift out of sync with each other. Colours are the app's existing
 * accent tokens; only Known limitations gets the warning colour.
 */
const SECTION_META = [
  { id: "overview", label: "Overview", accent: "--accent-positive" },
  { id: "modes", label: "Analysis modes", accent: "--accent-focus" },
  { id: "dashboard", label: "Dashboard", accent: "--accent-value" },
  { id: "player-explorer", label: "Player Explorer", accent: "--accent-positive" },
  { id: "team-building", label: "Team Building", accent: "--accent-focus" },
  { id: "player-comparison", label: "Player Comparison", accent: "--accent-value" },
  { id: "teams", label: "Team Explorer", accent: "--accent-positive" },
  { id: "player-profile", label: "Player Profile", accent: "--accent-focus" },
  { id: "notepad", label: "Notepad", accent: "--accent-value" },
  { id: "app", label: "Opening & updating", accent: "--accent-positive" },
  { id: "limitations", label: "Data sourcing & known limitations", accent: "--accent-negative" },
  { id: "metric-reference", label: "Metric reference", accent: "--accent-value" },
];

/** Sets `--guide-accent`, which the heading, number badge, sub-headings and nav chip read. */
function accentStyle(accent: string | undefined): React.CSSProperties | undefined {
  return accent ? ({ "--guide-accent": `var(${accent})` } as React.CSSProperties) : undefined;
}

/** The sections actually shown — SECTION_META plus a second data source's own section, when one is mounted (extensions/externalStats.ts). */
const SectionsContext = React.createContext<{ id: string; label: string; accent: string }[]>(SECTION_META);

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const sections = React.useContext(SectionsContext);
  const index = sections.findIndex((s) => s.id === id);
  const number = index + 1;
  return (
    <div className="card guide-section" id={id} style={accentStyle(sections[index]?.accent)}>
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
  const { advancedFieldAvailability, validationReport, skippedPlayerCount, skippedRecordCounts } = useAppState();
  const apiMetrics = METRIC_LIST.filter((m) => m.source === "FPL API");
  const derivedMetrics = METRIC_LIST.filter((m) => m.source === "Derived");
  const ext = useExternalStats();
  const extSection = ext?.guideSection ?? null;
  const sections = React.useMemo(() => {
    if (!extSection) return SECTION_META;
    const at = SECTION_META.findIndex((s) => s.id === "limitations");
    return [...SECTION_META.slice(0, at), { id: extSection.id, label: extSection.navLabel, accent: extSection.accentVar }, ...SECTION_META.slice(at)];
  }, [extSection]);

  return (
    <SectionsContext.Provider value={sections}>
    <div>
      <div className="page-header">
        <div>
          <h1>User Guide</h1>
          <p className="page-subtitle">
            What each page does, where its numbers come from, and how to use it. Where FPL doesn't supply a figure, the app shows
            "—" rather than an estimate, and a player who hasn't played any minutes in the selected Data View shows "—" for his
            figures, never a row of zeros.
          </p>
        </div>
      </div>

      <div className="card guide-section">
        <div className="card-title">On this page</div>
        <div className="chip-row">
          {sections.map((c) => (
            <a key={c.id} className="chip guide-nav-chip" href={`#${c.id}`} style={accentStyle(c.accent)}>
              {c.label}
            </a>
          ))}
        </div>
      </div>

      <Section id="overview" title="Overview">
        <p className="page-subtitle" style={{ margin: 0 }}>
          Scoutline is an independent scouting dashboard for Fantasy Premier League, built on the game's own live data, with no manual
          data entry and no third-party estimates passed off as fact. It isn't affiliated with or endorsed by the Premier League; About
          &amp; Legal, at the bottom of the menu, has the terms, the privacy notice and who owns the data. Almost everything comes from the live <code>bootstrap-static</code> snapshot (today's prices, ownership,
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
          toggle near the top, with the season(s) the selected view covers shown inside it (e.g. 2026/27, or 2022/23–2025/26 for
          Historic Average). Each page's toggle, and its Search/Position/Team/Min Minutes criteria where it has them, is its
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
            divided by their total games, with games counted from total minutes. Only seasons of 450+ minutes count, on every
            page: a cameo year, one lost to injury or a year out of the Premier League is too small a sample. The window is always the last 4 completed seasons; an older season never takes a skipped one's place.
            Counts (goals, assists, points, cards and the like) show one decimal here, so 0.4 goals a season reads 0.4, not 0.
          </li>
          <li>
            <strong>Current Season:</strong> this season's live figures. Player figures update every 10 minutes by themselves, and so does an open profile's
            Match Log; this season's club figures and league table catch up within the hour after FPL confirms a match. Hover the dot at
            the top left to see when the data was last updated.
          </li>
        </ul>
        <p className="page-subtitle">
          <strong>Minimum minutes.</strong> Where you set a minimum yourself (Player Explorer's Mins column, the tiles and graphs
          you build on the Dashboard, the cards you build on Player Comparison, Team Building's Min minutes) it's the only one that
          decides which players show, in every mode, Current Season included: raise it if one short appearance is topping a
          per-game list. Where you can't (the player profile and the Starter views on the Dashboard and Player Comparison) a fixed
          floor applies: 90 minutes in Current Season, 450 (five full games) otherwise. A player with no minutes counts as 0, so
          he's under any minimum. Green and red always use the fixed floor. A player under it is a <em>small sample</em>: shown
          where your minimum lets him, but with no percentile, no green/red colour, and never marked the best; Starter tiles and
          graphs leave him out. Historic Average counts only seasons of 450+ minutes everywhere, so a player who never reached
          450 in the last 4 seasons has none.
        </p>
        <p className="page-subtitle">
          The <strong>stopwatch</strong> is the one sign of a minutes threshold, and it shows wherever one applies (hover it
          to see which). On a view it's amber while something shown there is under the threshold and grey when nothing is; on an
          entry under one it's always amber. Player Explorer, Team Building's Add Players and the Dashboard tiles and graphs you
          build also get a <strong>Hide</strong> button (the stopwatch struck through) whenever something shown is under the
          threshold: click it to leave those players out, and again to bring them back. The stopwatch appears on a view where one is in force (the mode toggle in Historic Average, the profile, a tile, graph or card
          with a floor or your own minimum, Player Explorer's Mins heading when you filter it, Team Building's Min minutes and
          its Model Predicted column), and on anything under one (a player's row, a season in Points History, the Match Log's
          season, a card on the profile, a point or marker on Player Comparison, a point or bar on a Dashboard graph). Team Building's Expected Points, Minutes
          Reliability and pitch cards look ahead rather than back, so no minutes floor touches their colours.
        </p>
        <p className="page-subtitle">
          <strong>Green and red</strong> mean the same everywhere: how a figure compares. A player's is compared with every
          player in his position for the same Data View, whatever filters or search you've set, so his colour doesn't change
          as you narrow a table and matches his profile's. A club's is compared with every club. Stronger green is better,
          stronger red worse, no colour about average. A player under the floor above (90 minutes in Current Season, 450
          otherwise) has no colour on any page and doesn't count in anyone else's, even where your own minimum shows his row.
          More goals, assists, wins and points are better, scoring above expected included; a lower price and lower
          ownership are better. Games played, draws and style figures (set-piece share, assisted-shot share, PPDA) have no
          colour. Charts that tell players apart by colour never use green or red, so no one reads as better or worse by his
          colour alone. Hover a coloured figure to see where it ranks: "Top 8% of midfielders" for a player, "3rd of 20 clubs"
          for a club. Hover a column header for what its statistic means. The palette button in the top bar, right of the
          notepad's, turns green and red off on every page at once (struck through while off); press it again to bring them
          back. Hovering a figure still tells you where it ranks, and the app remembers your choice next time.
        </p>
        <p className="page-subtitle" style={{ margin: 0 }}>
          Price, ownership and availability are always today's, in every mode, including anything worked out from price like
          Points/£m, because what a player costs now is what matters for picking a squad. The one exception is the profile's
          Match Log, whose heading shows a past season's start and end price.
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
            Teams, Starter included. The pencil icon on a tile or graph edits it and its bin removes it after you confirm; the bin next
            to the dropdown deletes the selected view, also after you confirm (neither can be undone). Everything saves as you go, and switching views changes only the
            Players or Teams side you're on.
          </li>
          <li>
            <strong>Each tile has its own settings</strong>, set in its dialog: a name (optional: left blank, the tile is titled by
            its statistic), a Data View (shown by the same icon as the page's Data View toggle in its header; hover it for the name),
            an order and, for player tiles, either{" "}
            <strong>Filters</strong> (Position, Team, a price range and Min Minutes) or <strong>Player Search</strong> (up to 5
            specific players), so two tiles can watch different slices of the pool. Min Minutes is a slider in whole matches;
            type in the box beside it for an exact figure. It starts at 0 in every Data View, so per-game statistics rank everyone
            your criteria let through. Raise it (e.g. 450 for five full games) to rank only players with a real sample. Team tiles
            show club figures for their Data View, for all teams or up to 5 you pick.
          </li>
          <li>
            Each row reads club pill, position, name, bar, value. Bars start at the same point and the top row's is full length, so
            a shorter bar shows how far behind that row is, whichever way the tile is ordered (on a Lowest First tile, a row with
            twice the leader's figure has half its bar). A tile ordered Lowest First says so in its title. Each figure is
            coloured green/red as everywhere (see Overview), against the whole pool for the tile's Data View, not just the
            players it lists.
          </li>
        </ul>
        <p className="page-subtitle">
          <strong>Graphs</strong> work like tiles: add one with the + card, edit it with its pencil. Pick a name (optional, as for a tile), a chart type (a{" "}
          <strong>Scatter Plot</strong> of two metrics, or a <strong>Bar Chart</strong> ranking 15 by one, in the order you choose;
          it starts with the natural one, so League Position lists the best first), the metric(s), a Data View, and what to
          include: Filters or up to 5 players, or All Teams or up to 5 teams. The pickers (type in their box to find a statistic) include Understat's figures, grouped as in
          the Explorers, and a figure both sources have gets the ⇄ switch (see Understat stats; the same goes for tiles). A scatter plot can add a dashed 45° trend line (
          <strong>Add Trend Line</strong>) marking where X equals Y. It's useful only when both are on the same scale, like xG and Goals.
          The Starter graphs are xG vs Goals, xA vs Assists and Price vs Points for players, and Team xG vs Goals and Team xGC vs
          Goals Against for teams; the player ones leave out players under the fixed minutes floor, who would otherwise pile up at
          zero. On a graph you build, a player under the floor is drawn as the amber stopwatch instead of a dot (on a bar chart,
          beside his name), and hovering him says why.
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
            <strong>Sort:</strong> click a header; its first click puts the best first (lowest first where lower is better, like
            Price, Goals Against or xGC; names A to Z), the next reverses it. Shift-click another (the Player name too) to add a
            tiebreaker. A blank (—)
            counts as lower than any value. Names sort alphabetically, ignoring accents (Ødegaard sits among the Os); Position sorts GKP, DEF, MID, FWD.
          </li>
          <li>
            <strong>Filter:</strong> the ▾ on a header. ≤ / ≥ / = for numbers, a list for Position and Team. Enter confirms, Escape
            cancels. Numbers compare as shown, so = 15.3 finds a player shown as 15.3. Hiding a column clears its filter and its sort,
            and so does Reset for every column it hides.
          </li>
          <li>
            <strong>Search:</strong> the toolbar box finds players by name, here and on Team Building and Player Comparison. It
            ignores accents ("odegaard" finds Ødegaard), takes names in any order or as FPL writes them ("B.Fernandes"), and
            tolerates small typos when no name matches what you typed ("haalnd" finds Haaland; "wilson" finds only Wilsons).
            Where a search suggests players (Player Comparison, the Dashboard's Player Search), the one whose name you typed comes
            first, ↓/↑ move through the list, Enter adds the highlighted one and Escape closes the list.
          </li>
          <li>
            <strong>Toolbar icons</strong> (hover each for its name): Reset restores the default columns, order and widths and clears
            every filter; Columns picks which columns show (type in its box to find one); Clear filters empties the search and every column filter; Saved views
            (right of Clear filters) saves or loads a view; Export CSV downloads exactly what's on screen, ready to open in Excel.
          </li>
          <li>
            <strong>Saved views:</strong> "Save current view" keeps the Data View, the columns and their order, any widths you've
            dragged, the sort, the search, every filter, each ⇄ switch and Hide, under a name. Click a name in the menu to load
            it; its save icon replaces it with what's on screen now, and its bin deletes it (both ask first). A saved view
            changes only when you save over it, so try anything after loading one. Up to 5 views. If something in a view can't
            be shown now (say, a club that's left the league), it loads without it and a note above the table says what.
          </li>
          <li>
            Each cell is coloured green/red against every player in his position (see Overview), not just the rows on screen.
            Total xGC, goals conceded and cards are compared per game, so a player who has barely played doesn't look like the
            best defender.
          </li>
          <li>
            <strong>Header colours</strong> say where a figure comes from and whether it follows the Data View: green is an FPL
            figure for the selected season(s); muted red is always today's live figure (Own%, Price, Team, Position, Form, and the
            set-piece orders: Pen, FK and Corner Order, where 1 is the club's first choice). Team Building's Add Players headers
            use the same colours, and every list of statistics grouped under headings (Columns here and in Team Building, the
            Dashboard's Statistic and axis pickers, Player Comparison's cards and Outputs panels) has the same coloured, iconed
            headings.
            {ext ? ` ${ext.label}'s figures have their own colour; see "${ext.guideSection.navLabel}" below.` : ""}
          </li>
          <li>
            <strong>Next 5 Fixtures</strong> (off by default; turn it on in Columns) is always the player's actual upcoming
            fixtures, whatever the mode: matches not yet kicked off.
          </li>
          <li>The page starts fresh each visit: columns, widths, sort and filters return to the defaults when you leave. Load a saved view to get yours back.</li>
        </ul>
        <Try>
          Looking for undervalued midfielders? Filter Position to MID, sort Pts/£m descending, and cap Price at your budget with its ▾.
        </Try>
      </Section>

      <Section id="team-building" title="Team Building: the one predictive section">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Picking a squad for the season ahead. Start with <strong>New Squad</strong>: a blank one (just give it a name), or import
          a real squad by its FPL team ID, the number in your team's FPL web address (Pick Team → Gameweek History shows it).
          Importing reads FPL's public data for that team, chip history included; no login, nothing written back. The squad's own
          buttons (Captain, Vice-Captain, Clear Draft, Delete) appear once a squad is loaded. Up to 5 squads can be saved; <strong>Delete</strong> asks you to confirm the name
          first (no undo).
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Add</strong> (in Add Players) puts a player in the starting XI while there's a legal place for him, otherwise on
            the bench. The <strong>pitch</strong> is drag-and-drop: drag a player from Add Players onto the pitch or bench, or one
            card onto another to swap. Click a name for the profile; click <strong>Captain</strong>/<strong>Vice-Captain</strong>,
            then a starter, to assign it (the C or V badge sits at the card's top left); <strong>Clear Draft</strong> empties the
            squad after you confirm (no undo). A saved player FPL no longer lists is named in a
            banner above the pitch, with a bin to remove him. Cards show live price, ownership, minutes
            reliability, the next fixtures and both Expected Points figures (doubled for the captain).
          </li>
          <li>
            The <strong>GW+1..GW+5 navigator</strong> picks which of each player's next five fixtures the Expected Points figures
            estimate: his own Nth fixture, not a calendar gameweek, so a blank gameweek has nothing to select and a double
            gameweek's two fixtures are consecutive steps. GW+1 is always in the next gameweek you can still pick for (the one FPL's
            own estimate is for): once a deadline passes, that gameweek's matches drop out, even before FPL confirms the results.
          </li>
          <li>
            <strong>Minutes reliability</strong> is how much a player is likely to play, from his minutes alone (this season and
            the last four, recent seasons counting more), times his availability. How many managers own him plays no part.
            FPL's availability is for the next round only, so a one-match ban shows as 0 across all five steps.
          </li>
          <li>
            Two Expected Points figures, never blended: <strong>FPL Official</strong> is FPL's own <code>ep_next</code> prediction
            (extended to later fixtures using fixture difficulty). <strong>Model Predicted</strong> is this app's independent
            estimate from live per-90 stats (xG, xA, xGC, defensive contributions, saves) and FPL's scoring rules. Hover it, in Add
            Players or on a pitch card, for how it adds up (appearance, goals, clean sheet, bonus…) and anything it has no data
            for. It's a second opinion, rougher for goalkeepers and nailed-on popular picks (see the README's backtest).
          </li>
          <li>
            The status line above the pitch shows squad size, budget, composition and any club-limit breach. A squad built from
            scratch has FPL's £100m; an imported one has its own: its players at today's prices when you imported it, plus its money
            in the bank, so an unchanged import shows exactly that bank left (FPL's own selling prices need your login, so a player
            who has risen counts at today's price; hover the budget for its make-up). Going over turns the budget red and says how
            far over, but never stops you adding a player.
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
          price, club, position) and a colour (blue, gold, orange, white, then grey, in the order added) used for him on every chart.
          Click a name for his profile; × removes him.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Charts</strong> are percentile radars: each axis is a player's percentile within his position, outward always
            better (xGC/Game is turned round, since fewer is better; total xGC is ranked on xGC per game, so fewer minutes don't
            count as better). Pick 3–8 statistics and a Data View.
          </li>
          <li>
            <strong>Outputs</strong> list up to 12 statistics as rows. Each row's bar runs from 0 to the highest figure among the
            players, with each player's marker at their own figure and the figure above it, the best in bold. The bar is grey as
            far as every player reaches; past that, each stretch is tinted in the colour of the player whose marker ends it, so
            the length of a colour is how far that player is past the one before (for xGC and xGC/Game, where fewer is better,
            how far behind). Faint notches mark a quarter, half and three quarters of the leader. For xGC/Game the best is
            furthest left; for total xGC the best is the lowest per game.
          </li>
          <li>
            <strong>Trends</strong> graph one statistic season by season across the completed seasons on record. A season with no
            figure is a gap, not a zero.
          </li>
          <li>
            <strong>Views</strong> work like the Dashboard's: <strong>My View</strong> starts blank, with a + card in each section
            (up to 4 cards per section); pencil edits, bin removes (after you confirm), and cards drag to reorder. A card's name is
            optional, and its dialog's box filters the statistics by name. <strong>Starter</strong> is a
            read-only set of radars, outputs and trends that works for any players. Create View adds another (up to 5, Starter
            included). A view keeps the layout, not the players.
          </li>
          <li>
            Every card's statistics include Understat's, grouped as in the Explorers, with the ⇄ switch on figures both sources
            have (see Understat stats).
          </li>
        </ul>
        <p className="page-subtitle">
          <strong>Min Minutes</strong> is set per card you build (0 unless you set it). A player under it gets an amber stopwatch on
          that card (hover for his minutes): he isn't drawn on a radar (radars rank only players who reach it), his Outputs
          marker is the amber stopwatch and doesn't set the scale or tint the bar, and he can't be the best. On a Trends
          graph, a season under it still shows his figure, but as the amber stopwatch rather than a dot. Starter cards use the fixed floor
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
          completed seasons the club was in the Premier League (a season in the Championship shows "—", never zero, and so does a club that hasn't played yet this season). Club figures
          have no minimum-minutes floor. This season's club figures count a match once FPL confirms it, a few hours after full
          time, so during a gameweek the league table can be a round behind players' totals. If a player's data couldn't be
          loaded, this season's figures added up from players show "—" (the Data View note says so); results are unaffected.
        </p>
        <p className="page-subtitle">
          <strong>Team Explorer</strong> is a league-table view of that season (position, points, goals for and against, clean
          sheets, xG, xGC, xA and FPL points) with Player Explorer's toolbar and column toolkit, saved views included (up to 5 of
          its own). Columns adds more team metrics
          (played, wins, draws, losses, goal difference, goals, assists, bonus, xGI, defensive contributions), and the "Team name…"
          box searches by name, short name or the club's full name ("Tottenham" finds Spurs). A team's pill, a swatch of its real kit colours where known, opens its Team
          Profile wherever it appears in the app.
          {ext ? ` ${ext.label}'s club figures are in Columns too, in their own colour; see "${ext.guideSection.navLabel}" below.` : ""}
        </p>
        <p className="page-subtitle">
          <strong>Team Profile</strong> shows season totals, the team radars, upcoming fixtures, Points History and the Match Log:
          club figures only, no players (for a club's players, use Player Explorer's Team column). The one exception is this season's
          Formations (an Understat section), which name who has started where. If the club has no matches in the chosen Data View (it wasn't in the Premier League then), the profile says so and suggests one
          it did play in, as the player profile does. The header's position, points and results
          follow the Data View; in Historic Average, position is rounded (two clubs can both be "2nd"), points show one decimal,
          and wins, draws and losses are whole numbers that always add up to the games played. On the Defense radar, more Defensive Contributions counts as better, so a
          dominant side that rarely defends can sit low on that axis.
        </p>
        <p className="page-subtitle">
          <strong>Points History</strong> charts the club's FPL points per season back to 2016/17 (this season as an outlined bar),
          with the same rolling 4-season average as the player profile; older seasons are grey, marked † on hover, and a season
          outside the Premier League has no bar. Click a season's bar to show its matches in the <strong>Match Log</strong> below
          (click this season's bar to come back). The Match Log lists that season's matches, newest first: opponent, home or away,
          score, then the club's FPL points, goals (scored by its players, so excluding opponents' own goals, as in Team Explorer's
          "Goals (excl. OGs)"; Goals For counts every goal), assists, xG, xA, xGI, clean sheet, xGC and defensive contributions, with
          Totals and a per-match Average, coloured against every other club that season. If some matches lack a figure, Totals adds up
          the ones that have it and Average divides by them (hover to see how many). FPL records xG and the rest per player, so
          each match adds up whoever played.
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
          Click a player's name almost anywhere to open it; × or Escape closes it. The "FPL · Views" zone (Actual vs Expected,
          Underlying Numbers, Percentile Radar, Value) follows the analysis mode; Points History, the Match Log and Playing Time
          don't. Section headings are coloured by where their figures come from: green for FPL, violet for Understat, and rose for
          the Match Log when it holds both. The Percentile Radar is position-specific: defenders and midfielders get Defense and Offense radars, goalkeepers
          and forwards one combined radar. Underlying Numbers and Value are coloured green/red against his position.
          Goalkeepers get no Defensive Contribution tiles, since FPL's defensive contributions exclude them. In tables, a figure
          a position can't have (a goalkeeper's Defensive Contributions, an outfielder's saves) is left blank, not 0. Defensive
          Contributions are a count of actions (for defenders clearances, blocks, interceptions and tackles; for midfielders and
          forwards recoveries too), not FPL points.
        </p>
        <p className="page-subtitle">
          The profile has no minutes setting, so its percentiles use the fixed floor (see Analysis modes): only players with 450+
          minutes (90 in Current Season) are ranked. A player under it is a <em>small sample</em>: his radars, Underlying
          Numbers and Value carry an amber stopwatch (hover for the figures) and nothing is coloured. If he has no figures in the chosen mode, the profile suggests
          Data Views that do.
        </p>
        <p className="page-subtitle">
          The <strong>Match Log</strong>, under Points History, is a match-by-match table of one season (a double gameweek is two
          rows): this season, unless you click another season's bar in Points History (click this season's bar to come back).
          Its heading shows the season's price (start → end; today's for this season). Result, then Points, Minutes, Starts,
          Goals, Assists, xG, xA, xGI, Clean Sheets, xGC, Defensive Contributions and BPS (Saves instead of Defensive
          Contributions for a goalkeeper). A match he didn't play shows "—" for its figures. Totals adds up the matches
          listed; Average divides by them, including ones he didn't play. If a match he played lacks a figure, it's left out of both (hover the cell to see how many matches
          it covers). If the season he's showing is under the minutes floor, an amber stopwatch by the season says why Totals
          and Average have no colour. This season's are coloured against his position using this season's figures and the Current Season
          floor, Average per match, so a late signing's strong per-match numbers show green even while his total is low. A past
          season's are coloured the same way against everyone who played in his position that season, with that season's 450-minute
          floor. A column switched to Understat is coloured on Understat's own figures. Match-by-match records go back to 2016/17 (an older season shows FPL's season totals instead); FPL didn't record xG and the rest before 2022/23, or
          defensive contributions before 2025/26, so those show "—". <strong>Playing Time</strong>, a minutes-per-match gauge for
          the season shown, sits at the top of the Match Log. Understat's figures (violet columns, or a column switched with its
          ⇄ toggle) usually arrive a day or so after FPL's, so the latest match can show "—" there for a while; meanwhile
          Understat's Totals and Average cover the matches it has, by the same rule (hover to see how many). "—" always means a
          figure is missing; a cell with nothing to add up by design (Win Chance's Totals, say) is blank.
        </p>
        <p className="page-subtitle">
          <strong>Points History</strong> has a bar per season: green if counted in the average, grey if not, this season as an
          outline. The line is the average of the last 4 completed seasons; top right is the change between the last two. The icons
          underneath are per-season averages of points, minutes, goals and assists (hover for which). A season under 450
          minutes carries the amber stopwatch under its bar, and one outside the 4 seasons a † on hover; neither counts. Click a
          bar for that season's matches in the Match Log below.
        </p>
      </Section>

      <Section id="notepad" title="Notepad">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          A place to jot down ideas, players to watch and figures as you build a team. Press the <kbd>`</kbd> key (top left of the
          keyboard, under Esc) on any page to slide it in from the right; press it again, or Esc, to put it away. The notepad button
          at the top does the same. The page behind stays visible, just dimmed, and you can still scroll and click it while the
          notepad is open, so you can read numbers off a table as you write. The double arrow at the notepad's top left widens it
          to fill the page; press it again to shrink it back to the side.
        </p>
        <p className="page-subtitle">
          Keep separate tabs for separate jobs (a wildcard plan, differentials, transfers for next week): <strong>+</strong> adds a
          tab (up to five at once, with short names of up to 20 characters), double-click a tab (or use the pencil) to rename it, and the bin deletes the tab you're on, asking first if it has
          notes in it. Everything saves as you type and is still there next time you open the app, on this computer only. Because
          the <kbd>`</kbd> key opens and closes the notepad, it can't be typed into a note.
        </p>
        <Try>press <kbd>`</kbd> now, type a note, and press <kbd>`</kbd> again.</Try>
      </Section>

      <Section id="app" title="Opening & updating the app">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Scoutline keeps itself up to date. Each time you open it, it first checks for a new version (a small Opening Scoutline
          window shows if that takes more than a second). If there is one, that window shows the download, then the app closes, a
          small installer window shows its progress, and the app reopens on the new version by itself. With no internet, or a check
          or download that takes too long, it just opens as it is. While it's open it checks again every 10 minutes, and when an
          update is ready it offers to restart into it now or install it the next time you close the app (the installer window
          shows then too; wait for it to finish before opening the app again, or let the next launch install it if you're shutting
          down the computer). If an update ever fails to install, the app opens
          on the version you have and offers the update again later. Without an internet connection (or while FPL's own site is
          down), the app opens on the last data it downloaded, if that's no more than a week old, with a banner saying how old it is. If some of FPL's data can't be loaded at all (the fixture list, say), a banner says what's missing, with Try again.
        </p>
        <p className="page-subtitle">
          If something goes wrong, the app writes down what happened in a log on this computer (it's never sent anywhere). To find
          it, type <code>%APPDATA%\FPL Analytics Dashboard\logs</code> into File Explorer's address bar and open{" "}
          <code>scoutline.log</code>; sharing that file is the quickest way to get a problem looked at.
        </p>
      </Section>

      {extSection && (
        <Section id={extSection.id} title={extSection.title}>
          {extSection.body}
        </Section>
      )}

      <Section id="limitations" title="Data sourcing & known limitations">
        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Club history before 2026/27 comes from a community archive.</strong> The official API's per-season player history
            has no club attribution, and it doesn't serve past seasons' match data at all, so 2016/17–2025/26 club figures were
            backfilled from the vaastav/Fantasy-Premier-League archive (a mirror of FPL's own data). See Team Explorer &amp; Team Profile.
            From 2026/27 on it's archived straight from the official API.
          </li>
          <li>
            <strong>Starts and xG-family stats are placeholder zeros before 2022/23</strong>, shown as "—", <strong>Defensive Contribution before 2024/25</strong>,
            and its parts (<strong>Tackles, CBI, Recoveries</strong>) before 2025/26, confirmed directly against the raw data. Historic Average correctly excludes these rather than diluting an average with a
            fake zero.
          </li>
          <li>
            <strong>Set-piece orders</strong> (penalty, direct free-kick, corner pecking order) are FPL's current list only: FPL keeps no
            history of who was on duty in a past season, so they show today's order in every Data View.
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
            {skippedRecordCounts.fixtures + skippedRecordCounts.clubSeasons > 0 && (
              <p className="page-subtitle">
                Also excluded for invalid data: {skippedRecordCounts.fixtures} fixture(s) and {skippedRecordCounts.clubSeasons} club-season(s). Everything
                else loaded normally.
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
    </SectionsContext.Provider>
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
