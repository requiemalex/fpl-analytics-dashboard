import React from "react";
import { AnalysisModeIcon } from "../components/AnalysisModeIcon";
import {
  CalendarIcon,
  CloseIcon,
  ColumnsIcon,
  ComparativeColourIcon,
  CreateViewIcon,
  DownloadIcon,
  EditIcon,
  FilterIcon,
  HelpIcon,
  NotepadIcon,
  PersonIcon,
  PlusIcon,
  ResetIcon,
  SavedViewsIcon,
  TrashIcon,
  TrendLineIcon,
} from "../components/IconToolbar";
import { HideSmallSamplesIcon, MinutesFloorIcon } from "../components/MinutesFloorBadge";
import { NOTEPAD_KEY } from "../components/Notepad";
import { PositionBadge } from "../components/primitives";
import { DutyIcon, type SetPieceDuty } from "../components/SetPieceDuties";
import { FplSourceIcon } from "../components/SourceToggle";
import { fdrColor } from "../metrics/fixtureTicker";
import { MAX_DASHBOARD_GRAPHS } from "../state/useDashboardGraphs";
import { MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE } from "../state/useSavedDashboardViews";
import { MAX_SUMMARY_TILES } from "../state/useSummaryTiles";
import { SQUAD_RULES } from "../types/team";
import { TOPIC } from "./topics";
import type { HelpGuide } from "./types";
import { Chips, ColourScale, Figures, Flow, IconKey, Key, Label, Note, Points, Steps, Terms } from "./visuals";

/**
 * <help_guides>, second set: the icons, the top bar, how to find players,
 * fixtures and gameweeks, the details of each page, and the edge cases
 * people run into (limits, notices, chips, installing, updates, players
 * leaving FPL). Same rules as the
 * first set (help/guides.tsx): a one-line answer, a visual, a few short
 * points, and many search words.
 */

const ALL_PAGES: HelpGuide["pages"] = ["dashboard", "player-explorer", "team-explorer", "player-comparison", "team-building"];

/** The top bar's data dot, as drawn. */
function Dot({ tone }: { tone: "live" | "stale" | "error" }) {
  return <span className={`status-dot ${tone}`} />;
}

/** A set-piece duty icon, as it shows after a player's name. */
function Duty({ duty, order }: { duty: SetPieceDuty; order: 1 | 2 | 3 }) {
  return (
    <span className={`duty-icon duty-${order}`}>
      <DutyIcon duty={duty} />
    </span>
  );
}

/** FPL's difficulty 1–5 as the fixture chips colour it. */
function DifficultyScale() {
  return (
    <div className="help-fdr">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ background: fdrColor(n) }}>
          {n}
        </span>
      ))}
      <i>easiest → hardest</i>
    </div>
  );
}

const { composition: SQUAD, startingXIBounds: XI } = SQUAD_RULES;

export const MORE_HELP_GUIDES: HelpGuide[] = [
  // ---------- Reading the numbers ----------
  {
    id: "icons",
    topic: TOPIC.numbers,
    title: "What the icons mean",
    answer: "Every icon in the app, and what it does. Hover any icon in the app to see its name.",
    pages: ALL_PAGES,
    keywords: [
      "icons", "icon", "symbols", "symbol", "buttons", "button", "what does this button do", "what is this icon", "key", "legend",
      "toolbar", "pencil", "bin", "trash", "plus", "magnifying glass", "palette", "notepad icon", "football", "trophy", "pulse", "bars",
      "funnel", "download", "reset", "arrows",
    ],
    related: ["top-bar", "toolbar"],
    body: (
      <IconKey
        rows={[
          { icon: <AnalysisModeIcon mode="live" size={16} />, label: "Data Views:", text: "Current Season" },
          { icon: <AnalysisModeIcon mode="lastSeason" size={16} />, label: "", text: "Last Completed Season" },
          { icon: <AnalysisModeIcon mode="historicAverage" size={16} />, label: "", text: "Historic Average" },
          { icon: <MinutesFloorIcon size={15} />, tone: "amber", label: "Stopwatch:", text: "under the minutes floor" },
          { icon: <HideSmallSamplesIcon size={15} />, label: "Hide:", text: "leave those players out" },
          { icon: <FplSourceIcon size={15} />, tone: "green", label: "Football:", text: "FPL's figures" },
          { icon: <Duty duty="penalties" order={1} />, label: "Goal, wall, flag:", text: "penalty, free-kick, corner duty (gold, silver, bronze)" },
          { icon: <ResetIcon />, label: "Reset", text: "a table" },
          { icon: <ColumnsIcon />, label: "Columns", text: "to show" },
          { icon: <FilterIcon />, label: "Clear filters", text: "" },
          { icon: <SavedViewsIcon />, label: "Saved views", text: "" },
          { icon: <DownloadIcon />, label: "Export", text: "to CSV" },
          { icon: <CreateViewIcon />, label: "Create View", text: "" },
          { icon: <EditIcon />, label: "Edit", text: "" },
          { icon: <TrashIcon />, label: "Delete", text: "(asks first)" },
          { icon: <TrendLineIcon />, label: "Trend line", text: "on a graph" },
          { icon: <NotepadIcon />, label: "Notepad", text: `(or ${NOTEPAD_KEY})` },
          { icon: <ComparativeColourIcon />, label: "Colours", text: "on or off" },
          { icon: <HelpIcon />, label: "Help", text: "this panel" },
        ]}
      />
    ),
  },
  {
    id: "top-bar",
    topic: TOPIC.numbers,
    title: "The top bar",
    answer: "Whether the data is live, the gameweek and its deadline, and the notepad, colour and Help buttons.",
    pages: ALL_PAGES,
    keywords: [
      "top bar", "header", "status", "dot", "green dot", "amber dot", "red dot", "live", "stale", "data error", "gameweek", "deadline",
      "calendar", "next deadline", "players loaded", "person icon", "how many players", "minimise", "close app", "window buttons",
    ],
    related: ["icons", "gameweeks"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <Dot tone="live" />, label: "Green dot:", text: "live (hover for when it last updated)" },
            { icon: <Dot tone="stale" />, label: "Amber dot:", text: "showing the last data that loaded" },
            { icon: <Dot tone="error" />, label: "Red dot:", text: "the data couldn't load" },
            { icon: <CalendarIcon size={14} />, label: "Calendar:", text: "the next deadline (hover for the time)" },
            { icon: <PersonIcon size={14} />, label: "Person:", text: "players loaded" },
          ]}
        />
        <Note>Then the Notepad, colour and Help buttons.</Note>
      </>
    ),
  },
  {
    id: "positions",
    topic: TOPIC.numbers,
    title: "Positions",
    answer: "Each position has its own colour, and players are only ever ranked against their own position.",
    pages: ALL_PAGES,
    keywords: [
      "position", "positions", "goalkeeper", "goalkeepers", "keeper", "gk", "gkp", "defender", "defenders", "def", "midfielder",
      "midfielders", "mid", "forward", "forwards", "fwd", "striker", "badge", "position colour", "compared to position",
    ],
    related: ["colours"],
    body: (
      <>
        <div className="help-chips">
          <PositionBadge position="GKP" />
          <PositionBadge position="DEF" />
          <PositionBadge position="MID" />
          <PositionBadge position="FWD" />
        </div>
        <Points items={["A defender's colour and percentile compare him with defenders only.", "Goalkeepers have saves instead of defensive contributions."]} />
      </>
    ),
  },
  {
    id: "club-pills",
    topic: TOPIC.numbers,
    title: "Club pills",
    answer: "The small badge in a club's kit colours. Click it, anywhere, for the club's Team Profile.",
    pages: ALL_PAGES,
    keywords: [
      "club pill", "pill", "club badge", "team badge", "badge", "kit colours", "club colours", "team colours", "swatch", "club name",
      "short name", "three letters", "abbreviation", "click club", "open club", "club link", "team link", "crest", "logo", "colours next to name",
    ],
    related: ["team-profile"],
    body: <Note>Its colours are the club's real kit colours where they're known.</Note>,
  },
  {
    id: "xg-basics",
    topic: TOPIC.numbers,
    title: "xG, xA, xGI and xGC",
    answer: "Expected figures: how many goals or assists a player's chances would usually bring.",
    pages: ALL_PAGES,
    keywords: [
      "xg", "xa", "xgi", "xgc", "expected goals", "expected assists", "expected goal involvements", "expected goals conceded",
      "expected", "chance quality", "underlying", "underlying stats", "what is xg", "big chances", "threat", "involvement",
      "goal involvement", "advanced stats", "analytics", "luck",
    ],
    related: ["over-under", "statistics"],
    body: (
      <Terms
        rows={[
          ["xG", "goals his chances would usually bring"],
          ["xA", "assists the chances he made would usually bring"],
          ["xGI", "xG + xA: his whole attacking threat"],
          ["xGC", "goals conceded while he was on the pitch, expected; fewer is better"],
        ]}
      />
    ),
  },
  {
    id: "over-under",
    topic: TOPIC.numbers,
    title: "Scoring above or below xG",
    answer: "Goals − xG: above 0, he's scoring more than his chances suggest; below 0, fewer.",
    pages: ALL_PAGES,
    keywords: [
      "goals minus xg", "goals − xg", "goals - xg", "overperform", "overperforming", "over performance", "underperform",
      "underperforming", "under performance", "lucky", "unlucky", "finishing", "clinical", "wasteful", "regression", "bounce back",
      "due a goal", "assists minus xa", "plus minus", "+/-",
    ],
    related: ["xg-basics"],
    body: (
      <>
        <ColourScale low="− fewer than his chances" mid="0: as expected" high="+ more" />
        <Note>A run either way tends to even out. Assists − xA works the same way.</Note>
      </>
    ),
  },
  {
    id: "defensive-contributions",
    topic: TOPIC.numbers,
    title: "Defensive contributions",
    answer: "A count of a player's defensive actions. Enough in one match earns 2 FPL points.",
    pages: ALL_PAGES,
    keywords: [
      "defensive stats", "dc threshold", "defcon threshold",
      "defensive contributions", "defensive contribution", "dc", "dc/game", "dc points", "defcon", "tackles", "clearances", "blocks",
      "interceptions", "recoveries", "cbi", "cbit", "defensive points", "2 points", "defensive actions", "defending stats",
      "why no dc for goalkeepers",
    ],
    related: ["find-defenders", "data-history"],
    body: (
      <>
        <Figures
          items={[
            { value: "10+", label: "for a defender: +2 points" },
            { value: "12+", label: "for a midfielder or forward" },
          ]}
        />
        <Terms
          rows={[
            ["Defenders", "clearances, blocks, interceptions, tackles"],
            ["Midfielders, forwards", "the same, plus recoveries"],
            ["Goalkeepers", "none: saves instead"],
          ]}
        />
      </>
    ),
  },
  {
    id: "bonus-bps",
    topic: TOPIC.numbers,
    title: "Bonus and BPS",
    answer: "BPS is FPL's match rating; the top three in a match get 3, 2 and 1 bonus points.",
    pages: ALL_PAGES,
    keywords: [
      "bonus", "bonus points", "bps", "bonus points system", "match rating", "3 2 1", "extra points", "who gets bonus", "bonus magnet",
      "ict", "influence", "creativity", "threat", "ict index", "rating", "score", "performance score", "bonus per game",
      "best bonus", "most bonus",
    ],
    related: ["statistics"],
    body: (
      <Terms
        rows={[
          ["Bonus", "bonus points he's been given"],
          ["BPS", "his total match rating"],
          ["ICT", "FPL's Influence, Creativity and Threat scores combined"],
        ]}
      />
    ),
  },
  {
    id: "set-pieces",
    topic: TOPIC.numbers,
    title: "Penalty and set-piece takers",
    answer: "Icons after a player's name: gold if he's his club's first choice, silver second, bronze third.",
    pages: ["player-explorer", "team-building"],
    keywords: [
      "penalty", "penalties", "penalty taker", "pen taker", "on pens", "pen order", "free kick", "free kicks", "fk order", "corner",
      "corners", "corner order", "set piece", "set pieces", "set piece taker", "who takes penalties", "first choice", "duty", "duties",
      "dead ball", "spot kick", "filter penalty takers", "filter set piece takers", "gold icon", "silver icon", "bronze icon", "medal", "icon next to name", "goal icon", "flag icon", "wall icon",
    ],
    related: ["today-only", "icons"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <Duty duty="penalties" order={1} />, label: "Goal:", text: "penalties" },
            { icon: <Duty duty="directFreekicks" order={1} />, label: "Wall:", text: "direct free kicks" },
            { icon: <Duty duty="corners" order={1} />, label: "Flag:", text: "corners and indirect free kicks" },
          ]}
        />
        <Chips
          items={[
            <>
              <Duty duty="penalties" order={1} /> first choice
            </>,
            <>
              <Duty duty="penalties" order={2} /> second
            </>,
            <>
              <Duty duty="penalties" order={3} /> third
            </>,
          ]}
        />
        <Label>Filter for them</Label>
        <Steps items={["Click ▾ on the Player header.", "Pick the icons you want, or a duty's name for all three.", "Enter. Players with any of them show."]} />
        <Points items={["Several duties, several icons. Hover one for what it means for him.", "FPL's lists today, so the same in every Data View."]} />
      </>
    ),
  },

  // ---------- Finding players ----------
  {
    id: "find-value",
    topic: TOPIC.finding,
    title: "Find good value",
    answer: "Player Explorer: filter Position and Price, then sort by Pts/£m.",
    pages: ["player-explorer", "team-building"],
    keywords: [
      "cheap midfielders", "cheap defenders", "cheap forwards", "cheap goalkeepers",
      "value", "good value", "bargain", "bargains", "cheap", "cheap players", "budget players", "budget picks", "enablers", "fodder",
      "points per million", "pts/£m", "value for money", "under 5m", "best value", "cheapest", "money", "price range", "low price", "underpriced",
    ],
    related: ["find-differentials", "sort-filter"],
    body: (
      <>
        <Flow steps={["Position ▾", "Price ▾ ≤ your budget", "Mins ▾ ≥ 855", "sort Pts/£m"]} />
        <Note>Swap Pts/£m for xGI/Game to see who's getting chances, not just points.</Note>
      </>
    ),
  },
  {
    id: "find-differentials",
    topic: TOPIC.finding,
    title: "Find differentials",
    answer: "Player Explorer: filter Own% low, then sort by points or xGI/Game.",
    pages: ["player-explorer", "team-building"],
    keywords: [
      "differential", "differentials", "low owned", "low ownership", "unowned", "under the radar", "hidden gem", "gems", "punt", "punts",
      "template", "avoid template", "own%", "ownership", "selected by", "few managers", "rank gains", "mini league", "unique", "rare picks",
    ],
    related: ["find-value", "colours"],
    body: (
      <>
        <Flow steps={["Own% ▾ ≤ 10", "Mins ▾ ≥ 855", "sort xGI/Game"]} />
        <Note>Lower ownership is greener, so differentials stand out.</Note>
      </>
    ),
  },
  {
    id: "find-attackers",
    topic: TOPIC.finding,
    title: "Find attacking threats",
    answer: "Sort by xGI/Game: who's getting the chances, whatever they've scored so far.",
    pages: ["player-explorer", "team-building", "dashboard"],
    keywords: [
      "attackers", "attacking", "goal threat", "threat", "goalscorers", "who will score", "chances", "xgi/game", "xg/game", "strikers",
      "forwards", "midfielders", "attacking midfielders", "assists", "creators", "who is creating", "goals", "best attackers", "returns", "hauls",
    ],
    related: ["xg-basics", "over-under"],
    body: (
      <>
        <Flow steps={["Position ▾ MID, FWD", "Mins ▾ ≥ 855", "sort xGI/Game"]} />
        <Points items={["Goals − xG below 0: chances that haven't gone in yet.", "A gold goal icon after his name: he's on penalties too."]} />
      </>
    ),
  },
  {
    id: "find-defenders",
    topic: TOPIC.finding,
    title: "Find defenders",
    answer: "Sort defenders by DC/Game and CS, then check their club's clean-sheet chances.",
    pages: ["player-explorer", "team-building"],
    keywords: [
      "defenders", "defence", "defense", "best defenders", "cheap defenders", "clean sheets", "cs", "dc/game", "defensive picks",
      "centre backs", "full backs", "wing backs", "attacking defenders", "backs", "clean sheet", "which defender", "def picks", "defensive returns",
      "defensive contribution points", "xgc",
    ],
    related: ["defensive-contributions", "fixture-forecast"],
    body: (
      <>
        <Flow steps={["Position ▾ DEF", "Mins ▾ ≥ 855", "sort DC/Game or CS"]} />
        <Note>A club's Fixture Forecast gives its clean-sheet chance in each of its next five matches.</Note>
      </>
    ),
  },
  {
    id: "find-keepers",
    topic: TOPIC.finding,
    title: "Find goalkeepers",
    answer: "Sort goalkeepers by Saves/Game and CS, and check xGC/Game (lower is better).",
    pages: ["player-explorer", "team-building"],
    keywords: [
      "goalkeeper", "goalkeepers", "keeper", "keepers", "gk", "gkp", "saves", "saves/game", "save points", "shot stopper", "clean sheets",
      "cs", "xgc", "xgc/game", "best keeper", "cheap keeper", "which keeper", "penalty saves", "bench keeper", "rotation keepers",
    ],
    related: ["find-defenders", "fixture-forecast"],
    body: <Flow steps={["Position ▾ GKP", "Mins ▾ ≥ 855", "sort Saves/Game or CS"]} />,
  },

  // ---------- Fixtures & gameweeks ----------
  {
    id: "fixture-difficulty",
    topic: TOPIC.fixtures,
    title: "Fixture difficulty",
    answer: "FPL rates every match 1 (easiest) to 5 (hardest); fixture chips are coloured by it.",
    pages: ["player-explorer", "team-building"],
    keywords: [
      "fixture difficulty", "fdr", "difficulty", "fixtures", "next 5 fixtures", "next five", "fixture chips", "fixture colours",
      "easy fixtures", "hard fixtures", "tough fixtures", "good run", "schedule", "upcoming games", "opponents", "home or away",
      "fixture swing", "fixture ticker", "next opponent", "who do they play",
    ],
    related: ["fixture-forecast", "double-blank"],
    body: (
      <>
        <DifficultyScale />
        <Points
          items={[
            "Player Explorer: turn on Next 5 Fixtures in Columns; it sorts by their average, easiest first.",
            "Team Building: Highlight → Fixtures shows them on the shirts.",
            "Hover a chip for the opponent and home or away.",
          ]}
        />
      </>
    ),
  },
  {
    id: "double-blank",
    topic: TOPIC.fixtures,
    title: "Double and blank gameweeks",
    answer: "A double gameweek adds both matches together; a blank one shows \"—\" and counts as 0 in a total.",
    pages: ["team-building"],
    keywords: [
      "double gameweek", "double", "dgw", "two games", "two matches", "blank gameweek", "blank", "bgw", "no game", "no match",
      "not playing this week", "postponed", "rearranged", "chip", "bench boost", "free hit", "triple captain", "fixture clash",
      "cup weekend", "gameweek without match",
    ],
    related: ["expected-points", "gameweeks"],
    body: (
      <Terms
        rows={[
          ["Double", "Expected Points and minutes add both matches; the Match Log lists two rows"],
          ["Blank", "\"—\" on the pitch; 0 in a total over several gameweeks"],
        ]}
      />
    ),
  },
  {
    id: "gameweeks",
    topic: TOPIC.fixtures,
    title: "Gameweeks and deadlines",
    answer: "Predictions start at the next gameweek you can still pick for, and move on by themselves after each deadline.",
    pages: ["team-building"],
    keywords: [
      "gameweek", "gameweeks", "gw", "deadline", "next deadline", "when is the deadline", "current gameweek", "next gameweek",
      "gw labels", "gameweek numbers", "move on", "after the deadline", "this week", "next week", "round", "matchday",
      "end of season", "gameweek arrows", "‹ ›", "which gameweek",
    ],
    related: ["top-bar", "expected-points"],
    body: (
      <>
        <IconKey rows={[{ icon: <CalendarIcon size={14} />, label: "Top bar:", text: "the next deadline (hover for the time)" }]} />
        <Points items={["Labelled with FPL's own numbers (GW9, GW10…).", "‹ › above the pitch steps through the next five.", "Near the season's end, only the gameweeks left."]} />
      </>
    ),
  },
  {
    id: "live-gameweek",
    topic: TOPIC.fixtures,
    title: "During a gameweek",
    answer: "Players' figures count a match from kick-off; club figures wait until FPL confirms it, hours after full time.",
    pages: ["player-explorer", "team-explorer", "team-building"],
    keywords: [
      "live gameweek", "during the gameweek", "matches in progress", "in progress", "in play", "live match", "kick off", "kicked off",
      "full time", "confirmed", "league table behind", "table not updated", "club figures behind", "points not updated",
      "why hasn't it updated", "a round behind", "this weekend", "today's games", "live points", "match day",
    ],
    related: ["updates", "team-explorer"],
    body: (
      <>
        <Terms
          rows={[
            ["Players' totals", "include a match from kick-off"],
            ["League table, club figures", "once FPL confirms it, then within the hour"],
            ["Team Building", "predictions skip a match that has kicked off"],
            ["Match Log", "only matches that have kicked off"],
          ]}
        />
        <Note>Player figures refresh every 10 minutes.</Note>
      </>
    ),
  },
  {
    id: "pre-season",
    topic: TOPIC.fixtures,
    title: "Before the season starts",
    answer: "Current Season shows \"—\" for everyone until the first match; the other Data Views have figures.",
    pages: ALL_PAGES,
    keywords: [
      "pre-season", "preseason", "pre season", "summer", "before the season", "season hasn't started", "no matches yet", "gameweek 1",
      "gw1", "start of season", "early season", "all dashes", "everything blank", "current season empty", "off season", "close season",
      "first gameweek", "august", "new season starts", "season start",
    ],
    related: ["data-views", "stopwatch"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <AnalysisModeIcon mode="live" size={16} />, label: "Current Season:", text: "\"—\" until a club has played" },
            { icon: <AnalysisModeIcon mode="lastSeason" size={16} />, label: "Last Completed Season:", text: "full figures" },
            { icon: <AnalysisModeIcon mode="historicAverage" size={16} />, label: "Historic Average:", text: "full figures" },
          ]}
        />
        <Points items={["The top bar reads Pre-season until a gameweek is under way.", "Early on, the minutes floor is 90, growing each gameweek."]} />
      </>
    ),
  },

  // ---------- Dashboard ----------
  {
    id: "dashboard-teams",
    topic: TOPIC.dashboard,
    title: "Team tiles and graphs",
    answer: "Switch the Dashboard to Teams for tiles and graphs of club figures.",
    pages: ["dashboard"],
    keywords: [
      "team tiles", "club tiles", "team graphs", "club graphs", "teams dashboard", "players teams toggle", "teams toggle", "league",
      "team leaderboard", "club leaderboard", "best teams", "team stats dashboard", "club figures", "final table", "last season table",
      "team ranking", "all teams", "pick teams", "5 teams", "clubs dashboard",
    ],
    related: ["club-figures", "dashboard-views"],
    body: (
      <Points
        items={[
          "Players / Teams, top right, switches between the two sets.",
          "All clubs, or up to 5 you pick.",
          "Last Completed Season shows that season's final table, not today's.",
        ]}
      />
    ),
  },
  {
    id: "graph-axes",
    topic: TOPIC.dashboard,
    title: "Reading a graph",
    answer: "Axes fit the data, not 0. A crowded axis switches to a log scale; hover a point for its real values.",
    pages: ["dashboard"],
    keywords: [
      "axis", "axes", "scale", "log scale", "logarithmic", "squashed", "crowded", "bunched", "outlier", "outliers", "zero", "not starting at 0",
      "square root", "√", "trend line missing", "no trend line", "dots", "points", "read graph", "graph looks wrong",
    ],
    related: ["dashboard-graphs"],
    body: (
      <>
        <Terms
          rows={[
            ["Log or √ scale", "when a few big values crowd the rest; the axis title says so"],
            ["Trend line", "both axes on one scale; left out when one is 5× the other"],
            [<MinutesFloorIcon key="s" size={13} />, "a player under the minutes floor, in place of his dot"],
          ]}
        />
      </>
    ),
  },
  {
    id: "dashboard-starter",
    topic: TOPIC.dashboard,
    title: "The Starter view",
    answer: "The app's ready-made Dashboard: last season's leaders, for players and for clubs.",
    pages: ["dashboard"],
    keywords: [
      "starter", "starter view", "default view", "ready made", "preset", "example dashboard", "built in", "cant edit starter",
      "read only", "starter tiles", "starter graphs", "price vs points", "xg vs goals", "last season leaders", "template", "packaged",
      "can't delete", "locked view", "default tiles", "original view",
    ],
    related: ["dashboard-views"],
    body: (
      <>
        <Label>Players</Label>
        <Chips items={["Points", "Pts/£m", "DC/Game", "Bonus", "xG vs Goals", "Price vs Points"]} />
        <Label>Clubs</Label>
        <Chips items={["FPL Points", "Clean Sheets", "DC/Game", "Bonus Points", "Team xG vs Goals", "Team xGC vs Goals Against"]} />
        <Note>All Last Completed Season, with players under the minutes floor left out. It can't be changed: Create View for your own.</Note>
      </>
    ),
  },
  {
    id: "dashboard-limits",
    topic: TOPIC.dashboard,
    title: "Dashboard limits",
    answer: `Up to ${MAX_SUMMARY_TILES} tiles and ${MAX_DASHBOARD_GRAPHS} graphs, Players and Teams counted together, and ${MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE} views each.`,
    pages: ["dashboard"],
    keywords: [
      "limit", "limits", "maximum", "max", "add another tile", "another tile", "another graph", "can't add tile", "cannot add tile", "can't add graph", "too many tiles", "too many graphs",
      "how many tiles", "how many graphs", "20 tiles", "10 graphs", "5 views", "view limit", "no more tiles", "remove one first",
      "push you past", "name taken", "same name",
    ],
    related: ["dashboard-views", "dashboard-tiles"],
    body: (
      <>
        <Figures
          items={[
            { value: String(MAX_SUMMARY_TILES), label: "tiles" },
            { value: String(MAX_DASHBOARD_GRAPHS), label: "graphs" },
            { value: String(MAX_SAVED_DASHBOARD_VIEWS_PER_SCOPE), label: "views each for Players and Teams" },
          ]}
        />
        <Points
          items={[
            "Tiles and graphs count the open Players and Teams views together: remove one from either to add another.",
            "Starter is one of the views. Each view needs its own name.",
          ]}
        />
      </>
    ),
  },
  {
    id: "unavailable-card",
    topic: TOPIC.dashboard,
    title: "An unavailable tile or card",
    answer: "Its statistic no longer exists, or comes from a source that's switched off. The bin removes it.",
    pages: ["dashboard", "player-comparison"],
    keywords: [
      "unavailable", "unavailable tile", "unavailable graph", "unavailable card", "no longer available", "statistic no longer available",
      "switched off", "second data source", "broken tile", "empty tile", "tile disappeared", "old tile", "can't edit tile", "remove tile",
      "stopped working", "understat off", "after update", "broken card", "broken graph", "dead tile",
    ],
    related: ["dashboard-views", "comparison-build"],
    body: (
      <>
        <Terms
          rows={[
            ["\"Statistic no longer available\"", "the app doesn't have it any more"],
            ["\"Second data source switched off\"", "it works again when the source is back"],
          ]}
        />
        <IconKey rows={[{ icon: <TrashIcon />, label: "Bin", text: "remove it, after you confirm" }]} />
      </>
    ),
  },

  // ---------- Player & Team Explorer ----------
  {
    id: "find-club",
    topic: TOPIC.tables,
    title: "Finding a club",
    answer: "Team Explorer's search finds a club by its name, short name or full name.",
    pages: ["team-explorer"],
    keywords: [
      "find club", "find team", "search club", "search team", "team name", "club name", "short name", "full name", "spurs", "tottenham",
      "man utd", "manchester united", "wolves", "forest", "can't find team", "team search", "club search", "abbreviation", "nickname",
      "which club",
    ],
    related: ["team-explorer", "club-pills"],
    body: (
      <Terms
        rows={[
          ["Tottenham", "Spurs"],
          ["TOT", "Spurs"],
        ]}
      />
    ),
  },
  {
    id: "view-notice",
    topic: TOPIC.tables,
    title: "A saved view didn't load everything",
    answer: "A note above the table names what can't be shown now; the saved view itself keeps it all.",
    pages: ["player-explorer", "team-explorer", "team-building"],
    keywords: [
      "loaded without", "loaded without a column", "didn't load everything", "can't be shown now", "view notice", "banner above table", "column gone", "filter gone", "saved view changed",
      "view incomplete", "view not loading", "part of view", "club no longer in league", "relegated club filter", "understat switched off",
      "dismiss", "amber banner", "notice", "saved view broken", "lost filter", "missing filter", "view missing column",
    ],
    related: ["saved-views", "left-fpl"],
    body: (
      <>
        <Label>Left out</Label>
        <Terms
          rows={[
            ["A column", "this version doesn't have"],
            ["A Team filter", "on a club no longer in the league"],
            ["An Understat column or ⇄", "while Understat is off, with its filter"],
          ]}
        />
        <IconKey rows={[{ icon: <CloseIcon size={14} />, label: "Dismiss", text: "the note" }]} />
        <Note>Saving over the view would drop those parts for good.</Note>
      </>
    ),
  },

  // ---------- Teams ----------
  {
    id: "club-figures",
    topic: TOPIC.teams,
    title: "How club figures work",
    answer: "What the club did that season, whoever was playing: a player's past stays with the club he was at.",
    pages: ["team-explorer", "dashboard"],
    keywords: [
      "club figures", "team figures", "team stats", "club stats", "transfers", "signing", "new signing", "summer signing", "left club",
      "sold", "loan", "who counts", "player moved", "promoted club", "relegated", "championship", "not in premier league", "historic average club",
      "club history", "team history",
    ],
    related: ["team-explorer", "historic-average"],
    body: (
      <Points
        items={[
          "A summer signing's last season stays with his old club.",
          "A season out of the Premier League is \"—\", never 0.",
          "No minutes floor for clubs.",
        ]}
      />
    ),
  },
  {
    id: "team-summary",
    topic: TOPIC.teams,
    title: "Team Summary and radars",
    answer: "The club's figures as tiles, each coloured against every club; hover for its place.",
    keywords: [
      "team summary", "club summary", "summary tiles", "team tiles", "attacking", "defensive", "balance", "goal difference", "xgd",
      "actual vs expected", "goals vs xg", "team radar", "club radar", "defense radar", "offense radar", "team strengths",
      "team weaknesses", "4th of 20", "place among clubs", "club ranking",
    ],
    related: ["team-profile", "club-figures"],
    body: (
      <>
        <Chips items={["Attacking", "Defensive", "Balance", "Actual vs Expected", "FPL"]} />
        <Note>On the Defense radar, more defensive contributions counts as better, so a dominant side can sit low there.</Note>
      </>
    ),
  },
  {
    id: "team-match-log",
    topic: TOPIC.teams,
    title: "A club's Match Log",
    answer: "Every match of a season, newest first, with the club's figures, Totals and Average.",
    keywords: [
      "team match log", "club match log", "team results", "club results", "match by match", "results", "scores", "team fixtures played",
      "per match", "club totals", "team average", "own goals", "goals excl ogs", "past season matches", "team games", "previous matches",
      "form guide", "recent results", "season results", "home and away",
    ],
    related: ["team-profile", "match-log"],
    body: (
      <>
        <Steps items={["Click a season's bar in the club's Points History.", "Its matches list below; click this season's bar to come back."]} />
        <Note>Goals here are its players' goals, so opponents' own goals aren't in them.</Note>
      </>
    ),
  },

  // ---------- Player Profile ----------
  {
    id: "profile-summary",
    topic: TOPIC.profiles,
    title: "Profile Summary",
    answer: "Every figure for the Data View as a tile, grouped and coloured against his position.",
    keywords: [
      "profile summary", "summary", "tiles", "player tiles", "defensive tiles", "offensive tiles", "actual vs expected", "value tiles",
      "player overview", "key stats", "player figures", "goalkeeper saves", "saves tiles", "summary card", "profile tiles", "at a glance",
      "player numbers", "top of profile", "summary groups", "position groups",
    ],
    related: ["percentile-radar", "player-profile"],
    body: (
      <Terms
        rows={[
          ["Defensive", "defenders, midfielders and goalkeepers"],
          ["Offensive", "defenders, midfielders and forwards"],
          ["Actual vs Expected", "goals and assists against xG and xA"],
          ["Value", "price-based figures"],
        ]}
      />
    ),
  },
  {
    id: "percentile-radar",
    topic: TOPIC.profiles,
    title: "Percentile Radar",
    answer: "Where he ranks in his position on each statistic: further out is better.",
    keywords: [
      "percentile radar", "radar", "spider", "spider chart", "web chart", "player radar", "defense radar", "offense radar", "radar shape",
      "radar axes", "percentiles", "ranking chart", "strengths", "weaknesses", "player shape", "compare to position", "outer edge",
      "100th percentile", "pizza chart", "polygon",
    ],
    related: ["profile-summary", "comparison-cards"],
    body: (
      <Terms
        rows={[
          ["Defenders, midfielders", "a Defense radar and an Offense radar"],
          ["Goalkeepers, forwards", "one combined radar"],
        ]}
      />
    ),
  },
  {
    id: "playing-time",
    topic: TOPIC.profiles,
    title: "Playing Time",
    answer: "A gauge of his average minutes a match for the season shown, at the top of the Match Log.",
    keywords: [
      "playing time", "gauge", "minutes per match", "average minutes", "minutes a game", "how much does he play", "nailed", "rotation",
      "sub", "substitute", "starts", "starting", "full 90", "90 minutes", "game time", "benched", "minutes chart", "dial", "meter", "regular",
    ],
    related: ["match-log", "expected-minutes"],
    body: <Note>Hover it for his matches and his rank among his position.</Note>,
  },
  {
    id: "match-log",
    topic: TOPIC.profiles,
    title: "Match Log",
    answer: "One row per match of a season, newest first, with Totals and Average.",
    keywords: [
      "match log", "matches", "match by match", "game log", "gamelog", "results", "past matches", "previous games", "totals", "average row",
      "per match", "each game", "history of matches", "season price", "start price", "end price", "his games", "fixture history",
      "recent form", "last few games",
    ],
    related: ["points-history", "playing-time"],
    body: (
      <>
        <Terms
          rows={[
            ["Totals", "the matches listed"],
            ["Average", "per match, ones he didn't play included"],
            ["—", "a match he didn't play, or a figure not recorded"],
          ]}
        />
        <Points items={["Heading: the season's price, start → end.", "Back to 2016/17; click a Points History bar for another season."]} />
      </>
    ),
  },
  {
    id: "profile-no-data",
    topic: TOPIC.profiles,
    title: "No figures in this Data View",
    answer: "He didn't play in those seasons; the profile suggests a Data View that has figures.",
    keywords: [
      "no figures", "no data", "empty profile", "nothing showing", "blank profile", "no stats", "new player", "new signing",
      "first season", "promoted player", "didn't play", "did not play", "zero minutes", "injured all season", "suggests", "try another view",
      "missing profile", "no history", "no record", "profile empty",
    ],
    related: ["data-views", "dash"],
    body: <Note>A new arrival has no Last Completed Season or Historic Average; Current Season has his figures.</Note>,
  },
  {
    id: "match-record-check",
    topic: TOPIC.profiles,
    title: "A past season's Match Log doesn't add up",
    answer: "A note above it gives both totals: the archive its matches come from is missing part of that season.",
    keywords: [
      "doesn't add up", "does not add up", "totals wrong", "match log wrong", "minutes don't match", "points don't match", "missing match",
      "missing game", "archive", "season total", "fpl total", "shortfall", "blue banner", "info banner", "match record", "falls short",
      "totals short", "past season totals", "incomplete season", "before 2016",
    ],
    related: ["match-log", "points-history"],
    body: (
      <Points
        items={[
          "FPL keeps no match-by-match record of past seasons, so the gap can't be filled.",
          "Points History's bar is FPL's own season total.",
          "Before 2016/17 there are no matches: FPL's season totals show instead.",
        ]}
      />
    ),
  },

  // ---------- Player Comparison ----------
  {
    id: "comparison-build",
    topic: TOPIC.comparison,
    title: "Build a comparison view",
    answer: "Click a + card in any section to add a radar, an Outputs list or a trend graph.",
    pages: ["player-comparison"],
    keywords: [
      "build view", "my view", "add card", "new card", "plus card", "edit card", "delete card", "remove card", "reorder cards", "drag cards",
      "card name", "rename card", "pick statistics", "choose stats", "comparison layout", "custom view", "create view", "5 views",
      "4 cards", "min minutes card",
    ],
    related: ["comparison", "comparison-cards"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <PlusIcon size={13} />, label: "+", text: "add a card (up to 4 a section)" },
            { icon: <EditIcon />, label: "Pencil", text: "edit it" },
            { icon: <TrashIcon />, label: "Bin", text: "remove it, after you confirm" },
          ]}
        />
        <Note>Drag a card to reorder. Each card has its own Data View and Min Minutes.</Note>
      </>
    ),
  },
  {
    id: "outputs-bars",
    topic: TOPIC.comparison,
    title: "Reading an Outputs bar",
    answer: "Grey as far as every player reaches; each coloured stretch is how far that player is past the one before.",
    pages: ["player-comparison"],
    keywords: [
      "outputs", "output bars", "bar", "bars", "markers", "tinted", "coloured stretch", "grey bar", "notches", "best in bold", "leader",
      "how far ahead", "gap between players", "who is ahead", "read outputs", "compare figures", "rows", "stat rows", "12 rows", "marker",
    ],
    related: ["comparison-cards"],
    body: (
      <Points
        items={[
          "Each player's marker sits at his figure, with the figure above it; the best is bold.",
          "Faint notches: a quarter, half and three quarters of the leader.",
          "For xGC, fewer is better, so the stretch is how far behind.",
        ]}
      />
    ),
  },
  {
    id: "trends",
    topic: TOPIC.comparison,
    title: "Trends",
    answer: "One statistic, season by season, for every player compared.",
    pages: ["player-comparison"],
    keywords: [
      "trends", "trend", "trend graph", "season by season", "over time", "career", "history", "improving", "declining", "past seasons",
      "line graph", "line chart", "gap", "dotted line", "not in fpl", "relegated", "missing season", "progress", "development", "years",
    ],
    related: ["comparison-cards"],
    body: (
      <Terms
        rows={[
          ["A gap", "no figure that season"],
          ["Dotted line", "a spell out of FPL, or a season he didn't play"],
          [<MinutesFloorIcon key="s" size={13} />, "under the minutes floor that season"],
        ]}
      />
    ),
  },

  // ---------- Team Building ----------
  {
    id: "add-players",
    topic: TOPIC.building,
    title: "Add Players",
    answer: "Player Explorer's table with predictions first: click Add on a row to put him in your squad.",
    pages: ["team-building"],
    keywords: [
      "add players", "add player", "player list", "add a player", "pick a player", "replacement", "replace", "transfer in", "buy", "sign", "who to buy",
      "exp pts columns", "1 to 5 gameweeks", "gameweeks ahead", "horizon", "next 3 gameweeks", "add button", "dialog", "search players",
      "shortlist", "predictive columns",
    ],
    related: ["build-squad", "expected-points"],
    body: (
      <>
        <Steps items={["Click a + on the pitch: it opens for that position.", "Pick 1–5 gameweeks on an Exp. Pts heading to add them up.", "Click Add."]} />
        <Note>Your squad is left out. Player Explorer's saved views load here too.</Note>
      </>
    ),
  },
  {
    id: "projected-points",
    topic: TOPIC.building,
    title: "Projected Points",
    answer: "Your starting XI's Expected Points for the gameweek shown, the captain counted twice.",
    pages: ["team-building"],
    keywords: [
      "projected points", "projected", "team points", "total points", "squad points", "how many points", "my score", "predicted score",
      "captain points", "points this week", "team total", "expected total", "score prediction", "xi points",
      "predicted points", "gameweek total", "fpl score", "team prediction", "green", "red", "colour", "color", "best possible",
      "optimal", "how close", "could score", "squad value", "bank", "summary",
    ],
    related: ["expected-points", "best-draft"],
    body: (
      <>
        <Terms
          rows={[
            ["Projected Points", "the XI's Expected Points, captain doubled"],
            ["Captain", "his points, already doubled"],
          ]}
        />
        <Label>Its colour, against Best Draft's total</Label>
        <ColourScale low="A fifth short" mid="A tenth short" high="Best Draft's" />
      </>
    ),
  },
  {
    id: "manage-squads",
    topic: TOPIC.building,
    title: "Save, switch and delete squads",
    answer: "Up to 5 squads: type in the squad box to rename it, ▾ to switch, and the bin deletes it.",
    pages: ["team-building"],
    keywords: [
      "save squad", "saved squads", "switch squad", "change squad", "rename squad", "delete squad", "remove squad", "squad name",
      "multiple squads", "5 squads", "wildcard draft", "second team", "drafts", "plans", "squad box", "load squad", "my squads",
      "greyed out", "disabled pitch", "new squad",
    ],
    related: ["build-squad", "import-team"],
    body: (
      <>
        <IconKey
          rows={[
            { icon: <CreateViewIcon />, label: "New Squad", text: "blank, or import yours" },
            { icon: <TrashIcon />, label: "Bin", text: "delete, after you confirm" },
          ]}
        />
        <Note>Everything saves as you go, the name included.</Note>
      </>
    ),
  },
  {
    id: "squad-rules",
    topic: TOPIC.building,
    title: "Squad rules",
    answer: `FPL's rules: ${SQUAD_RULES.squadSize} players, at most ${SQUAD_RULES.maxPerClub} from one club, and £${SQUAD_RULES.budget.toFixed(0)}m.`,
    pages: ["team-building"],
    keywords: [
      "rules", "squad rules", "fpl rules", "15 players", "how many players", "3 per club", "three per club", "club limit", "max per club",
      "budget", "100m", "formation", "valid formation", "legal formation", "starting 11", "how many defenders", "2 goalkeepers",
      "warning", "red budget", "over budget",
    ],
    related: ["build-squad", "sell-price"],
    body: (
      <>
        <Figures
          items={[
            { value: String(SQUAD.GKP), label: "goalkeepers" },
            { value: String(SQUAD.DEF), label: "defenders" },
            { value: String(SQUAD.MID), label: "midfielders" },
            { value: String(SQUAD.FWD), label: "forwards" },
          ]}
        />
        <Label>Starting XI</Label>
        <Chips items={[`${XI.GKP.min} GKP`, `${XI.DEF.min}–${XI.DEF.max} DEF`, `${XI.MID.min}–${XI.MID.max} MID`, `${XI.FWD.min}–${XI.FWD.max} FWD`]} />
        <Note>Over budget or a club's limit shows a warning; a short XI shows as open + places. Nothing stops you.</Note>
      </>
    ),
  },
  {
    id: "plan-transfer",
    topic: TOPIC.building,
    title: "Plan a transfer",
    answer: "Remove a player, then fill his place from Add Players, watching the Bank.",
    pages: ["team-building"],
    keywords: [
      "transfer", "transfers", "plan transfer", "make a transfer", "swap player", "sell player", "replace player", "who to sell",
      "who to bring in", "transfer planner", "free transfer", "hit", "-4", "upgrade", "downgrade", "funds", "money for transfer",
      "can i afford", "afford", "planning",
    ],
    related: ["sell-price", "add-players"],
    body: (
      <Steps
        items={[
          "Hover his shirt and remove him: his selling price goes back in the Bank.",
          "Click the + left in his place.",
          "Sort by Exp. Pts over 3–5 gameweeks and Add.",
        ]}
      />
    ),
  },
  {
    id: "purchase-prices",
    topic: TOPIC.building,
    title: "Purchase prices",
    answer: "What each player cost: that day's price if added here, or worked out from your FPL transfers if imported.",
    pages: ["team-building"],
    keywords: [
      "purchase price", "bought for", "bought at", "what i paid", "paid", "pay", "how much did i pay", "cost", "buying price", "original price", "price paid",
      "purchase", "dash purchase price", "missing purchase price", "unknown price", "transfer prices", "import prices", "sell price wrong",
      "selling price wrong", "joined late", "started late", "season start price",
    ],
    related: ["sell-price", "imported-budget"],
    body: (
      <>
        <Terms
          rows={[
            ["Added in Scoutline", "his price that day"],
            ["Imported, bought by transfer", "that transfer's price"],
            ["Imported, held since GW1", "his price at the season's start"],
            ["Imported, team started later", "today's price if it hasn't moved; otherwise \"—\""],
          ]}
        />
        <Note>Highlight → Price → Purchase shows them; hover a "—" for why. A new season clears them.</Note>
      </>
    ),
  },
  {
    id: "imported-budget",
    topic: TOPIC.building,
    title: "Budget of an imported squad",
    answer: "Your FPL bank plus what each imported player sells for, so an unchanged import has FPL's bank left.",
    pages: ["team-building"],
    keywords: [
      "imported budget", "import budget", "bank different", "bank wrong", "bank doesn't match", "bank doesnt match fpl", "budget wrong",
      "how much can i spend", "spending money", "remaining budget", "fpl bank", "same as fpl", "budget after import", "not 100m",
      "more than 100m", "less than 100m", "import again", "budget hover", "available money", "different budget",
    ],
    related: ["sell-price", "purchase-prices"],
    body: (
      <>
        <Flow steps={["FPL bank", "+ each player's selling price", "budget"]} />
        <Terms
          rows={[
            ["Kept", "counts at his selling price"],
            ["Added here", "counts at today's price"],
            ["Removed", "his selling price goes back"],
          ]}
        />
        <Note>A squad built from scratch has £{SQUAD_RULES.budget.toFixed(0)}m. If the budget's hover says to import again, do.</Note>
      </>
    ),
  },
  {
    id: "chip-weeks",
    topic: TOPIC.building,
    title: "Chips: Free Hit, Bench Boost, Triple Captain",
    answer: "Free Hit imports that week's temporary squad; Bench Boost imports the first 11 as the starting XI.",
    pages: ["team-building"],
    keywords: [
      "chip", "chips", "free hit", "bench boost", "triple captain", "wildcard chip", "chip week", "chip used", "temporary squad",
      "free hit squad", "import free hit", "import bench boost", "chip history", "which chips", "chips left", "chips used", "bench points",
      "captain tripled", "after free hit", "squad goes back",
    ],
    related: ["import-team", "projected-points"],
    body: (
      <>
        <Terms
          rows={[
            ["Free Hit", "that week's squad: import again after it for your own"],
            ["Bench Boost", "first 11 picks start, the rest on the bench"],
            ["Triple Captain", "Projected Points still doubles the captain"],
          ]}
        />
        <Note>No figure counts a chip, and the chips you've used aren't shown.</Note>
      </>
    ),
  },
  {
    id: "price-locked",
    topic: TOPIC.building,
    title: "Locked or Calibrating price",
    answer: "FPL has frozen his price for now (Locked) or is still settling his progress (Calibrating).",
    pages: ["team-building"],
    keywords: [
      "locked", "price locked", "locked price", "calibrating", "calibration", "price calibrating", "frozen price", "price frozen",
      "no progress", "progress missing", "locked until", "price change locked", "no price change", "won't change", "progress locked",
      "price status", "why locked", "lock date", "frozen", "settling",
    ],
    related: ["price-changes"],
    body: (
      <>
        <Terms
          rows={[
            ["Locked", "no price change until the date in its hover"],
            ["Calibrating", "FPL hasn't settled his progress yet"],
          ]}
        />
        <Note>Both show in Highlight → Price → Progress, as FPL shows them.</Note>
      </>
    ),
  },
  {
    id: "prediction-accuracy",
    topic: TOPIC.building,
    title: "How accurate are the predictions?",
    answer: "A guide, not a promise: Model Predicted is typically about 2 points out, per player per match.",
    pages: ["team-building"],
    keywords: [
      "accurate", "accuracy", "how accurate", "how good", "reliable", "trust", "trust predictions", "wrong prediction", "prediction wrong",
      "miss", "tested", "backtest", "proven", "evidence", "how good is the model", "can i trust", "better than fpl", "confidence",
      "model quality", "limitations",
    ],
    related: ["expected-points", "expected-minutes"],
    body: (
      <>
        <Figures items={[{ value: "~2", label: "points typical miss, per player per match" }]} />
        <Points items={["Proven on seasons it wasn't fitted on.", "Best at telling who will start; goals, clean sheets and bonus still fall as they do."]} />
        <Label>It doesn't know</Label>
        <Chips items={["injuries beyond the next round", "the manager's team sheet", "bench order", "automatic subs"]} />
      </>
    ),
  },

  // ---------- The app ----------
  {
    id: "keyboard",
    topic: TOPIC.app,
    title: "Keyboard shortcuts",
    answer: `${NOTEPAD_KEY} opens the notepad, Esc closes whatever's open, and Enter confirms.`,
    pages: ALL_PAGES,
    keywords: [
      "keyboard", "shortcuts", "shortcut", "keys", "hotkey", "hotkeys", "escape", "esc", "enter", "tab", "arrow keys", "backtick",
      "close", "keyboard only", "without mouse", "shift click", "double click", "key presses", "accessibility", "quick keys",
    ],
    related: ["notepad"],
    body: (
      <Terms
        rows={[
          [<Key key="k">{NOTEPAD_KEY}</Key>, "open or close the notepad"],
          [<Key key="k">Esc</Key>, "close a panel, profile, dialog or list"],
          [<Key key="k">Enter</Key>, "confirm a filter, add the highlighted player"],
          [<Key key="k">↓ ↑</Key>, "move through suggestions"],
          [<Key key="k">Tab</Key>, "reach a name; Enter opens his profile"],
          ["Shift-click", "add a tiebreak to a sort"],
        ]}
      />
    ),
  },
  {
    id: "saved-data",
    topic: TOPIC.app,
    title: "What's saved, and where",
    answer: "Your views, squads, notes and settings save as you go, on this computer, and survive updates.",
    pages: ALL_PAGES,
    keywords: [
      "saved", "save", "saving", "where is it saved", "lost", "lost my views", "lost my squad", "backup", "sync", "other computer",
      "cloud", "account", "settings", "my settings", "remember", "persist", "storage", "data saved", "my data", "reinstall",
    ],
    related: ["saved-views", "manage-squads"],
    body: (
      <>
        <Chips items={["Dashboard views", "saved table views", "comparison views", "squads", "notes", "colours on/off"]} />
        <Note>Tables start fresh each visit: a saved view brings yours back. Nothing is synced to other computers.</Note>
      </>
    ),
  },
  {
    id: "about-legal",
    topic: TOPIC.app,
    title: "About & Legal",
    answer: "At the bottom of the menu: the terms, the privacy notice and who owns the data.",
    keywords: [
      "about", "legal", "terms", "terms of use", "licence", "license", "privacy", "privacy notice", "copyright", "who made this",
      "affiliated", "official", "premier league", "fpl official", "data owner", "who owns the data", "version", "credits", "disclaimer", "contact",
    ],
    related: ["saved-data"],
    body: <Note>Scoutline is independent: not affiliated with or endorsed by the Premier League.</Note>,
  },
  {
    id: "install",
    topic: TOPIC.app,
    title: "Installing Scoutline",
    answer: "Run the setup file; if Windows warns you, choose More info → Run anyway. Then accept the terms.",
    keywords: [
      "install", "installing", "installer", "setup", "setup file", "download app", "windows protected your pc", "smartscreen", "warning",
      "run anyway", "more info", "unknown publisher", "unsigned", "is it safe", "first launch", "first time", "accept terms", "start menu",
      "desktop shortcut", "won't open after install",
    ],
    related: ["update-ready", "about-legal"],
    body: (
      <>
        <Steps
          items={[
            "Run the setup file.",
            "\"Windows protected your PC\": More info → Run anyway. Scoutline isn't signed, so Windows doesn't know it yet.",
            "Open Scoutline from the Start menu or desktop, and accept the terms.",
          ]}
        />
        <Note>The installer doesn't open it at the end. Only one copy runs: opening it again brings it forward.</Note>
      </>
    ),
  },
  {
    id: "update-ready",
    topic: TOPIC.app,
    title: "An update is ready",
    answer: "Restart now to update straight away, or Later and it installs when you next close Scoutline.",
    pages: ALL_PAGES,
    keywords: [
      "update ready", "update available", "new version available", "restart now", "later", "update dialog", "update popup",
      "update message", "install update", "download update", "progress bar", "app closed itself", "app restarted", "closed by itself",
      "update failed", "skip update", "postpone update", "when will it update", "update now", "reopen",
    ],
    related: ["updates", "install"],
    body: (
      <>
        <Terms
          rows={[
            ["Restart now", "closes, installs with a progress bar, reopens"],
            ["Later", "installs as you close it, then stays closed"],
            ["Already closed", "installs the next time you open it"],
          ]}
        />
        <Note>An open copy finds a new version within about 10 minutes. Your saved data stays.</Note>
      </>
    ),
  },
  {
    id: "left-fpl",
    topic: TOPIC.app,
    title: "When a player or club leaves FPL",
    answer: "Saved views and squads carry over each season; anyone no longer in FPL is dropped, and you're told.",
    pages: ["dashboard", "team-building"],
    keywords: [
      "left fpl", "no longer in fpl", "left the league", "sold abroad", "left the premier league", "relegated", "relegation", "new season",
      "player gone", "missing from squad", "squad banner", "tile renamed", "players no longer in fpl", "clubs no longer in fpl",
      "club no longer in fpl", "saved player missing", "fpl id", "renumbered", "rollover", "player removed",
    ],
    related: ["saved-data", "view-notice"],
    body: (
      <>
        <Terms
          rows={[
            ["Tile or graph", "drops them; with none left, its name adds \"(players no longer in FPL)\""],
            ["Club filter", "back to all clubs, its name adding \"(club no longer in FPL)\""],
            ["Squad", <>a banner names them; <TrashIcon /> removes them</>],
          ]}
        />
        <Note>FPL renumbers everyone each summer; Scoutline follows each player and club across.</Note>
      </>
    ),
  },
];
