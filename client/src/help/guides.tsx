import React from "react";
import { AnalysisModeIcon } from "../components/AnalysisModeIcon";
import {
  ColumnsIcon,
  ComparativeColourIcon,
  CreateViewIcon,
  DownloadIcon,
  EditIcon,
  FilterIcon,
  NotepadIcon,
  PlusIcon,
  ResetIcon,
  SavedViewsIcon,
  TrashIcon,
  TrendLineIcon,
} from "../components/IconToolbar";
import { HideSmallSamplesIcon, MinutesFloorIcon } from "../components/MinutesFloorBadge";
import { NOTEPAD_KEY } from "../components/Notepad";
import { DataHealth } from "./DataHealth";
import { MORE_HELP_GUIDES } from "./moreGuides";
import { TOPIC } from "./topics";
import type { HelpGuide } from "./types";
import {
  Chips,
  ColourScale,
  Figures,
  Flow,
  HeaderKey,
  HoverExample,
  IconKey,
  Key,
  Label,
  Note,
  Points,
  SeasonBars,
  SeasonStrip,
  Steps,
  Swatches,
  Terms,
  TwoWays,
} from "./visuals";

/**
 * <help_guides>: the app's Help, one short guide per question (FPL's; a
 * second source adds its own through extensions/externalStats.ts). Keep
 * each to its one-line answer, a visual, and a few short points; put the
 * effort into `keywords` instead — every word or phrase someone might type
 * for it. help/search.test.ts holds the questions each must answer.
 */


const ALL_PAGES: HelpGuide["pages"] = ["dashboard", "player-explorer", "team-explorer", "player-comparison", "team-building"];
const TABLE_PAGES: HelpGuide["pages"] = ["player-explorer", "team-explorer", "team-building"];

/** A bar in Points History, as it's drawn. */
function SeasonBarIcon({ kind }: { kind: "counted" | "skipped" | "current" }) {
  const fill = kind === "counted" ? "var(--accent-positive)" : kind === "skipped" ? "var(--border-strong)" : "none";
  const stroke = kind === "current" ? "var(--accent-positive)" : "none";
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
      <rect x="3" y="3" width="8" height="12" rx="1" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

/** The dotted line a Trends graph draws for a spell out of FPL. */
function DottedLineIcon() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
      <path d="M1 5h18" stroke="var(--series-1)" strokeWidth="2" strokeDasharray="2 3" strokeLinecap="round" />
    </svg>
  );
}

const FIRST_GUIDES: HelpGuide[] = [
  // ---------- Reading the numbers ----------
  {
    id: "colours",
    topic: TOPIC.numbers,
    title: "Green and red",
    answer: "How a figure ranks: a player against his position, a club against all 20 clubs.",
    pages: ALL_PAGES,
    keywords: [
      "green", "red", "colour", "coloured", "colours", "shading", "shaded", "highlighted", "cell colour", "background colour",
      "what do the colours mean", "why is it green", "why is it red", "percentile", "rank", "ranking", "ranked", "good", "bad",
      "better", "worse", "best", "worst", "heatmap", "heat map", "compared", "average", "turn off colours", "colours off",
      "no colours", "hide colours", "remove colours", "colour blind", "colourblind", "palette", "plain", "monochrome",
    ],
    related: ["stopwatch", "hover"],
    body: (
      <>
        <ColourScale low="Bottom of his position" high="Top" />
        <HoverExample lines={["xG/Game: Expected goals per game played.", "92nd percentile of midfielders: top 8%"]} />
        <Points
          items={[
            "Ranked against everyone in his position for that Data View, so filtering never changes a colour.",
            "Lower price and ownership count as better.",
            "Games played, draws and style figures are never coloured.",
          ]}
        />
        <IconKey
          rows={[
            { icon: <ComparativeColourIcon />, label: "Colours on", text: "(top bar)" },
            { icon: <ComparativeColourIcon off />, label: "Colours off", text: "on every page; hovers still give the rank" },
          ]}
        />
      </>
    ),
  },
  {
    id: "stopwatch",
    topic: TOPIC.numbers,
    title: "The stopwatch",
    answer: "Too few minutes to rank fairly, so no colour and no percentile.",
    pages: ALL_PAGES,
    keywords: [
      "player not coloured", "player coloured",
      "stopwatch", "stop watch", "clock", "timer", "watch icon", "amber", "amber icon", "yellow", "yellow icon", "yellow clock", "small sample", "sample size", "not enough minutes",
      "too few minutes", "few minutes", "no percentile", "not coloured", "no colour", "why no colour", "greyed", "grey icon",
      "floor", "minutes floor", "fixed floor", "855", "quarter of the minutes", "cameo", "left out", "excluded", "icon next to name",
      "symbol next to name", "not ranked",
    ],
    related: ["min-minutes", "colours"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <MinutesFloorIcon size={15} />, tone: "muted", label: "Grey:", text: "a minimum applies here; nothing shown is under it" },
            { icon: <MinutesFloorIcon size={15} />, tone: "amber", label: "Amber:", text: "under it. No colour, no percentile, never \"the best\"" },
            { icon: <HideSmallSamplesIcon size={15} />, label: "Hide:", text: "leave out everyone under it" },
          ]}
        />
        <Label>The fixed floor: a quarter of the minutes available</Label>
        <Figures
          items={[
            { value: "855", label: "a completed season" },
            { value: "¼", label: "of this season's gameweeks × 90" },
            { value: "90", label: "at least, early in a season" },
          ]}
        />
        <Note>No minutes counts as 0, so he's under every minimum.</Note>
      </>
    ),
  },
  {
    id: "min-minutes",
    topic: TOPIC.numbers,
    title: "Setting a minimum minutes",
    answer: "Raise Min Minutes to leave out players with tiny samples. It starts at 0.",
    pages: ALL_PAGES,
    keywords: [
      "minimum minutes", "min minutes", "minutes filter", "filter minutes", "mins", "slider", "threshold", "cut off", "cutoff",
      "exclude players", "hide players", "remove cameos", "one appearance", "fluke", "per game list", "top of list wrong",
      "set minimum", "raise minimum", "hide button", "hide small samples", "sample",
    ],
    related: ["stopwatch", "per-game"],
    body: (
      <>
        <Terms
          rows={[
            ["Player Explorer, Add Players", "the Mins column's ▾ filter (≥)"],
            ["Dashboard tiles & graphs", "Min Minutes in its dialog"],
            ["Player Comparison cards", "Min Minutes in its dialog"],
          ]}
        />
        <Points items={["Try 855 (a quarter of a season) when a cameo tops a per-game list.", "Colours always use the fixed floor, whatever you set."]} />
        <IconKey rows={[{ icon: <HideSmallSamplesIcon size={15} />, label: "Hide", text: "leaves out everyone under the floor; click again to bring them back" }]} />
      </>
    ),
  },
  {
    id: "data-views",
    topic: TOPIC.numbers,
    title: "Data Views",
    answer: "Which season the figures cover. Each page has its own toggle.",
    pages: ALL_PAGES,
    keywords: [
      "data view", "data views", "season", "seasons", "last season", "last completed season", "completed season", "current season",
      "this season", "live", "trophy", "toggle", "mode", "switch season", "change season", "which season",
      "past season", "previous season", "year", "last year", "this year",
    ],
    related: ["historic-average", "today-only"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <AnalysisModeIcon mode="live" size={17} />, tone: "green", label: "Current Season:", text: "this season, live" },
            { icon: <AnalysisModeIcon mode="lastSeason" size={17} />, tone: "green", label: "Last Completed Season:", text: "his real totals, however little he played" },
            { icon: <AnalysisModeIcon mode="historicAverage" size={17} />, tone: "green", label: "Historic Average:", text: "the last 4 completed seasons" },
          ]}
        />
        <Note>Changing one page's Data View never changes another's.</Note>
      </>
    ),
  },
  {
    id: "historic-average",
    topic: TOPIC.numbers,
    title: "How Historic Average works",
    answer: "The average of the last 4 completed seasons, counting only seasons of 855+ minutes.",
    pages: ALL_PAGES,
    keywords: [
      "historic average", "historic", "average", "averages", "4 seasons", "four seasons", "last 4", "multiple seasons", "past seasons",
      "career", "long term", "injury", "injured", "missed season", "855", "decimal", "decimals", "0.4", "promoted", "relegated",
      "out of the league", "championship",
    ],
    related: ["data-views", "stopwatch"],
    body: (
      <>
        <Label>Example: a season lost to injury</Label>
        <SeasonStrip
          seasons={[
            { season: "22/23", figure: "2,780 min", counts: true },
            { season: "23/24", figure: "610 min", counts: false },
            { season: "24/25", figure: "2,950 min", counts: true },
            { season: "25/26", figure: "3,100 min", counts: true },
          ]}
        />
        <Points
          items={[
            "Averaged over the 3 that count. An older season never fills the gap.",
            "Rare counts (goals, assists, cards…) keep a decimal, so 0.4 isn't shown as 0.",
            "Clubs: the seasons they were in the Premier League.",
          ]}
        />
      </>
    ),
  },
  {
    id: "dash",
    topic: TOPIC.numbers,
    title: "A dash (—)",
    answer: "No figure exists. A dash never means 0.",
    pages: ALL_PAGES,
    keywords: [
      "why is it blank", "blank cell",
      "dash", "—", "-", "hyphen", "line", "blank", "empty", "missing", "no number", "no value", "no data", "nothing", "zero", "0",
      "null", "not showing", "not available", "n/a", "why missing", "why blank",
    ],
    related: ["data-history", "today-only"],
    body: (
      <>
        <Terms
          rows={[
            ["Not recorded", "FPL didn't track it then (xG before 2022/23)"],
            ["Didn't play", "no minutes in that Data View"],
            ["Not in yet", "a second source can run a day behind"],
          ]}
        />
        <Note>A cell with no dash at all is blank by design, like a goalkeeper's defensive contributions.</Note>
      </>
    ),
  },
  {
    id: "hover",
    topic: TOPIC.numbers,
    title: "Hover for more",
    answer: "Hover any figure, header or icon to see what it is and where it ranks.",
    pages: ALL_PAGES,
    keywords: [
      "info", "information", "hint", "popup", "pop up", "what is this", "help text", "hover box",
      "hover", "mouse over", "mouseover", "tooltip", "tool tip", "more info", "more detail", "explain", "what does this mean",
      "definition", "meaning", "percentile", "rank", "details", "point at", "what is this icon", "what is this column",
    ],
    related: ["colours"],
    body: (
      <>
        <Label>A player's figure</Label>
        <HoverExample lines={["xG/Game: Expected goals per game played.", "92nd percentile of midfielders: top 8%"]} />
        <Label>A club's figure</Label>
        <HoverExample lines={["Goals For: Goals scored, own goals in their favour included.", "3rd of 20 clubs"]} />
        <Note>Headers say what the statistic means; icons and buttons say what they do.</Note>
      </>
    ),
  },
  {
    id: "today-only",
    topic: TOPIC.numbers,
    title: "Always today's figures",
    answer: "Price, ownership, form, availability and set-piece orders are always today's, in every Data View.",
    pages: ALL_PAGES,
    keywords: [
      "price", "today", "current price", "old price", "past price", "historic price", "price last season", "ownership", "own%", "owned",
      "selected by", "availability", "form", "set piece", "set pieces", "penalty order", "penalties", "corners", "free kicks",
      "header colour", "red header", "muted red", "green header", "column colour", "why doesn't price change", "same every season",
    ],
    related: ["data-views"],
    body: (
      <>
        <HeaderKey
          rows={[
            { header: "xG", colour: "--accent-positive", text: "FPL figure for the Data View's season(s)" },
            { header: "Price", colour: "--col-static", text: "always today's figure" },
          ]}
        />
        <Points items={["Pts/£m and other per-£m figures use today's price too.", "The one exception: a past season's Match Log heading shows that season's prices."]} />
      </>
    ),
  },
  {
    id: "data-history",
    topic: TOPIC.numbers,
    title: "Which seasons have which data",
    answer: "Most data goes back to 2016/17. xG starts in 2022/23, defensive contributions in 2024/25.",
    pages: ALL_PAGES,
    keywords: [
      "how far back", "history", "seasons available", "older seasons", "2016", "2016/17", "archive", "xg missing", "before 2022",
      "starts missing", "defensive contributions missing", "dc missing", "tackles", "cbi", "recoveries", "club xg", "2023/24",
      "2024/25", "2025/26", "old data", "past data", "community archive", "vaastav",
    ],
    related: ["dash", "historic-average"],
    body: (
      <>
        <SeasonBars
          seasons={["16/17", "17/18", "18/19", "19/20", "20/21", "21/22", "22/23", "23/24", "24/25", "25/26", "26/27"]}
          rows={[
            { label: "Points, goals, results", from: 0 },
            { label: "xG, xA, xGC, Starts", from: 6 },
            { label: "Club xG, xA, xGC", from: 7 },
            { label: "Defensive contributions", from: 8 },
            { label: "DC per match, Tackles, CBI", from: 9 },
            { label: "Ownership, set-piece orders", from: 10, tone: "live" },
          ]}
        />
        <Note>Before a bar starts: "—", never 0. Clubs' 2016/17–2025/26 records were filled in once from an archive of FPL's own data.</Note>
      </>
    ),
  },
  {
    id: "per-game",
    topic: TOPIC.numbers,
    title: "Per-game figures and rounding",
    answer: "A season's total divided by games, with games counted from minutes (90 minutes = 1 game).",
    pages: ALL_PAGES,
    keywords: [
      "per 90 minutes", "average", "maths", "math", "divide",
      "per game", "per 90", "per90", "/game", "rate", "rates", "per match", "average per game", "how calculated", "calculation",
      "formula", "games played", "estimated games", "whole numbers", "rounding", "rounded", "decimals", "decimal places", "why rounded",
    ],
    related: ["min-minutes", "historic-average"],
    body: (
      <>
        <Flow steps={["1,800 minutes", "20 games", "10 goals ÷ 20", "0.5 a game"]} />
        <Points items={["Always totals ÷ games, never an average of match figures.", "Whole numbers wherever possible; decimals only for small figures (xG, rates, price)."]} />
      </>
    ),
  },

  // ---------- Dashboard ----------
  {
    id: "dashboard-views",
    topic: TOPIC.dashboard,
    title: "Dashboard views",
    answer: "My View starts blank; Starter is a ready-made layout. Up to 5 views each for Players and Teams.",
    pages: ["dashboard"],
    keywords: [
      "front page", "main page", "overview", "reset view", "rename view",
      "dashboard", "view", "views", "my view", "starter", "starter view", "create view", "new view", "delete view", "layout",
      "players teams toggle", "players or teams", "switch view", "default dashboard", "template", "home", "home page", "start page",
    ],
    related: ["dashboard-tiles", "dashboard-graphs"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <CreateViewIcon />, label: "Create View", text: "a new blank view" },
            { icon: <EditIcon />, label: "Pencil", text: "edit a tile or graph" },
            { icon: <TrashIcon />, label: "Bin", text: "delete, after you confirm" },
          ]}
        />
        <Points items={["Players / Teams (top right) switches between the two sets.", "Starter can't be changed. Everything else saves as you go."]} />
      </>
    ),
  },
  {
    id: "dashboard-tiles",
    topic: TOPIC.dashboard,
    title: "Build a tile",
    answer: "A Top-5 list of one statistic, for the players or clubs you choose.",
    pages: ["dashboard"],
    keywords: [
      "tile", "tiles", "leaderboard", "top 5", "top five", "add tile", "edit tile", "new tile", "list", "bar", "bars", "order",
      "lowest first", "highest first", "filters", "pencil", "rename tile", "pick players", "specific players", "plus card",
    ],
    related: ["dashboard-views", "min-minutes"],
    body: (
      <>
        <Steps
          items={[
            <>
              Click the <PlusIcon size={11} /> card.
            </>,
            "Pick a statistic, a Data View and an order.",
            "Choose Filters (position, team, price, Min Minutes) or up to 5 players.",
          ]}
        />
        <Note>The top row's bar is full length; the others show how far behind they are. Click a row for the profile.</Note>
      </>
    ),
  },
  {
    id: "dashboard-graphs",
    topic: TOPIC.dashboard,
    title: "Build a graph",
    answer: "A scatter plot of two statistics, or a bar chart of the top 15 by one.",
    pages: ["dashboard"],
    keywords: [
      "graph", "graphs", "chart", "charts", "make a graph", "new chart", "scatter", "scatter plot", "bar chart", "plot", "axis", "axes", "trend line", "diagonal",
      "x = y", "outlier", "outliers", "add graph", "edit graph", "dots", "points on chart",
    ],
    related: ["dashboard-tiles", "stopwatch"],
    body: (
      <>
        <Steps items={["Click the + card under the tiles.", "Choose Scatter Plot or Bar Chart, the statistic(s) and a Data View.", "Choose Filters, or up to 5 players or teams."]} />
        <IconKey rows={[{ icon: <TrendLineIcon />, label: "Add Trend Line:", text: "a dashed line where X = Y, for pairs like xG vs Goals" }]} />
        <Note>A crowded axis switches to a log scale (its title says so); hover a point for the real values.</Note>
      </>
    ),
  },

  // ---------- Player & Team Explorer ----------
  {
    id: "toolbar",
    topic: TOPIC.tables,
    title: "The table toolbar",
    answer: "Five icons above the table: reset, columns, clear filters, saved views and export.",
    pages: TABLE_PAGES,
    keywords: [
      "toolbar icons", "top of table", "what are these icons", "table buttons",
      "toolbar", "icons", "buttons", "reset", "default", "start again", "columns", "clear filters", "clear", "saved views", "export",
      "csv", "excel", "download", "spreadsheet", "export to file", "google sheets", "copy table", "funnel",
    ],
    related: ["columns", "saved-views"],
    body: (
      <IconKey
        rows={[
          { icon: <ResetIcon />, label: "Reset:", text: "default columns, order and widths; no filters" },
          { icon: <ColumnsIcon />, label: "Columns:", text: "choose which show (type to find one)" },
          { icon: <FilterIcon />, label: "Clear filters:", text: "empties the search and every filter" },
          { icon: <SavedViewsIcon />, label: "Saved views:", text: "save or load a set-up" },
          { icon: <DownloadIcon />, label: "Export CSV:", text: "what's on screen, ready for Excel" },
        ]}
      />
    ),
  },
  {
    id: "columns",
    topic: TOPIC.tables,
    title: "Add, move and resize columns",
    answer: "Columns picks what shows; drag a header to move it, its right edge to resize it.",
    pages: TABLE_PAGES,
    keywords: [
      "columns", "column", "add column", "remove column", "hide column", "show column", "more stats", "choose stats", "move column",
      "reorder", "drag", "resize", "width", "wider", "narrower", "default columns", "missing column", "where is", "next 5 fixtures",
      "fixtures column", "scroll sideways",
    ],
    related: ["toolbar", "saved-views"],
    body: (
      <>
        <Terms
          rows={[
            [<ColumnsIcon key="c" />, "pick columns; type to find one"],
            ["Drag a header", "move it"],
            ["Drag its right edge", "resize it (kept until Reset)"],
          ]}
        />
        <Note>The table starts fresh each visit. A saved view brings your set-up back.</Note>
      </>
    ),
  },
  {
    id: "sort-filter",
    topic: TOPIC.tables,
    title: "Sort and filter",
    answer: "Click a header to sort, best first. Click ▾ on a header to filter.",
    pages: TABLE_PAGES,
    keywords: [
      "sort", "sorting", "order by", "highest", "lowest", "ascending", "descending", "reverse", "tiebreak", "tie break", "shift click",
      "filter", "filters", "filtering", "▾", "arrow", "greater than", "less than", "between", "budget", "max price", "under £",
      "column filter", "filter a column",
    ],
    related: ["toolbar", "min-minutes"],
    body: (
      <>
        <Terms
          rows={[
            ["Click", "sort, best first"],
            ["Click again", "reverse"],
            ["Shift-click another", "add a tiebreak"],
            ["▾ on a header", "filter: ≤, ≥, = or a list"],
          ]}
        />
        <Note>
          <Key>Enter</Key> confirms a filter, <Key>Esc</Key> cancels. "—" sorts below every value.
        </Note>
      </>
    ),
  },
  {
    id: "saved-views",
    topic: TOPIC.tables,
    title: "Saved views",
    answer: "Save a table exactly as you've set it up, then load it with one click.",
    pages: TABLE_PAGES,
    keywords: [
      "save layout", "saved filter", "reload view", "open view",
      "save", "saved", "saved view", "saved views", "view", "views", "load", "preset", "layout", "keep my columns", "remember",
      "columns reset", "lost my columns", "save my columns", "save my table", "my set up", "setup", "favourite", "bookmark",
    ],
    related: ["columns", "toolbar"],
    body: (
      <>
        <Steps
          items={[
            "Set the table up.",
            <>
              Open <SavedViewsIcon size={13} /> Saved views.
            </>,
            "Save current view, and name it.",
          ]}
        />
        <Label>A view keeps</Label>
        <Chips items={["Data View", "columns & order", "widths", "sort", "search", "filters", "source switches", "Hide"]} />
        <Note>Up to 5. Player Explorer's views load in Team Building's Add Players too.</Note>
      </>
    ),
  },
  {
    id: "player-search",
    topic: TOPIC.tables,
    title: "Finding a player",
    answer: "Type any part of his name. Accents and small typos don't matter.",
    pages: ["player-explorer", "player-comparison", "team-building", "dashboard"],
    keywords: [
      "search player", "type a name", "name search", "player not found", "wrong player",
      "search", "find player", "find", "player name", "name", "look up", "lookup", "typo", "spelling", "accent", "accents",
      "cant find", "cannot find", "missing player", "autocomplete", "suggestions", "search box",
    ],
    related: ["sort-filter"],
    body: (
      <>
        <Terms
          rows={[
            ["odegaard", "Ødegaard"],
            ["haalnd", "Haaland"],
            ["B.Fernandes", "Bruno Fernandes"],
          ]}
        />
        <Note>
          In a suggestion list: <Key>↓</Key> <Key>↑</Key> move, <Key>Enter</Key> adds, <Key>Esc</Key> closes.
        </Note>
      </>
    ),
  },

  // ---------- Teams & profiles ----------
  {
    id: "team-explorer",
    topic: TOPIC.teams,
    title: "Team Explorer",
    answer: "The league as a table: each club's figures for the Data View.",
    pages: ["team-explorer"],
    keywords: [
      "team table", "club table", "compare teams", "best teams", "which team",
      "team explorer", "teams", "clubs", "league table", "table", "standings", "team stats", "club stats", "team figures",
      "league position", "goals for", "goals against", "clean sheets", "promoted", "team search", "spurs", "tottenham", "behind",
    ],
    related: ["team-profile", "toolbar"],
    body: (
      <Points
        items={[
          "What the club did that season, whoever was playing.",
          "This season's table can be a round behind players' totals: FPL confirms matches a few hours after full time.",
          "Click a club's pill for its Team Profile.",
        ]}
      />
    ),
  },
  {
    id: "team-profile",
    topic: TOPIC.teams,
    title: "Team Profile",
    answer: "Click any club's pill for its own page: club figures only, no players.",
    keywords: [
      "club history", "team fixtures", "team players", "squad list", "club badge",
      "team profile", "club profile", "team page", "club page", "team summary", "team radar", "club pill", "badge", "kit",
      "open team", "team details", "club details", "team history", "club summary", "club radar", "team points history",
    ],
    related: ["team-summary", "fixture-forecast"],
    body: (
      <>
        <Terms
          rows={[
            ["Summary", "the club's figures as tiles, coloured against every club"],
            ["Radars", "Defense and Offense, against every club"],
            ["Fixture Forecast", "its next five matches"],
            ["Points History", "FPL points per season"],
            ["Match Log", "each match of a season"],
          ]}
        />
        <Note>For a club's players: Player Explorer, ▾ on the Player header → Club.</Note>
      </>
    ),
  },
  {
    id: "fixture-forecast",
    topic: TOPIC.teams,
    title: "Fixture Forecast",
    answer: "Scoutline's own forecast for a club's next five matches, on its Team Profile.",
    keywords: [
      "fixture difficulty", "next 5 fixtures", "forecast goals", "expected goals against", "win probability",
      "fixture forecast", "fixtures", "forecast", "clean sheet chance", "clean sheet odds", "win chance",
      "upcoming", "next matches", "next games", "easy fixtures", "hard fixtures", "schedule", "odds", "probability", "who to buy defence",
    ],
    related: ["team-profile", "expected-points"],
    body: (
      <>
        <Terms
          rows={[
            ["Goals", "expected scored and conceded"],
            ["Clean sheet", "chance of keeping one"],
            ["Scores", "chance of scoring at least once"],
            ["W / D / L", "chance of a win, draw or defeat"],
          ]}
        />
        <Points
          items={[
            "Built from every Premier League match since 2016/17, recent matches counting most.",
            "Knows nothing about injuries or rotation.",
            "FPL's own difficulty is on each opponent's hover.",
          ]}
        />
      </>
    ),
  },
  {
    id: "player-profile",
    topic: TOPIC.profiles,
    title: "Player Profile",
    answer: "Click a player's name almost anywhere. Esc or × closes it.",
    keywords: [
      "player info", "player stats", "player history",
      "player profile", "profile", "player page", "open player", "player details", "summary", "tiles",
      "playing time", "gauge", "close profile", "click name", "player overview", "profile page", "his page", "player summary", "player card", "more about a player",
    ],
    related: ["points-history", "stopwatch"],
    body: (
      <>
        <Terms
          rows={[
            ["Summary", "every figure as a tile, coloured against his position"],
            ["Percentile Radar", "where he ranks in his position"],
            ["Points History", "a bar per season"],
            ["Match Log", "each match of one season"],
          ]}
        />
        <Note>Summary and radar follow the Data View; the rest don't.</Note>
      </>
    ),
  },
  {
    id: "points-history",
    topic: TOPIC.profiles,
    title: "Points History",
    answer: "A bar per season of his FPL points; click one to show that season in the Match Log.",
    keywords: [
      "points history", "season bars", "bar per season", "past points", "previous seasons", "career points", "points per season",
      "dagger", "†", "grey bar", "green bar", "outline", "outlined bar", "average line", "4 season average", "change", "up arrow",
      "down arrow", "trend", "history chart", "season icons",
    ],
    related: ["match-log", "historic-average"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <SeasonBarIcon kind="counted" />, label: "Green:", text: "counts in the 4-season average" },
            { icon: <SeasonBarIcon kind="skipped" />, label: "Grey:", text: "doesn't count († outside the 4 seasons)" },
            { icon: <SeasonBarIcon kind="current" />, label: "Outline:", text: "this season" },
            { icon: <MinutesFloorIcon size={14} />, tone: "amber", label: "Stopwatch:", text: "under 855 minutes" },
          ]}
        />
        <Note>Top right: the change between his last two seasons. The icons underneath: his average points, minutes, goals and assists a season.</Note>
      </>
    ),
  },

  // ---------- Player Comparison ----------
  {
    id: "comparison",
    topic: TOPIC.comparison,
    title: "Player Comparison",
    answer: "Up to 5 players side by side, each in his own colour.",
    pages: ["player-comparison"],
    keywords: [
      "compare players", "similar players", "pick between",
      "compare", "comparison", "player comparison", "side by side", "versus", "vs", "head to head", "h2h", "two players",
      "between players", "blue", "gold", "series colours", "add player", "comparison views", "who is better", "choose between",
    ],
    related: ["comparison-cards"],
    body: (
      <>
        <Swatches
          items={[
            { colour: "--series-1", label: "1st" },
            { colour: "--series-2", label: "2nd" },
            { colour: "--series-3", label: "3rd" },
            { colour: "--series-4", label: "4th" },
            { colour: "--series-5", label: "5th" },
          ]}
        />
        <Steps items={["Search for players and add them.", "Pick a view: Starter, or one you build with the + cards.", "Click a name for his profile."]} />
        <Note>A view keeps the layout, not the players. Up to 5 views, 4 cards per section.</Note>
      </>
    ),
  },
  {
    id: "comparison-cards",
    topic: TOPIC.comparison,
    title: "Radars, Outputs and Trends",
    answer: "Radars rank, Outputs measure, Trends go season by season.",
    pages: ["player-comparison"],
    keywords: [
      "radar card", "outputs card", "trends card", "three cards",
      "outputs bar", "radar axis", "trend graph", "season trend",
      "radar", "radars", "spider", "outputs", "output", "bars", "trends", "trend",
      "percentile", "chart", "radar chart", "card", "cards", "best in bold", "tinted bar",
    ],
    related: ["comparison", "stopwatch"],
    body: (
      <>
        <Terms
          rows={[
            ["Charts", "percentile radars (3–8 statistics); further out is better"],
            ["Outputs", "bars (up to 12); a colour's length is how far that player is ahead"],
            ["Trends", "one statistic, season by season"],
          ]}
        />
        <IconKey
          rows={[
            { icon: <DottedLineIcon />, label: "Dotted line:", text: "a spell out of FPL" },
            { icon: <MinutesFloorIcon size={14} />, tone: "amber", label: "Stopwatch:", text: "under the floor; not on radars" },
          ]}
        />
      </>
    ),
  },

  // ---------- Team Building ----------
  {
    id: "import-team",
    topic: TOPIC.building,
    title: "Import your FPL team",
    answer: "New Squad → enter your FPL team ID.",
    pages: ["team-building"],
    keywords: [
      "fpl team", "team number", "entry id", "my fpl",
      "import", "import team", "team id", "fpl id", "id", "my team", "my squad", "entry", "load my team", "get my team", "bring in my team",
      "new squad", "connect", "link account", "sync", "real team", "login", "sign in",
    ],
    related: ["build-squad", "sell-price"],
    body: (
      <>
        <Steps
          items={[
            "Sign in at fantasy.premierleague.com and open the Points tab.",
            <>
              Copy the number after /entry/:
              <div className="help-url">
                fantasy.premierleague.com/entry/<mark>1234567</mark>/event/8
              </div>
            </>,
            "Team Building → New Squad → paste it.",
          ]}
        />
        <Note>It only reads FPL's public data, chip history included. No login; nothing changes on FPL.</Note>
      </>
    ),
  },
  {
    id: "build-squad",
    topic: TOPIC.building,
    title: "Build a squad",
    answer: "Click a + on the pitch to add a player for that place; drag to arrange.",
    pages: ["team-building"],
    keywords: [
      "squad", "build squad", "new squad", "blank squad", "add player", "add players", "transfer", "transfers", "swap", "substitute", "sub",
      "bench", "pitch", "drag", "remove player", "clear draft", "wildcard", "free hit", "draft", "plus", "+",
      "club limit",
    ],
    related: ["import-team", "best-draft"],
    body: (
      <>
        <Flow steps={["New Squad", "click a +", "Add", "drag to arrange"]} />
        <Points
          items={[
            "Add puts him in the XI if there's a legal place, otherwise on the bench.",
            "Drag one card onto another to swap them. Hover a card to remove him.",
            "Over budget or over 3 per club: a warning, never a block.",
          ]}
        />
      </>
    ),
  },
  {
    id: "pitch-highlight",
    topic: TOPIC.building,
    title: "What the shirts show",
    answer: "Highlight picks one figure per shirt; ‹ › picks the gameweek.",
    pages: ["team-building"],
    keywords: [
      "pitch view", "what does the shirt say", "figure on shirt", "kit view",
      "highlight", "shirt", "shirts", "kit", "nameplate", "card", "fixtures", "gameweek arrows", "‹ ›", "next gameweek",
      "owned", "ownership", "points prediction", "show fixtures", "what's on the shirt", "change gameweek",
    ],
    related: ["expected-points", "price-changes"],
    body: (
      <Terms
        rows={[
          ["Fixtures", "his next five, coloured by FPL difficulty"],
          ["Price", "today's, purchase, sell, or price progress"],
          ["Owned", "share of FPL managers who own him"],
          ["Minutes", "expected minutes"],
          ["Points Prediction", "Expected Points (captain doubled)"],
        ]}
      />
    ),
  },
  {
    id: "expected-points",
    topic: TOPIC.building,
    title: "Expected Points: FPL or Model",
    answer: "Two separate predictions, never blended. The Source toggle picks which one the pitch uses.",
    pages: ["team-building"],
    keywords: [
      "projection", "projections", "expected score", "xp model",
      "expected points", "exp pts", "xp", "xpts", "prediction", "predicted", "predict", "model", "model predicted", "fpl official",
      "projected", "projected points", "source", "source toggle", "points prediction", "how many points", "forecast points", "next gameweek points",
    ],
    related: ["expected-minutes", "best-draft"],
    body: (
      <>
        <TwoWays
          ways={[
            { title: "FPL Official", inputs: ["points a match", "xG & xA", "a little form", "fixture difficulty", "chance of playing"], result: "Exp. Pts (FPL)" },
            { title: "Model Predicted", inputs: ["chance of starting", "usual minutes", "scoring rates", "Fixture Forecast"], result: "Exp. Pts (Model)" },
          ]}
        />
        <Points items={["Hover either figure for how it adds up.", "A double gameweek adds both matches; a blank one shows \"—\"."]} />
      </>
    ),
  },
  {
    id: "expected-minutes",
    topic: TOPIC.building,
    title: "Expected minutes",
    answer: "How long Scoutline's model expects him to play in each gameweek.",
    pages: ["team-building"],
    keywords: [
      "minutes prediction", "how long will he play", "sub risk",
      "expected minutes", "exp mins", "minutes", "rotation", "rotation risk", "nailed", "nailed on", "starter", "start chance",
      "chance of starting", "benched", "injury", "injured", "doubtful", "flag", "suspended", "ban", "will he play", "playing time",
    ],
    related: ["expected-points"],
    body: (
      <>
        <Label>Built from</Label>
        <Chips items={["recent starts", "last season", "back from absence", "managers selling on team news", "FPL injury news", "usual time on the pitch"]} />
        <Note>FPL's availability covers the next round only, so a one-match ban shows 0 in all five gameweeks.</Note>
      </>
    ),
  },
  {
    id: "best-draft",
    topic: TOPIC.building,
    title: "Best Draft and the captain",
    answer: "Best Draft picks the XI, captain and vice-captain with the most Expected Points for the gameweek shown.",
    pages: ["team-building"],
    keywords: [
      "best xi", "auto select", "choose captain", "bench order",
      "best draft", "captain", "vice captain", "vice-captain", "armband", "auto pick", "autopick", "optimise", "pick my team",
      "best team", "starting xi", "starting 11", "lineup", "line up", "legal formation", "who to captain", "who should i captain", "triple captain",
    ],
    related: ["expected-points", "build-squad"],
    body: (
      <>
        <Steps items={["Choose FPL or Model with Source.", "Pick the gameweek with ‹ ›.", "Click Best Draft — or Captain, then a starter, to choose yourself."]} />
        <Note>Only formations FPL allows. It saves one XI for the squad, not one per gameweek.</Note>
      </>
    ),
  },
  {
    id: "sell-price",
    topic: TOPIC.building,
    title: "Sell price and budget",
    answer: "FPL lets you keep half of any rise, rounded down to £0.1m.",
    pages: ["team-building"],
    keywords: [
      "sell", "selling price", "sale", "sell price", "budget", "bank", "money", "money left", "itb", "in the bank", "purchase price",
      "bought", "price rise", "profit", "half", "squad value", "team value", "how much", "over budget", "100m", "£100m",
    ],
    related: ["price-changes", "import-team"],
    body: (
      <>
        <Flow steps={["paid £7.0m", "now £7.5m", "½ of +£0.5m", "round down £0.2m", "sells £7.2m"]} />
        <Points
          items={[
            "After a fall, he sells at today's price.",
            "Squad Value is FPL's: your players at today's prices. Hover it for what they'd sell for.",
            "Going over budget turns it red, but never stops you adding.",
          ]}
        />
      </>
    ),
  },
  {
    id: "price-changes",
    topic: TOPIC.building,
    title: "Price changes",
    answer: "FPL's own progress toward a price rise (+) or drop (−); 100% is the threshold.",
    pages: ["team-building"],
    keywords: [
      "price going up", "price going down", "value rise", "price fall",
      "price change", "price changes", "price rise", "price drop", "rise", "fall", "falling", "rising", "progress", "predicted progress",
      "price predictor", "threshold", "100%", "likely to rise", "likely to drop", "price update", "overnight", "tonight", "value change",
    ],
    related: ["sell-price", "pitch-highlight"],
    body: (
      <>
        <ColourScale low="−100%: drops" mid="0" high="+100%: rises" />
        <Steps items={["Highlight → Price.", "Price → Progress, or Predicted Progress (where FPL expects it at the next update)."]} />
        <Note>Hover for FPL's own words, like "likely to rise".</Note>
      </>
    ),
  },

  // ---------- The app ----------
  {
    id: "notepad",
    topic: TOPIC.app,
    title: "Notepad",
    answer: `Press ${NOTEPAD_KEY} on any page to jot notes; they save as you type.`,
    pages: ALL_PAGES,
    keywords: [
      "notebook", "jot down", "write notes", "save notes", "notes tab", "keep notes", "note pad","notepad", "notes", "note", "jot", "write", "writing", "backtick", "`", "memo", "scratch", "tabs", "plan", "watchlist", "to do"],
    related: ["updates"],
    body: (
      <>
        <Flow
          steps={[
            <>
              <Key>{NOTEPAD_KEY}</Key> or <NotepadIcon size={12} />
            </>,
            "type",
            <>
              <Key>{NOTEPAD_KEY}</Key> or <Key>Esc</Key>
            </>,
          ]}
        />
        <Note>Up to 5 tabs. Double-click a tab to rename it. Saved on this computer only.</Note>
      </>
    ),
  },
  {
    id: "updates",
    topic: TOPIC.app,
    title: "Updates and refreshes",
    answer: "Scoutline updates itself, and player figures refresh every 10 minutes.",
    pages: ALL_PAGES,
    keywords: [
      "update", "updates", "updating", "new version", "version", "install", "installer", "restart", "refresh", "reload", "live",
      "last updated", "how often", "stale", "old data", "offline", "no internet", "internet", "connection", "banner", "week old",
    ],
    related: ["problems"],
    body: (
      <>
        <Flow steps={["open", "check for update", "install & reopen"]} />
        <Terms
          rows={[
            ["Player figures", "every 10 minutes"],
            ["Club figures", "within the hour of FPL confirming a match"],
            ["No internet", "the last data, up to a week old"],
          ]}
        />
        <Note>Hover the dot at the top left for when the data last updated.</Note>
      </>
    ),
  },
  {
    id: "problems",
    topic: TOPIC.app,
    title: "Something looks wrong",
    answer: "Check what loaded below, then share the app's log.",
    pages: ALL_PAGES,
    keywords: [
      "problem", "problems", "bug", "error", "broken", "crash", "crashed", "wrong", "not working", "not loading", "wont load",
      "blank page", "missing data", "log", "logs", "report", "support", "issue", "fix", "data health", "fields missing", "skipped",
    ],
    related: ["updates", "dash"],
    body: (
      <>
        <DataHealth />
        <Steps
          items={[
            <>
              Paste into File Explorer's address bar:
              <div className="help-url">%APPDATA%\FPL Analytics Dashboard\logs</div>
            </>,
            "Share scoutline.log. It never leaves your computer otherwise.",
          ]}
        />
      </>
    ),
  },
];

/** Every FPL guide (a second source adds its own through the slot; the Statistics guide is made from the columns, help/statistics.tsx). */
export const HELP_GUIDES: HelpGuide[] = [...FIRST_GUIDES, ...MORE_HELP_GUIDES];
