import React from "react";
import { FplSourceIcon, SourceSwapIcon } from "../components/SourceToggle";
import type { HelpGuide } from "../help/types";
import { Chips, HeaderKey, IconKey, Note, Points, Terms } from "../help/visuals";

/**
 * Understat's own Help guides (<help_guide>), handed to Help through the
 * external-stats slot (extensions/externalStats.ts), so they go when
 * Understat goes. Its statistics join Help's Statistics guide from its
 * columns.
 */

const TOPIC = "Understat";

export function understatHelpGuides(icon: React.ReactNode): HelpGuide[] {
  return [
    {
      id: "understat",
      topic: TOPIC,
      title: "Understat",
      answer: "A second, separate source with its own xG model, updated daily. Its figures are violet.",
      keywords: [
        "understat", "violet", "purple", "violet header", "second source", "other source", "two sources", "source", "disagree",
        "different", "dont match", "mismatch", "why different", "discrepancy", "assists differ", "minutes differ", "own goal",
        "npxg", "xgchain", "xgbuildup", "key passes", "ppda", "violet columns", "purple columns", "violet figures", "xpts", "amber dot", "out of date", "stale", "understat.com",
      ],
      related: ["source-switch", "shot-maps"],
      body: (
        <>
          <HeaderKey
            rows={[
              { header: "Shots", colour: "--col-understat", text: "Understat's own figure" },
              { header: "xA ⇄", colour: "--col-crossover", text: "both sources have it: switch with ⇄" },
            ]}
          />
          <Terms
            rows={[
              ["Assists", "FPL awards them more widely (about 2% of matches differ)"],
              ["Minutes", "FPL counts stoppage time"],
              ["Goals", "one source's goal can be the other's own goal"],
            ]}
          />
          <Note>Differences are expected: each column shows its own source's figure.</Note>
          <IconKey rows={[{ icon, label: "Amber dot on its icon:", text: "out of date (hover for why)", tone: "violet" }]} />
        </>
      ),
    },
    {
      id: "source-switch",
      topic: TOPIC,
      title: "The ⇄ switch",
      answer: "Swaps a column between FPL's figure and Understat's.",
      keywords: [
        "⇄", "swap", "switch", "arrows", "two arrows", "toggle source", "change source", "source switch", "fpl or understat",
        "use understat", "understat xg", "rose", "pink", "both sources", "crossover", "header arrows",
      ],
      related: ["understat"],
      body: (
        <>
          <IconKey rows={[{ icon: <SourceSwapIcon size={15} />, tone: "rose", label: "⇄", text: "on xG, xA, xGI, assists, minutes, xGC and Goals − xG" }]} />
          <HeaderKey
            rows={[
              { header: "xG ⇄", colour: "--accent-positive", text: "showing FPL's" },
              { header: "xG ⇄", colour: "--col-understat", text: "showing Understat's" },
            ]}
          />
          <Points items={["Starts on FPL each visit; a saved view remembers it.", "On a graph or radar it switches all of its shared figures."]} />
        </>
      ),
    },
    {
      id: "shot-maps",
      topic: TOPIC,
      title: "Shot maps",
      answer: "Where shots came from, zone by zone: each zone's share, count and average xG.",
      keywords: [
        "shot map", "shot maps", "shots", "zones", "heat map", "where shots", "shot location", "six yard box", "penalty area", "box",
        "outside the box", "long range", "shots faced", "shots taken", "faced", "taken", "conversion", "xg per shot", "understat views",
        "profile understat",
      ],
      related: ["understat"],
      body: (
        <>
          <Terms
            rows={[
              ["Taken", "midfielders, forwards and clubs"],
              ["Faced", "defenders, goalkeepers and clubs: shots while he was on the pitch"],
            ]}
          />
          <Chips items={["darker zone = more shots", "hover a zone for its goals", "far-out shots: the band along the bottom"]} />
        </>
      ),
    },
    {
      id: "formations",
      topic: TOPIC,
      title: "Formations",
      answer: "A club's most-used formations this season, with who started where. On its Team Profile.",
      keywords: [
        "formation", "formations", "lineup", "line up", "starting xi", "shape", "4-3-3", "4-2-3-1", "3-5-2", "back three", "back four",
        "who starts", "tactics", "system", "starters", "team sheet",
      ],
      related: ["understat"],
      body: (
        <Points
          items={[
            "Up to 3, each used for 90+ minutes; arrows step between them.",
            "Each name shows his starts there. A greyed-out name has left FPL.",
            "Beside it: minutes, xG for and against per 90, and goals.",
          ]}
        />
      ),
    },
    {
      id: "understat-profiles",
      topic: TOPIC,
      title: "Understat in a profile",
      answer: "An Understat · Views section, following the profile's Data View, opens with the figures that matter for his position.",
      keywords: [
        "understat views", "understat summary", "understat section", "profile understat", "violet section", "understat tiles",
        "shots faced", "goalkeeper understat", "defender understat", "midfielder understat", "forward understat", "key passes",
        "xgchain", "xgbuildup", "position summary", "creating", "shooting", "understat profile", "player understat", "club understat",
      ],
      related: ["shot-maps", "understat"],
      body: (
        <Terms
          rows={[
            ["Goalkeeper", "shots faced while he was on the pitch"],
            ["Defender", "shots faced, and his attacking figures"],
            ["Midfielder", "attacking and creating (key passes, xGChain, xGBuildup)"],
            ["Forward", "attacking and shooting"],
          ]}
        />
      ),
    },
    {
      id: "result-chances",
      topic: TOPIC,
      title: "Win, Draw and Loss Chance",
      answer: "In a club's Match Log: the result its chances deserved, worked out by Understat after the match.",
      keywords: [
        "win chance", "draw chance", "loss chance", "result chances", "deserved", "deserved result", "lucky win", "unlucky", "xpts",
        "expected points club", "pts − xpts", "points minus expected points", "luck", "match chances", "shots both sides", "should have won",
        "position column", "sub", "off the bench", "played position",
      ],
      related: ["team-match-log", "understat"],
      body: (
        <>
          <Points items={["From both sides' shots: a match that's been played, never a forecast.", "Its Average is coloured against every club that season."]} />
          <Note>A player's Match Log gains his Position in each match (Sub: off the bench).</Note>
        </>
      ),
    },
    {
      id: "understat-coverage",
      topic: TOPIC,
      title: "Which players and seasons Understat covers",
      answer: "Premier League seasons since 2016/17, matched to FPL's players automatically. It updates daily.",
      keywords: [
        "understat missing", "understat dash", "understat blank", "not matched", "player not found understat", "new signing understat",
        "promoted player", "championship season", "coverage", "which seasons", "how far back understat", "daily", "a day behind",
        "latest match missing", "matched", "matching", "default columns", "understat columns", "shots key passes npxgi", "understat seasons",
      ],
      related: ["understat", "dash"],
      body: (
        <Points
          items={[
            "Players are matched by the matches they played and their names; one not yet certain shows \"—\", never someone else's figures.",
            "A season outside the Premier League shows \"—\".",
            "The Explorers open with a few of its columns: Shots, Key Passes and NPxGI; for clubs Shots, Shots Against and Pts − xPts.",
          ]}
        />
      ),
    },
    {
      id: "source-icons",
      topic: TOPIC,
      title: "Source icons and title colours",
      answer: "A tile's, graph's or card's first icon and its title colour say whose figures it shows.",
      keywords: [
        "source icon", "source icons", "card icon", "tile icon", "graph icon", "first icon", "title colour", "green title", "violet title",
        "rose title", "pink title", "whose figures", "which source", "fpl or understat", "football icon", "goal icon", "card header",
        "tile header", "violet axis", "(understat)",
      ],
      related: ["understat", "source-switch"],
      body: (
        <>
          <IconKey
            rows={[
              { icon: <FplSourceIcon size={15} />, tone: "green", label: "FPL's figures", text: "(green title)" },
              { icon, tone: "violet", label: "Understat's figures", text: "(violet title)" },
              { icon: <SourceSwapIcon size={15} />, tone: "rose", label: "Both, or switchable", text: "(rose title)" },
            ]}
          />
          <Note>Understat's figures are named in violet on axes and hovers; only a CSV export spells out "(Understat)".</Note>
        </>
      ),
    },
    {
      id: "non-penalty",
      topic: TOPIC,
      title: "Non-penalty figures (NP)",
      answer: "NP Goals, NPxG and NPxGI leave penalties out, so a penalty taker isn't flattered.",
      keywords: [
        "non penalty", "non-penalty", "np", "npxg", "npxgi", "np goals", "npg", "without penalties", "excluding penalties", "no penalties",
        "penalty taker", "open play", "flattered", "pens", "penalties removed", "np goals − npxg", "npxg/game", "npxg/shot", "true threat",
        "real threat",
      ],
      related: ["understat", "set-pieces"],
      body: <Note>Compare NPxG with xG: the gap is his penalties.</Note>,
    },
    {
      id: "shot-location",
      topic: TOPIC,
      title: "Shots inside or outside the box",
      answer: "Where his shots come from: inside the penalty area (penalties included) or outside it. Together, every shot.",
      keywords: [
        "inside the box", "outside the box", "inside box", "outside box", "in the box", "box shots", "penalty area", "shot location",
        "where does he shoot", "long range", "long shots", "distance", "shots inside box", "shots outside box", "xg inside box",
        "xg outside box", "inside box %", "box %", "goals outside box", "shooting position",
      ],
      related: ["shot-maps", "set-piece-figures"],
      body: (
        <>
          <Chips items={["Shots", "Goals", "xG", "Inside-Box Shot %"]} />
          <Points items={["Counted from where each shot was taken, on the shot maps' box.", "Clubs have them too, for their shots and the shots they face."]} />
          <Note>Understat's own website can put a shot right on the line on the other side of it, about 1 in 100.</Note>
        </>
      ),
    },
    {
      id: "set-piece-figures",
      topic: TOPIC,
      title: "Set-piece and header figures",
      answer: "xG is the shots he took, xA the chances he set up: Corner xG is his shots after corners, Corner xA his deliveries.",
      keywords: [
        "set piece xg", "set-piece xg", "corner xg", "corner xa", "set piece xa", "corner chances", "chances from corners", "corners taken",
        "corner taker", "how many corners", "deliveries", "delivery", "free kick xg", "direct free kick", "headed xg", "headers", "headed xg from corners",
        "headed xg from crosses", "aerial threat", "penalty xg", "what is set piece xg", "dead balls",
      ],
      related: ["set-pieces", "shot-location"],
      body: (
        <Terms
          rows={[
            ["Set-Piece xG", "his shots after corners and free kicks, penalties left out"],
            ["Corner xG", "his shots after corners"],
            ["Corner xA", "chances he set up after corners"],
            ["Corner Chances Created", "how many: the nearest to corners taken, which no source counts"],
            ["Headed xG from Corners", "his headers after corners"],
            ["Headed xG from Crosses", "his headers from open-play crosses"],
            ["Penalty xG", "0.76 a penalty, whoever takes it"],
          ]}
        />
      ),
    },
    {
      id: "club-xg-per-chance",
      topic: TOPIC,
      title: "Club xG below its players' added up",
      answer: "Understat counts a shot and its rebound as one chance, so a club's xG can be less than its players' total.",
      keywords: [
        "club xg", "team xg", "club xg lower", "players xg added up", "sum of players", "rebound", "rebounds", "second chance", "one chance",
        "per chance", "xg per chance", "team total xg", "xg mismatch", "club vs players", "lower than players", "understat club xg",
        "team xg wrong", "club xg wrong",
      ],
      related: ["understat", "club-figures"],
      body: <Note>xG/Shot and the situation figures still count every shot on its own.</Note>,
    },
  ];
}
