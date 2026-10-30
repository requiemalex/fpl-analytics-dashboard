import React from "react";
import { SourceSwapIcon } from "../components/SourceToggle";
import type { HelpGuide } from "../help/types";
import { Chips, HeaderKey, IconKey, Note, Points, Terms } from "../help/visuals";

/**
 * Understat's own Help guides (<help_guide>), handed to Help through the
 * external-stats slot (extensions/externalStats.ts), so they go when
 * Understat goes. Its statistics get their entries from its columns.
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
  ];
}
