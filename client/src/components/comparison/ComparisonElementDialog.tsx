import React, { useRef, useState } from "react";
import { DATA_VIEW_SEGMENTS } from "../AnalysisModeToggle";
import { MAX_NAME_LENGTH, MenuGroupHeading, MinutesSlider, SegmentedControl, SelectionMeter, useTextFilter } from "../MenuControls";
import { CrossoverGroupHeading } from "../SourceToggle";
import {
  COMPARISON_GROUP_LABELS,
  COMPARISON_GROUP_ORDER,
  COMPARISON_METRICS,
  OUTPUTS_MAX_METRICS,
  RADAR_MAX_METRICS,
  RADAR_MIN_METRICS,
} from "../../metrics/comparisonMetrics";
import { TREND_METRICS, TREND_METRIC_GROUP_ORDER } from "../../metrics/careerTrends";
import type { ComparisonElementKind, ElementSettings } from "../../state/useComparisonViews";

export const ELEMENT_NOUNS: Record<ComparisonElementKind, string> = { radar: "Radar Chart", outputs: "Outputs Panel", trend: "Trend Graph" };

/** One picker group of a second source's statistics, keyed as saved (<external_metric_key>). */
export interface ExternalChoiceGroup {
  heading: string;
  metrics: { key: string; label: string }[];
}

/** A second source's statistics for the dialog's pickers (Player Comparison passes them while one is mounted). */
export interface ExternalChoices {
  /** "Understat", for the crossover heading ("FPL & Understat"). */
  label: string;
  /** The source's colour class and icon, for its violet headings. */
  className: string;
  icon: React.ReactNode;
  /** FPL statistics (radar/Outputs, then trend) it has its own version of: listed under the crossover heading, switched on the card with ⇄. */
  crossoverKeys: string[];
  trendCrossoverKeys: string[];
  /** Its own statistics: radar axes and Outputs rows, then a trend graph's y axis. */
  groups: ExternalChoiceGroup[];
  trendGroups: ExternalChoiceGroup[];
}

function blankSettings(kind: ComparisonElementKind): ElementSettings {
  if (kind === "trend") return { kind, name: "", dataView: null, metricKeys: [TREND_METRICS[0].key], minMinutes: 0 };
  return { kind, name: "", dataView: "lastSeason", metricKeys: [], minMinutes: 0 };
}

/**
 * Add or edit one Player Comparison card. Every card needs a name and has
 * its own Min Minutes (0 by default — the app adds no floor where the user
 * can set one). A radar chart or Outputs panel picks its Data View and its
 * statistics (a radar 3–8 axes, an Outputs panel up to 12 rows); a trend
 * graph picks the one statistic on its y axis — its x axis is always the
 * seasons.
 */
export function ComparisonElementDialog({
  kind,
  initial,
  error,
  onSave,
  onCancel,
  external = null,
}: {
  kind: ComparisonElementKind;
  /** Set when editing an existing card. */
  initial?: ElementSettings;
  error?: string | null;
  onSave: (settings: ElementSettings) => void;
  onCancel: () => void;
  /**
   * A second source's statistics, when one is mounted, grouped as the
   * Explorers' Columns picker is (<same_toggle_everywhere>): green "FPL ·"
   * groups of FPL-only figures, one rose "FPL & <source>" group of the
   * figures both have (switched on the card with ⇄), then violet groups of
   * the source's own.
   */
  external?: ExternalChoices | null;
}) {
  const [settings, setSettings] = useState<ElementSettings>(() => initial ?? blankSettings(kind));
  const maxMetrics = kind === "radar" ? RADAR_MAX_METRICS : OUTPUTS_MAX_METRICS;
  // Every statistic this version knows, in the order axes and rows are kept: FPL's, then the second source's.
  const catalogue = [...COMPARISON_METRICS.map((m) => m.key), ...(external?.groups ?? []).flatMap((g) => g.metrics.map((m) => m.key))];
  // Only keys this version knows count (and are shown as picked).
  const picked = settings.metricKeys.filter((k) => catalogue.includes(k));
  // FPL's headings are the Explorers' ("FPL · …", green), with or without a second source (<same_toggle_everywhere>).
  const fplHeading = (label: string) => `FPL · ${label}`;
  const fplHeadingClass = "col-source-fpl";
  const crossover = new Set(external?.crossoverKeys ?? []);
  const trendCrossover = new Set(external?.trendCrossoverKeys ?? []);
  const name = settings.name.trim();

  // A name is optional: an unnamed card is titled by its kind, as its placeholder shows (as on the Dashboard).
  const problem =
    kind === "radar" && picked.length < RADAR_MIN_METRICS
      ? `Pick at least ${RADAR_MIN_METRICS} statistics: a radar needs 3 axes to make a shape.`
      : kind === "outputs" && picked.length === 0
        ? "Pick at least one statistic."
        : undefined;
  /** Add/Save was pressed with a problem: it shows in the dialog until fixed, as on the Dashboard. */
  const [submitTried, setSubmitTried] = useState(false);
  const [filter, setFilter] = useState("");
  const chipsRef = useRef<HTMLDivElement>(null);
  const noMatchRef = useRef<HTMLDivElement>(null);
  useTextFilter(chipsRef, filter, "button.chip", noMatchRef);

  function toggleMetric(key: string) {
    setSettings((prev) => {
      const current = prev.metricKeys.filter((k) => catalogue.includes(k));
      if (current.includes(key)) return { ...prev, metricKeys: current.filter((k) => k !== key) };
      if (current.length >= maxMetrics) return prev;
      // Kept in catalogue order, so axes and rows always read in the same order.
      const next = new Set([...current, key]);
      return { ...prev, metricKeys: catalogue.filter((k) => next.has(k)) };
    });
  }

  function trendChip(m: { key: string; label: string }) {
    const on = settings.metricKeys[0] === m.key;
    return (
      <button key={m.key} type="button" className={`chip${on ? " active" : ""}`} aria-pressed={on} onClick={() => setSettings((prev) => ({ ...prev, metricKeys: [m.key] }))}>
        {m.label}
      </button>
    );
  }

  function metricChip(m: { key: string; label: string }) {
    const on = picked.includes(m.key);
    return (
      <button key={m.key} type="button" className={`chip${on ? " active" : ""}`} aria-pressed={on} disabled={!on && picked.length >= maxMetrics} onClick={() => toggleMetric(m.key)}>
        {m.label}
      </button>
    );
  }

  function save() {
    if (problem) {
      setSubmitTried(true);
      return;
    }
    onSave({ ...settings, name, metricKeys: kind === "trend" ? settings.metricKeys : picked });
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">
          {initial ? "Edit" : "Add"} {ELEMENT_NOUNS[kind]}
        </div>
        <div className="field">
          <label htmlFor="cmp-element-name">Name</label>
          <input
            id="cmp-element-name"
            type="text"
            maxLength={MAX_NAME_LENGTH}
            placeholder={ELEMENT_NOUNS[kind]}
            value={settings.name}
            onChange={(e) => setSettings((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>

        {kind === "trend" ? (
          <>
            <div className="selection-meter">
              <div className="selection-meter-head">
                <span className="selection-meter-title">Y axis</span>
              </div>
            </div>
            <input
              type="text"
              className="columns-popover-filter"
              placeholder="Type to filter…"
              aria-label="Filter the statistics"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div ref={noMatchRef} className="columns-popover-empty" style={{ display: "none" }}>
              No statistic matches "{filter.trim()}".
            </div>
            <div className="menu-chips" ref={chipsRef}>
              {/* A heading with nothing under it (every figure in the crossover group) isn't shown, as in every picker. */}
              {TREND_METRIC_GROUP_ORDER.map((group) => {
                const metrics = TREND_METRICS.filter((m) => m.group === group && !trendCrossover.has(m.key));
                return (
                  metrics.length > 0 && (
                    <div key={group}>
                      <MenuGroupHeading group={group} label={fplHeading(group)} className={fplHeadingClass} />
                      <div className="chip-row">{metrics.map(trendChip)}</div>
                    </div>
                  )
                );
              })}
              {external && trendCrossover.size > 0 && (
                <div>
                  <CrossoverGroupHeading externalLabel={external.label} />
                  <div className="chip-row">{TREND_METRICS.filter((m) => trendCrossover.has(m.key)).map(trendChip)}</div>
                </div>
              )}
              {external?.trendGroups.map((g) => (
                <div key={g.heading}>
                  <MenuGroupHeading group={g.heading} label={g.heading} icon={external.icon} className={external.className} />
                  <div className="chip-row">{g.metrics.map(trendChip)}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <SegmentedControl
              label="Data View"
              options={DATA_VIEW_SEGMENTS}
              value={settings.dataView ?? "lastSeason"}
              onChange={(dataView) => setSettings((prev) => ({ ...prev, dataView }))}
            />
            <SelectionMeter title={kind === "radar" ? "Axes" : "Statistics"} count={picked.length} max={maxMetrics} />
            <input
              type="text"
              className="columns-popover-filter"
              placeholder="Type to filter…"
              aria-label="Filter the statistics"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div ref={noMatchRef} className="columns-popover-empty" style={{ display: "none" }}>
              No statistic matches "{filter.trim()}".
            </div>
            <div className="menu-chips" ref={chipsRef}>
              {COMPARISON_GROUP_ORDER.map((group) => {
                const metrics = COMPARISON_METRICS.filter((m) => m.group === group && !crossover.has(m.key));
                return (
                  metrics.length > 0 && (
                    <div key={group}>
                      <MenuGroupHeading group={group} label={fplHeading(COMPARISON_GROUP_LABELS[group])} className={fplHeadingClass} />
                      <div className="chip-row">{metrics.map(metricChip)}</div>
                    </div>
                  )
                );
              })}
              {external && crossover.size > 0 && (
                <div>
                  <CrossoverGroupHeading externalLabel={external.label} />
                  <div className="chip-row">{COMPARISON_METRICS.filter((m) => crossover.has(m.key)).map(metricChip)}</div>
                </div>
              )}
              {external?.groups.map((g) => (
                <div key={g.heading}>
                  <MenuGroupHeading group={g.heading} label={g.heading} icon={external.icon} className={external.className} />
                  <div className="chip-row">{g.metrics.map(metricChip)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <MinutesSlider
          id="cmp-element-min-minutes"
          value={settings.minMinutes}
          onChange={(minMinutes) => setSettings((prev) => ({ ...prev, minMinutes }))}
        />

        {submitTried && problem ? <div className="banner error">{problem}</div> : error && <div className="banner error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save}>
            {initial ? "Save Changes" : `Add ${ELEMENT_NOUNS[kind]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
