import React from "react";
import { useAppState } from "../state/AppStateContext";
import { METRIC_LIST } from "../metrics/dictionary";
import { MIN_QUALIFYING_SEASON_MINUTES } from "../metrics/historicAnalysis";

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
  { id: "underlying-numbers", label: "Underlying Numbers", accent: "var(--accent-value)" },
  { id: "team-building", label: "Team Building", accent: "var(--accent-positive)" },
  { id: "player-comparison", label: "Player Comparison", accent: "var(--accent-focus)" },
  { id: "teams", label: "Teams", accent: "var(--accent-value)" },
  { id: "player-profile", label: "Player Profile", accent: "var(--accent-positive)" },
  { id: "archetypes", label: "Archetypes", accent: "var(--accent-focus)" },
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
          Most sections (Player Explorer, Underlying Numbers, Player Comparison, Teams, Team Detail, the profile) share the same toggle,
          near the top of the page:
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>Last Completed Season</strong> — a player's actual totals from the most recently finished FPL season, however much or
            little they played. No minutes threshold applied — an injury-hit season is real data, not noise, when the question is
            specifically "what happened last season."
          </li>
          <li>
            <strong>Historic Average</strong> — averaged across whichever of the last 4 completed seasons meet a minimum-minutes bar
            (roughly 10 full matches), so one small sample doesn't distort the average.
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
          A snapshot, not a workspace — Top-5 leaderboards split under two colour-coded headings, <strong>Player Summary Statistics</strong>{" "}
          (Points, xGI, Value, Goals Above/Below xG, xGI/£m, Goals + Assists Above xGI) and <strong>Team Summary Statistics</strong> (Team
          Points, Team xGI, Team Clean Sheets), plus gameweek status and a players-tracked count. Click any row to jump straight to that
          player's profile or that team's page.
        </p>
        <Try>Use it as a starting point, not a destination — spot a name in a leaderboard, click through, then dig deeper in Player Explorer or the profile.</Try>
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
          <li><strong>Fit to Box</strong> compresses every visible column to the available width — runs automatically on first load, too.</li>
          <li><strong>Reset Columns</strong> restores the packaged defaults — order, visibility, and width.</li>
          <li><strong>Comparative Colouring</strong> (top right) tints each cell green/red relative to what's currently on screen — turn it off if it's too busy.</li>
          <li>
            The filter bar above the table (search, position, team, min minutes, archetypes) narrows the whole table at once. Every
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
          turn on the archetype filter for "Enabler" or "Budget Option" to narrow further.
        </Try>
      </Section>

      <Section id="underlying-numbers" title="Underlying Numbers">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Charts, not tables — expected-vs-actual scatter plots (xG vs Goals, xA vs Assists, xGI vs Goals+Assists, ICT vs Goals+Assists,
          and a defensive equivalent with a colour-coded third dimension for xGC/90), a Value section (Price vs Points — with gridlines
          at every £0.5m — plus xG/£m and xA/£m leaderboards), and a User Analysis tool for saving your own graphs. Leaderboards that
          already exist on the Dashboard (Points, xGI, Points/£m, xGI/£m, Goals Above/Below xG) aren't repeated here — see the Dashboard
          for those.
        </p>
        <p className="page-subtitle">
          <strong>Expected vs Actual</strong>, <strong>Value</strong>, and each graph inside <strong>User Analysis</strong> each carry
          their own analysis-mode toggle and search/filter bar — changing one section's (or one saved graph's) toggle, search, position,
          team, archetype, or minutes filter only ever recomputes that section's own charts and summary tiles, never another section's.
          Setting Value's toggle to Historic Average, say, has no effect on Expected vs Actual's charts or "Top xG"/"Top xA" tiles above
          it, and vice versa.
        </p>
        <p className="page-subtitle">
          <strong>Thematic Analysis</strong>, further down the page, is deliberately built outside the Last Completed Season / Historic
          Average / Current Season toggle everything above uses — it needs a genuine multi-season time series, which that single-season
          toggle can't represent. It shows average points by position and by price tier across every season where a player cleared the
          same {MIN_QUALIFYING_SEASON_MINUTES}-minute bar used everywhere else historic averages are computed; price tier uses each
          season's own price (not today's), and position uses each player's current position, since this app has no record of
          historical position changes — a position-switcher's older seasons are grouped under where they play now. It doesn't re-run
          the full percentile-based archetype system against past seasons — that's a materially bigger undertaking than this chart, so
          it isn't attempted here. (<strong>Player Trends</strong>, which uses the same multi-season data, now lives under Player
          Comparison, further down this guide.)
        </p>
        <p className="page-subtitle">
          Two of the five expected-vs-actual charts intentionally have no dashed reference line, for different reasons. <strong>ICT Index
          vs Goals + Assists</strong>: ICT is a composite influence/creativity/threat score on its own scale, not the same unit as
          Goals + Assists, so a 45° "expected output" line would be meaningless — it shows pattern and correlation only.{" "}
          <strong>Defensive Contribution/90 vs Defensive Reward/90</strong> is the other, for the reason spelled out below.
        </p>
        <p className="page-subtitle">
          <strong>User Analysis</strong> starts empty — nothing is created for you. Click <strong>+ Add Graph</strong> and pick a name, a
          graph type (a Scatter Plot comparing two metrics, or a Bar Chart ranking the top 15 players by one), and the metric(s) to plot,
          then Create (or Cancel to back out without saving anything). Up to 5 graphs can be saved at once, kept in your browser for
          future visits; each gets its own analysis-mode toggle and filter bar, and a Remove button on its own card. An arbitrary pair of
          metrics usually isn't an expected-vs-actual relationship, so a scatter graph here never draws a 45° reference line.
        </p>
        <p className="page-subtitle">
          <strong>Defensive Contribution/90 vs Defensive Reward/90</strong> is the hardest of the five to read honestly, so it's spelled
          out here: the x-axis is the qualifying-action rate that earns Defensive Contribution points (CBIT for defenders, CBIRT for
          midfielders/forwards) — capped at 2 points per match, so the rate doesn't convert to points linearly. The y-axis is
          clean-sheet points/90 plus <em>total</em> bonus/90 — bonus isn't isolated to defensive actions specifically, since goals,
          assists, clean sheets and saves all feed the same Bonus Points System, so treat it as a proxy, not an attribution. Dot colour
          is Expected Goals Conceded/90 (green = tighter expected defence, red = leakier), scaled to the range actually present in the
          current view. Goalkeepers are excluded, since the Defensive Contribution mechanic doesn't apply to them, and in historic
          modes, seasons before 2024/25 (when the FPL API started tracking it) are excluded from the average rather than diluting it
          with an untracked zero.
        </p>
        <Try>Click any dot on a chart to open that player's profile directly — the charts aren't just for looking, they're a navigation shortcut too.</Try>
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
            player's card shows their live price, ownership, minutes reliability, next-fixture ticker, and Expected Points for the
            window selected in the Add Players table below (captain's points shown doubled).
          </li>
          <li>
            The squad status line above the pitch shows size, budget, composition, and any club-limit breach — budget only ever turns
            red as a warning when you've gone over £100m, it never stops you adding a player. Nothing here is a hard money constraint;
            trim the squad back down whenever you're ready.
          </li>
          <li>
            The <strong>Add Players table</strong> has the same reorder/resize/sort/filter/Fit-to-Box/Export-CSV toolkit as Player
            Explorer, split into two independently-toggled groups: <strong>Predictive</strong> (Exp. Points for the Next 1/3/5 GW
            toggle, plus Minutes Reliability and a fixture ticker — governed by that same window) and <strong>Historic/Raw</strong>{" "}
            (its own Last Completed Season / Historic Average / Current Season toggle) — the two can't be reordered into each other,
            marked by the vertical divider line. Price and club-limit rules always use today's real price and current club, regardless
            of any toggle.
          </li>
        </ul>
        <Try>Sort the Add Players table by "Exp. Pts (Overall Average)" for a blended view, or by "Minutes Reliability" if durability matters more to you than ceiling.</Try>
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
          Points/90, Goals, Assists, xG, xA, xGI, Minutes) — every player×metric combination gets its own line, coloured by player and
          dashed by metric, labelled in the legend as "Player — Metric" once there's more than one of each. A Normalise toggle (on by
          default) independently scales each metric to 0–100 across the values on screen, which is what makes overlaying metrics on
          very different scales (Minutes vs xG, say) actually readable. No minutes threshold on any of this — a quiet or injury-hit
          season is real data worth seeing, not noise to filter out — and xG/xA/xGI show as a gap for seasons before FPL tracked
          expected stats, not as zero.
        </p>
      </Section>

      <Section id="teams" title="Teams &amp; Team Detail">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Teams aggregates every club's <em>current</em> squad — a transferred player's full total goes to their new club here, not the
          one they earned it at, which the banner on that page states explicitly every time. Sortable like every other table here, with
          a "Player Rankings" shortcut next to each club name that jumps straight into Player Explorer pre-filtered to that team. Team
          Detail (click through from a team name) shows that club's individual players.
        </p>
      </Section>

      <Section id="player-profile" title="Player Profile">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Click a player's name almost anywhere in the app to open it. Actual Output, Underlying Performance, and Value cards resolve
          per the active analysis mode; Career History, Playing-Time Indicators, and This Season are unaffected by that toggle — Career
          History always shows every prior season on record plus this season in progress (marked "(live)", sourced from live data
          rather than a completed season's record), and the other two are always live. The Percentile Radar chart is position-specific —
          a goalkeeper's axes share almost nothing with a forward's — and also resolves per mode. Archetype badges and the "Compare"
          link (into Player Comparison, pre-filled) sit alongside.
        </p>
        <p className="page-subtitle">
          <strong>This Season</strong> is a gameweek-by-gameweek breakdown of the live season — one row per gameweek played, opponent
          and result, points, minutes, starts, and the same attacking/defensive/expected-stats columns used everywhere else in this app
          (goals, assists, xG, xA, xGI, clean sheets, goals conceded, xGC, tackles, clearances/blocks/interceptions, recoveries,
          Defensive Contributions, cards, saves, penalties, BPS), plus a Totals row and a Per 90 row for the expected-stats columns.
          The table scrolls horizontally — there are more columns than fit on screen at once. Sourced from the same element-summary
          request as Career History and Playing-Time Indicators, so it shares their loading/error state.
        </p>
      </Section>

      <Section id="archetypes" title="Archetypes">
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Rule-based labels, never predictions — a player either meets a stated condition or doesn't. A price tier (Premium/Mid-priced/
          Budget) plus zero or more of the following, all thresholds centralised in one place so they can't drift between components.
          Price tier always uses today's real price, even in a Historic Average or Last Completed Season view elsewhere on the same
          page — so the tier next to a player never disagrees with the price shown right beside it.
        </p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li><strong>Enabler</strong> — budget price and a strong blended minutes-reliability track record.</li>
          <li><strong>High-upside Attacker</strong> — MID/FWD with elite Goals+Assists for their position.</li>
          <li><strong>High-xGI Defender</strong> — DEF with elite attacking threat (xGI/90).</li>
          <li><strong>Strong Underlying Attacker</strong> — any position with strong (not necessarily elite) xGI/90.</li>
          <li><strong>High-clean sheet Defender</strong> — DEF with an elite (tightest) expected-goals-conceded rate.</li>
          <li><strong>High def con Defender</strong> — DEF with elite Defensive Contributions/90.</li>
          <li><strong>Influential Player</strong> — any position with elite ICT Index.</li>
          <li><strong>Rounded Midfielder</strong> — MID strong in both Defensive Contributions/90 and xGI/90 at once.</li>
          <li><strong>Goals Above/Below xG</strong> — currently over- or under-performing their expected goals.</li>
        </ul>
        <p className="page-subtitle" style={{ margin: 0 }}>
          Exact price/percentile cutoffs are in the metric reference below. Filter by archetype in Player Explorer's filter bar or Team
          Building's picker.
        </p>
      </Section>

      <Section id="limitations" title="Data sourcing & known limitations">
        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13 }}>
          <li>
            <strong>No historic team-level data.</strong> The API's per-season player history has no club attribution at all — there's no
            way to know which team a player was at for a past season, so "what did this club do in 2022/23" can't be reconstructed
            accurately. Teams' current-squad aggregate sidesteps this by design (see the banner on that page) rather than guessing.
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
                {skippedPlayerCount} player record(s) were excluded for referencing an unknown team or position id and could not be
                normalised.
              </p>
            )}
          </div>
        )}

        {validationReport && (
          <div style={{ marginBottom: 20 }}>
            <SubHeading>Per-90 &amp; xGI Cross-Check (development validation)</SubHeading>
            <p className="page-subtitle" style={{ marginBottom: 6 }}>
              For every API-supplied per-90 metric and xGI, this app independently recomputes the value from raw totals ÷ minutes × 90
              and compares it against the API-supplied value (tolerance 0.01). The API-supplied value is always what's displayed — this
              check exists purely to surface discrepancies rather than conceal them.
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
