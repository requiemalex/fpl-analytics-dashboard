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
  price_change_percent: "Price Change Predictor — live % (price_change_percent)",
  price_change_projections: "Price Change Predictor — Today/Tomorrow/Day After (price_change_projections)",
  price_change_calibrating: "Price Change Predictor — calibrating flag (price_change_calibrating)",
};

/**
 * One source of truth for section nav, numbering, and colour — the "On
 * this page" chips and each section's own heading both read from this,
 * so they can't drift out of sync with each other. Colours cycle
 * through the app's four existing accent tokens (no new ones added);
 * "limitations" deliberately gets the negative/warning colour, since
 * that's what the section actually is.
 */
const SECTION_META = [
  { id: "overview", label: "Overview", accent: "var(--accent-focus)" },
  { id: "modes", label: "Analysis modes", accent: "var(--accent-value)" },
  { id: "dashboard", label: "Dashboard", accent: "var(--accent-positive)" },
  { id: "player-explorer", label: "Player Explorer", accent: "var(--accent-focus)" },
  { id: "team-building", label: "Team Building", accent: "var(--accent-positive)" },
  { id: "player-comparison", label: "Player Comparison", accent: "var(--accent-focus)" },
  { id: "teams", label: "Teams", accent: "var(--accent-value)" },
  { id: "player-profile", label: "Player Profile", accent: "var(--accent-positive)" },
  { id: "limitations", label: "Data sourcing & known limitations", accent: "var(--accent-negative)" },
  { id: "metric-reference", label: "Metric reference", accent: "var(--accent-value)" },
];

function sectionMeta(id: string) {
  const index = SECTION_META.findIndex((s) => s.id === id);
  return { number: index + 1, accent: SECTION_META[index]?.accent ?? "var(--accent-focus)" };
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const { number, accent } = sectionMeta(id);
  return (
    <div className="card" id={id} style={{ marginBottom: 22, scrollMarginTop: 16, borderLeft: `3px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 7,
            background: accent,
            color: "#0a0f0c",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 11.5,
            flexShrink: 0,
          }}
        >
          {String(number).padStart(2, "0")}
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: accent }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Try({ children }: { children: React.ReactNode }) {
  return (
    <div className="banner info" style={{ marginTop: 10 }}>
      <strong>Try it:</strong> {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  const accent = sectionMeta("metric-reference").accent;
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 13,
        fontWeight: 700,
        color: accent,
        borderLeft: `2px solid ${accent}`,
        paddingLeft: 8,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
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
            What every section does, where its data comes from, and how to actually use it. Nothing here is fabricated or silently
            substituted — where a number can't be trusted, the app says so rather than guessing.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title">On this page</div>
        <div className="chip-row">
          {SECTION_META.map((c) => (
            <a
              key={c.id}
              className="chip"
              href={`#${c.id}`}
              style={{ textDecoration: "none", borderColor: c.accent, color: c.accent }}
            >
              {c.label}
            </a>
          ))}
        </div>
      </div>

      <Section id="overview" title="Overview">
        <p className="page-subtitle" style={{ margin: 0 }}>
          This is an FPL scouting dashboard built on the official Fantasy Premier League API — no manual data entry, no third-party
          estimates passed off as fact. Two data sources feed almost everything: the live <code>bootstrap-static</code> snapshot (today's
          prices, ownership, current-season stats, fixtures) and a bulk fetch of every player's season-by-season history
          (<code>element-summary</code>'s <code>history_past</code>), used for the historic modes described below.
        </p>
        <p className="page-subtitle">
          One important asymmetry to know up front: every section of this app is <strong>descriptive</strong> — it tells you what has
          actually happened, never what will — except Team Building, which is explicitly built to predict. That's a deliberate,
          disclosed exception, not an inconsistency; that section's own guide below explains exactly what it predicts and how.
        </p>
      </Section>

      <Section id="modes" title="Analysis modes: Last Completed Season / Historic Average / Current Season">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Most sections (Dashboard, Player Explorer, Player Comparison, Teams, Team Profile, the player profile) show the
          same toggle near the top of the page — the options are identical everywhere, but each page's toggle is independent: changing
          one page's mode (or its Search/Position/Team/Min Minutes criteria, where a page has that too) never changes what any other
          page shows. Switching Player Explorer to Historic Average, for instance, has no effect on the Dashboard open in another tab:
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Last Completed Season</strong> — a player's actual totals from the most recently finished FPL season, however much or
            little they played. No minutes threshold applied — an injury-hit season is real data, not noise, when the question is
            specifically "what happened last season."
          </li>
          <li>
            <strong>Historic Average</strong> — averaged across every one of the last 4 completed seasons a player has, light or
            injury-hit ones included: excluding a bad season used to flatter the average by only ever counting the good ones, so it no
            longer filters by minutes at all here (a separate, much narrower minutes bar still exists just to flag a season as "light"
            in the Career History chart, and for Expected Points' own forward-looking reliability check).
          </li>
          <li>
            <strong>Current Season</strong> — this season's live figures. Pre-season, or before a player's team has played, the
            cumulative fields (points, goals, minutes, etc.) genuinely are zero — not a placeholder, an honest zero, since no games have
            been played yet. Price, ownership, and availability status are always live regardless of which mode is selected.
          </li>
        </ul>
        <p className="page-subtitle" style={{ margin: 0 }}>
          One thing that deliberately never changes: a player's name, team, and price shown together in an identity line (like Player
          Explorer's leftmost column) always uses today's real price, in every mode — comparing a past season's output against today's
          price would be a mismatched, misleading pairing. Explicit Price <em>columns</em> you add yourself are a different thing, and
          correctly still resolve per mode.
        </p>
      </Section>

      <Section id="dashboard" title="Dashboard">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          A snapshot, not a workspace — fully customisable Top-5 leaderboard tiles, plus a set of summary graphs underneath. A{" "}
          <strong>Players / Teams</strong> toggle (top right) switches which set of tiles and graphs is on screen. Click any row or
          chart point to jump straight to that player's profile or that team's page.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Default is fixed</strong> — the original tile/graph layout is itself just a saved view named "Default" (one each
            for Players/Teams), always there in the dropdown to come back to. It can't be deleted, and while it's selected nothing in
            it can be added to or removed either, so there's always exactly one unmodified layout to fall back on.
          </li>
          <li>
            <strong>Create View</strong> (the icon next to the dropdown) starts a new, blank, named view and switches to it
            immediately — from there the + cards at the end of the tile grid and the graph grid add tiles/graphs to it one at a
            time; each one's own pencil icon edits it and its bin icon removes it. Every change saves itself as you make it, so there's nothing
            separate to save and nothing lost by switching views, tabs, or closing the app — up to 5 views each for Player and Team.
            Picking a different view from the dropdown loads it immediately, replacing the live tiles and graphs for that scope only;
            the other scope is untouched.
          </li>
          <li>
            <strong>Data View and criteria, per tile</strong> — a Player Tile picks its own Last Completed Season / Historic Average /
            Current Season, and its own Search/Position/Team/Min Minutes criteria, when it's created in the add-tile dialog — not one
            shared setting for the whole page, so two tiles can watch completely different slices of the player pool side by side. The
            data view shows as a small <code>LS</code>/<code>HA</code>/<code>CS</code> badge in the tile's header (hover for the full
            name). Min Minutes applies in every data view, Current Season included — it starts at 0, so raise it as the season goes on
            if you only want regular starters (e.g. 270 for three full games). Team Tiles aggregate a club's whole squad (or, for league-standing metrics like League Position,
            Wins, and Goals Against, this season's real table — see below) and have no criteria of their own. Every tile can also be
            given a custom name in the same dialog — leave it blank to keep the auto-generated "Top/Bottom 5 — &lt;statistic&gt;"
            title.
          </li>
          <li>Each row's bar shows its value's size relative to the other rows in that tile — green/red by above/below-expected for the three "vs xG/xA/xGI" tiles, one flat colour for everything else.</li>
        </ul>
        <p className="page-subtitle">
          <strong>Graphs</strong>, below the tile grid (past the divider), work the same way tiles do — built via{" "}
          <strong>+ Add Graph</strong>, and changed later with the pencil icon in the graph's header (which reopens the same dialog
          with its current settings). Pick a name, a chart type (a <strong>Scatter Plot</strong> comparing two metrics, or a{" "}
          <strong>Bar Chart</strong> ranking the top 15 by one), the metric(s) to plot from the full Player Explorer/Team metric
          catalogue, a Data View, and — for a scatter graph — whether to draw a dashed 45° trend line (the <strong>Add Trend Line</strong>{" "}
          icon; it marks where X and Y are equal, so it's meaningful only when they're on the same scale, e.g. an expected-vs-actual
          pair like xG and Goals; leave it off for anything else, like Price vs Points). A Player Graph can be scoped the same two ways
          a Player Tile can — Filters, or up to 5 specific players via Player Search — and a Team Graph the same way a Team Tile can —
          All Teams, or up to 5 specific teams via Team Selection.
        </p>
        <p className="page-subtitle">
          The packaged default graphs carry over the most broadly useful charts from the old Underlying Numbers page: for Players,{" "}
          <strong>xG vs Goals</strong> and <strong>xA vs Assists</strong> (both with the reference line on, showing finishing/creativity
          over- or under-performance) and <strong>Price vs Points</strong> (no reference line — price and points aren't on a
          comparable scale); for Teams, <strong>Team xG vs Goals</strong> and <strong>Team xGC vs Goals Against</strong>, the same
          idea applied to each club. The default Player graphs only include players with at least 900 minutes in the
          graph's Data View — without that floor, hundreds of fringe players pile up at zero and hide everyone else. Graphs without
          the reference line fit their axes to the data's own range (so Price vs Points starts near £4m, not £0).
        </p>
        <p className="page-subtitle">
          Every scatter graph also follows a few automatic rules so any pair of metrics stays readable. Each axis runs from just below
          its lowest value to just above its highest, rather than from 0 by default — clubs concede between roughly 27 and 58 goals a
          season, so that's what the axis shows — and starts at 0 only when the data is already close to it. If one axis is five or
          more times the size of the other (Price against Points, or a club's xG against its FPL points), the reference line is left
          out even if it was ticked — it would squash the smaller metric into a sliver — and a note under the chart says so. And if
          most points are crammed into a narrow band of an axis by a few big values (most players cost £4.5–6m while a handful cost
          £10m+; most players score 0–3 goals while a few score 20+), that axis is stretched onto a log scale (or a square-root one, if
          it has zeros) to spread the crowd out; the axis title says "(log scale)" or "(√ scale)", and hovering a point always shows
          its real values. On a graph with the reference line, both axes always share the same range and stretch, so the line keeps
          meaning "exactly as expected".
        </p>
        <p className="page-subtitle">
          The old page's Thematic Analysis charts (average points by position/price tier across
          every season on record) deliberately aren't among them — they're genuine multi-season time series, not a single-analysis-mode
          metric-vs-metric graph, so they don't fit this per-graph model and were retired rather than forced in.
        </p>
        <p className="page-subtitle">
          Every team metric is a <em>club</em> figure for the season(s) the tile or graph's own Data View picks — see Teams &amp; Team
          Profile below. That includes the results: a team tile set to Last Completed Season shows that season's final{" "}
          <strong>League Position</strong>, <strong>League Points</strong>, <strong>Goals For/Against</strong> and so on, not today's
          table.
        </p>
        <Try>Use it as a starting point, not a destination — spot a name in a leaderboard or an outlier on a chart, click through, then dig deeper in Player Explorer or the profile.</Try>
      </Section>

      <Section id="player-explorer" title="Player Explorer">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          The full player database as one customisable table. Every column comes from the same shared list used across the app (also
          what powers Player Comparison and Team Building's Historic/Raw columns), so a metric means the same thing everywhere it
          appears.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li><strong>Reorder</strong> — drag a column header. <strong>Resize</strong> — drag its right edge.</li>
          <li>
            <strong>Sort</strong> — click a header; shift-click another to add a secondary tiebreaker. A blank (—) is treated as lower
            than any real value here, not always parked at the end — so it appears first ascending, last descending, like any other low
            number would.
          </li>
          <li>
            <strong>Filter</strong> — click the ▾ on a header's edge for an Excel-style filter (Less than or equal to / Greater than or
            equal to / Equal to). Confirm with Enter, discard with Cancel.
          </li>
          <li>Column widths auto-fit the table to the available space — on load and whenever the visible columns change.</li>
          <li><strong>Reset Columns</strong> restores the packaged defaults — order, visibility, and width.</li>
          <li><strong>Comparative Colouring</strong> tints each cell green/red relative to what's currently on screen.</li>
          <li>
            The filter bar above the table (search, position, team, min minutes) narrows the whole table at once. Every
            other column — Starts, Own%, Price, and the rest — has its own filter (click the ▾ icon on that column's header) with
            ≤/≥/= fields, so narrowing by ownership or price range happens at the column, not up here. Player-name search (here, in
            Team Building's Add Players table, and in the search-and-add boxes on Player Comparison and Player Trends) is
            accent-insensitive (typing "odegaard" or "salah" finds "Ødegaard" or "Salah" either way), matches first and last name in
            any order (so "fernandes bruno" finds Bruno Fernandes, not just "bruno fernandes"), and tolerates small typos on longer
            names.
          </li>
          <li><strong>Export CSV</strong> downloads exactly what's on screen — the same rows and visible columns, in the same order, with the same formatted values.</li>
          <li>
            <strong>Next 5 Fixtures</strong> (off by default — enable it in the Columns picker) is the same fixture-ticker column Team
            Building's Add Players table has, copied over here for the same at-a-glance planning use. Always the player's live team's
            actual upcoming fixtures, regardless of the analysis-mode toggle above — moving fixtures between seasons wouldn't mean
            anything, same reasoning as price and ownership staying live everywhere.
          </li>
        </ul>
        <Try>
          Looking for undervalued midfielders? Set Position to MID, add the "Points/£m" column, click its header to sort descending, and
          use the Price column's own ▾ filter to cap it at a budget you're working within.
        </Try>
      </Section>

      <Section id="team-building" title="Team Building — the one predictive section">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Everywhere else in this app describes what's already happened. Team Building is different on purpose: it's about picking a
          squad for the season ahead. No squad is loaded by default — use <strong>New Squad</strong> to either create a blank template
          (just give it a name) or import a real squad by its FPL team ID (the number in your team's own FPL web address — Pick Team →
          Gameweek History shows it in the URL); importing is a read-only, unauthenticated request to FPL's own public data for that
          team (no login, nothing written back), and chip usage history comes along with it automatically. The <strong>Add Players</strong>{" "}
          table and everything else on the page stays hidden until a squad is loaded or created. You can have up to 5 saved squads at
          once — New Squad tells you if you're at that limit, so delete one first if you need another.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Delete</strong> asks you to confirm the squad's name before removing it — there's no undo, so make sure it's the
            right one.
          </li>
          <li>
            The <strong>pitch view</strong> is drag-and-drop: drag a player from the Add Players list onto the pitch or bench, drag a
            card onto another to swap it, click a player's name for their profile, click <strong>Captain</strong>/<strong>Vice-Captain</strong>{" "}
            then a starting player to assign that role, and <strong>Clear Draft</strong> empties the whole squad in one click. Each
            player's card shows their live price, ownership, minutes reliability, next-fixture ticker, and two Expected Points
            figures — captain's points shown doubled on both.
          </li>
          <li>
            The <strong>GW+1..GW+5 navigator</strong> above the pitch picks which of a player's next five upcoming fixtures both
            Expected Points figures — on the pitch cards and in the Add Players table below — currently estimate. This is each
            player's own <em>Nth upcoming fixture</em>, not a calendar gameweek number: a blank gameweek simply has no fixture to
            select, and a double gameweek's two fixtures both show up as consecutive steps.
          </li>
          <li>
            Two independent Expected Points figures, side by side, deliberately not blended into one number: <strong>FPL Official</strong>{" "}
            is FPL's own published `ep_next` prediction (extended to fixtures beyond the very next one using real fixture-difficulty
            data). <strong>Model Predicted</strong> is this app's own estimate, built entirely independently — from live per-90 stats
            (xG, xA, xGC, defensive contribution, saves) and FPL's actual scoring rules, never looking at FPL's own prediction at all.
            Hover the Model Predicted figure for the specific caveats behind it — it's a genuinely useful second opinion, not a
            replacement for the official one, and is measurably rougher for goalkeepers and for popular "nailed-on" picks specifically
            (see README for the full backtest).
          </li>
          <li>
            The squad status line above the pitch shows size, budget, composition, and any club-limit breach — budget only ever turns
            red as a warning when you've gone over £100m, it never stops you adding a player. Nothing here is a hard money constraint;
            trim the squad back down whenever you're ready.
          </li>
          <li>
            The <strong>Add Players table</strong> has the same reorder/resize/sort/filter/Export-CSV toolkit as Player
            Explorer, split into two independently-toggled groups: <strong>Predictive</strong> (the two Expected Points columns above,
            plus Minutes Reliability and a fixture ticker) and <strong>Historic/Raw</strong> (its own Last Completed Season / Historic
            Average / Current Season toggle) — the two can't be reordered into each other, marked by the vertical divider line. Price
            and club-limit rules always use today's real price and current club, regardless of any toggle.
          </li>
        </ul>
        <Try>Sort the Add Players table by "Exp. Pts (Model Predicted)" and compare it to the "FPL Official" column for the same players — where they disagree most is usually worth a second look.</Try>
      </Section>

      <Section id="player-comparison" title="Player Comparison">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Compare up to 5 players side by side across every Player Explorer metric, plus a percentile radar chart per player underneath.
          The colour scale is better/worse (not just higher/lower) — price, ownership, and xGC are inverted since a lower number is the
          better one for those three specifically. A Summary card counts how many metrics each player leads on, stated plainly as a
          mechanical count, not a weighted verdict.
        </p>
        <Try>Add two players you're deciding between, then check whether the "leads on more metrics" summary agrees with your gut — if it doesn't, that's worth investigating why.</Try>
        <p className="page-subtitle">
          <strong>Player Trends</strong>, beneath the comparison table and radar charts, is a separate tool with its own player
          selection — it isn't tied to the 5 players compared above. It's deliberately built outside the Last Completed Season /
          Historic Average / Current Season toggle: it needs a genuine multi-season time series, which that single-season toggle can't
          represent. Starts empty — add up to 5 players via the search box — and plots them against up to 3 metrics at once (Points,
          Goals, Assists, xG, xA, xGI, Minutes) — every player×metric combination gets its own line, coloured by player and
          dashed by metric, labelled in the legend as "Player — Metric" once there's more than one of each. A Normalise toggle (on by
          default) independently scales each metric to 0–100 across the values on screen, which is what makes overlaying metrics on
          very different scales (Minutes vs xG, say) actually readable. No minutes threshold on any of this — a quiet or injury-hit
          season is real data worth seeing, not noise to filter out — and xG/xA/xGI show as a gap for seasons before FPL tracked
          expected stats, not as zero.
        </p>
      </Section>

      <Section id="teams" title="Teams &amp; Team Profile">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Team analysis is always <em>what the club did</em> in a given season — whoever was playing for it at the time — never what its
          current players did elsewhere. Every figure comes from a match-by-match record of which club each player was playing for in
          each game, so a summer signing's previous season stays with his previous club, and a player who leaves mid-season keeps
          what he did for the club counted for it. "What would this new signing bring?" is player analysis — look at him in Player
          Explorer or his profile. The Data View picks the season: Current Season, the Last Completed Season, or a Historic Average
          over the last four completed seasons (only the ones the club was actually in the Premier League — a promoted club shows "—"
          for a season it was in the Championship, never zero).
        </p>
        <p className="page-subtitle">
          Teams is a league-table view of that season — position, points, goals for and against, clean sheets, xG, xGC, xA and FPL
          points scored — sortable like every other table here, with a "Player Rankings" shortcut next to each club name that jumps
          straight into Player Explorer pre-filtered to that team. A team's coloured pill — here, in the Team Profile, and on the
          Dashboard's team tiles — is clickable anywhere it appears in the app and opens that club's Team Profile: season totals, the
          team radars, upcoming fixtures, and the current squad with what each player did <em>for this club</em> in the selected
          season (a new signing shows "—" for last season), with its own "Player Rankings" link through to Player Explorer for the
          full sortable table. It's a two-colour swatch of that club's real primary and secondary kit colours where known, so same-coloured
          clubs (several Premier League sides share red or blue as a primary) are still distinguishable at a glance.
        </p>
        <p className="page-subtitle">
          <strong>FPL Points History</strong>, below the squad table, is the same bar-chart idea as the player profile's Career
          History, applied to the club: each bar is the FPL points scored for that club in that season, including this one in
          progress (dashed), back to 2016/17. The average line/figure uses the same rolling 4-season window the player profile does —
          a season older than that draws muted-grey rather than counting toward the average. Seasons the club wasn't in the Premier
          League simply have no bar.
        </p>
        <p className="page-subtitle">
          Where the club record comes from: the official FPL API only serves the current season's match-by-match data and wipes it
          every summer, so 2016/17 to 2025/26 were filled in once from a well-known community archive of FPL's own data (checked
          against FPL's official season totals, and every match's goals against its real score). From 2026/27 on, the app keeps its
          own copy straight from the official API, saved twice a week through the season. Club xG, xA and xGC exist from 2022/23
          (when FPL started tracking them); club Defensive Contributions exist for 2025/26 on.
        </p>
      </Section>

      <Section id="player-profile" title="Player Profile">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Click a player's name almost anywhere in the app to open it. The profile is split into two zones: "Views" (Actual vs
          Expected, Underlying Numbers, Percentile Radar, Value) resolves per the active analysis mode, while "Live Data" (Current
          Season Log, Playing Time, Career History) always shows today's actual figures regardless of that toggle — Career History
          always shows every prior season on record plus this season in progress (marked "(live)", sourced from live data rather than a
          completed season's record). The Percentile Radar chart is position-specific — a goalkeeper's axes share almost nothing with a
          forward's — and also resolves per mode. Defenders and midfielders get two radars ("Defense" and "Offense"), since both facets
          genuinely drive their points; goalkeepers and forwards keep one combined radar. A "Compare" button in the header links into
          Player Comparison, pre-filled. Every figure in Underlying Numbers and Value is also lightly tinted green/red — same idea as
          Player Explorer's Comparative Colouring, but relative to this player's percentile against others in their own position
          (the same population the Percentile Radar uses) rather than a visible table's rows.
        </p>
        <p className="page-subtitle">
          <strong>Current Season Log</strong> is a gameweek-by-gameweek breakdown of the live season, split into two stacked tables —
          "Prime" and "Supplements" — each repeating GW/Opponent/Result so it stands alone. Prime covers Points, Minutes, Starts,
          Goals, Assists, xG, xA, xGI, Clean Sheets, xGC, Defensive Contributions, Saves, BPS; Supplements covers Goals Conceded,
          Tackles, Clearances/Blocks/Interceptions, Recoveries, Own Goals, Penalties Saved, Penalties Missed, Yellow Cards, Red Cards. A
          goalkeeper's row swaps Defensive Contributions out for Saves and Penalties Saved (the only position that can record either);
          every other position doesn't get those two columns at all, rather than a column that can only ever read zero. Each table gets
          its own Totals row and Average row (total ÷ gameweeks played so far). Both tables scroll horizontally if needed. Sourced from
          the same element-summary request as Career History and Playing Time, so they share its loading/error state. Prime's Totals
          and Average rows are also tinted green/red — this player's percentile against others in their own position, live-season
          figures only, same as Underlying Numbers/Value above. Supplements stays untinted — those more granular defensive/discipline
          stats are only ever tracked per-gameweek for one player at a time, so there's no real population to compare them against.
          <strong> Playing Time</strong> — the minutes-per-gameweek gauge, with completed-gameweeks and average-minutes spelled out next
          to it — sits below both tables and above Career History.
        </p>
        <p className="page-subtitle">
          Career History's season-by-season table (the chevron below the chart) is tinted the same green/red way, but relative to this
          player's own other seasons shown in the table, not the wider player pool — there's no "other players" comparison for a
          single player's career.
        </p>
      </Section>

      <Section id="limitations" title="Data sourcing & known limitations">
        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Club history before 2026/27 comes from a community archive.</strong> The official API's per-season player history
            has no club attribution, and it doesn't serve past seasons' match data at all, so 2016/17–2025/26 club figures were
            backfilled from the vaastav/Fantasy-Premier-League archive (a mirror of FPL's own data) — see Teams &amp; Team Profile.
            From 2026/27 on it's archived straight from the official API.
          </li>
          <li>
            <strong>xG-family stats are placeholder zeros before 2022/23</strong> and <strong>Defensive Contribution before 2024/25</strong> —
            confirmed directly against the raw data. Historic Average correctly excludes these rather than diluting an average with a
            fake zero.
          </li>
          <li>
            <strong>Set-piece order data exists</strong> in the API (penalty/free-kick/corner pecking order) but isn't surfaced in this
            app yet.
          </li>
          <li>
            <strong>No predicted-lineup data exists anywhere in the FPL API</strong> — that's third-party editorial judgement on other
            sites, not something this dashboard could source honestly.
          </li>
          <li>Ownership has no historic equivalent at all — it always shows today's live figure, in every mode, clearly labelled as such.</li>
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
                          <span className="value-negative">No — displayed as — throughout the app</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {skippedPlayerCount > 0 && (
              <p className="page-subtitle">
                {skippedPlayerCount} player record(s) were excluded — either invalid/missing required data, or a reference to an
                unknown team or position id — and could not be normalised.
              </p>
            )}
          </div>
        )}

        {validationReport && (
          <div style={{ marginBottom: 20 }}>
            <SubHeading>xGI Cross-Check (development validation)</SubHeading>
            <p className="page-subtitle" style={{ marginBottom: 6 }}>
              This app independently recomputes xGI as xG + xA and compares it against the API-supplied value (tolerance 0.01) — the
              API-supplied value is always what's displayed, this check exists purely to surface discrepancies rather than conceal
              them. This used to also cross-check the live API's own per-90 fields (xG/90, xA/90, etc.) against a recomputed rate;
              retired alongside the app-wide move from per-90 to per-game metrics, since this app no longer reads or surfaces FPL's
              raw per-90 figures at all for those fields.
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
          <SubHeading>FPL API — Supplied Directly</SubHeading>
          <MetricTable metrics={apiMetrics} />
        </div>

        <div>
          <SubHeading>Derived — Calculated by This App</SubHeading>
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
                {m.availabilityNote} {m.caveats ? `— ${m.caveats}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
