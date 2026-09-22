import React from "react";
import type { AnalysisMode } from "../metrics/resolvePlayerStats";
import { ANALYSIS_MODE_OPTIONS } from "./AnalysisModeToggle";
import { AnalysisModeIcon } from "./AnalysisModeIcon";

/**
 * A small per-tile marker of which analysis mode ("data view") a Dashboard
 * tile was built from — each tile now carries its own (see
 * SummaryTileConfig.dataView), so with several tiles on screen at once
 * there's no single page-level toggle to read that off any more.
 */
export function DataViewBadge({ mode }: { mode: AnalysisMode }) {
  const label = ANALYSIS_MODE_OPTIONS.find((o) => o.mode === mode)?.label ?? mode;
  return (
    <span className="data-view-badge" title={`Data view: ${label}`} aria-label={`Data view: ${label}`}>
      <AnalysisModeIcon mode={mode} size={13} />
    </span>
  );
}
