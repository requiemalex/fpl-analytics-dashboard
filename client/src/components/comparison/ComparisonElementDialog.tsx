import React, { useState } from "react";
import { DATA_VIEW_SEGMENTS } from "../AnalysisModeToggle";
import { MenuGroupHeading, MinutesSlider, SegmentedControl, SelectionMeter } from "../MenuControls";
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

/** Longest name a card or view takes — the same limit as the Dashboard's. */
export const MAX_NAME_LENGTH = 60;

export const ELEMENT_NOUNS: Record<ComparisonElementKind, string> = { radar: "Radar Chart", outputs: "Outputs Panel", trend: "Trend Graph" };

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
}: {
  kind: ComparisonElementKind;
  /** Set when editing an existing card. */
  initial?: ElementSettings;
  error?: string | null;
  onSave: (settings: ElementSettings) => void;
  onCancel: () => void;
}) {
  const [settings, setSettings] = useState<ElementSettings>(() => initial ?? blankSettings(kind));
  const maxMetrics = kind === "radar" ? RADAR_MAX_METRICS : OUTPUTS_MAX_METRICS;
  // Only keys this version knows count (and are shown as picked).
  const picked = settings.metricKeys.filter((k) => COMPARISON_METRICS.some((m) => m.key === k));
  const name = settings.name.trim();

  const problem = !name
    ? "Name is required"
    : kind === "radar" && picked.length < RADAR_MIN_METRICS
      ? `Pick at least ${RADAR_MIN_METRICS} statistics: a radar needs 3 axes to make a shape`
      : kind === "outputs" && picked.length === 0
        ? "Pick at least one statistic"
        : undefined;

  function toggleMetric(key: string) {
    setSettings((prev) => {
      const current = prev.metricKeys.filter((k) => COMPARISON_METRICS.some((m) => m.key === k));
      if (current.includes(key)) return { ...prev, metricKeys: current.filter((k) => k !== key) };
      if (current.length >= maxMetrics) return prev;
      // Kept in catalogue order, so axes and rows always read in the same order.
      const next = new Set([...current, key]);
      return { ...prev, metricKeys: COMPARISON_METRICS.filter((m) => next.has(m.key)).map((m) => m.key) };
    });
  }

  function save() {
    if (problem) return;
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
            placeholder={kind === "radar" ? "e.g. Attacking Shape" : kind === "outputs" ? "e.g. Last Season Output" : "e.g. Points by Season"}
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
            <div className="menu-chips">
              {TREND_METRIC_GROUP_ORDER.map((group) => (
                <div key={group}>
                  <MenuGroupHeading group={group} />
                  <div className="chip-row">
                    {TREND_METRICS.filter((m) => m.group === group).map((m) => {
                      const on = settings.metricKeys[0] === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          className={`chip${on ? " active" : ""}`}
                          aria-pressed={on}
                          onClick={() => setSettings((prev) => ({ ...prev, metricKeys: [m.key] }))}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
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
            <div className="menu-chips">
              {COMPARISON_GROUP_ORDER.map((group) => (
                <div key={group}>
                  <MenuGroupHeading group={group} label={COMPARISON_GROUP_LABELS[group]} />
                  <div className="chip-row">
                    {COMPARISON_METRICS.filter((m) => m.group === group).map((m) => {
                      const on = picked.includes(m.key);
                      return (
                        <button
                          key={m.key}
                          type="button"
                          className={`chip${on ? " active" : ""}`}
                          aria-pressed={on}
                          disabled={!on && picked.length >= maxMetrics}
                          onClick={() => toggleMetric(m.key)}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
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

        {error && <div className="banner error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!!problem} title={problem}>
            {initial ? "Save Changes" : `Add ${ELEMENT_NOUNS[kind]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
