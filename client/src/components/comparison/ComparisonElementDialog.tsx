import React, { useState } from "react";
import { ANALYSIS_MODE_OPTIONS } from "../AnalysisModeToggle";
import type { AnalysisMode } from "../../metrics/resolvePlayerStats";
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

/** Min Minutes steps by one full match, as the Dashboard's does. */
const MINUTES_STEP = 90;

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
  // What's typed in Min Minutes, kept while editing so a blank or part-typed
  // number isn't snapped back (the same as FiltersBar's).
  const [minMinutesDraft, setMinMinutesDraft] = useState<string | null>(null);

  function typeMinMinutes(raw: string) {
    setMinMinutesDraft(raw);
    const n = Math.floor(Number(raw));
    setSettings((prev) => ({ ...prev, minMinutes: raw.trim() === "" || !Number.isFinite(n) ? 0 : Math.max(0, n) }));
  }
  const maxMetrics = kind === "radar" ? RADAR_MAX_METRICS : OUTPUTS_MAX_METRICS;
  // Only keys this version knows count (and are shown as picked).
  const picked = settings.metricKeys.filter((k) => COMPARISON_METRICS.some((m) => m.key === k));
  const name = settings.name.trim();

  const problem = !name
    ? "Name is required"
    : kind === "radar" && picked.length < RADAR_MIN_METRICS
      ? `Pick at least ${RADAR_MIN_METRICS} statistics — a radar needs 3 axes for a shape`
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
          <div className="field">
            <label htmlFor="cmp-element-y">Y axis</label>
            <select id="cmp-element-y" value={settings.metricKeys[0] ?? ""} onChange={(e) => setSettings((prev) => ({ ...prev, metricKeys: [e.target.value] }))}>
              {TREND_METRIC_GROUP_ORDER.map((group) => (
                <optgroup key={group} label={group}>
                  {TREND_METRICS.filter((m) => m.group === group).map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="cmp-element-dataview">Data View</label>
              <select
                id="cmp-element-dataview"
                value={settings.dataView ?? "lastSeason"}
                onChange={(e) => setSettings((prev) => ({ ...prev, dataView: e.target.value as AnalysisMode }))}
              >
                {ANALYSIS_MODE_OPTIONS.map((o) => (
                  <option key={o.mode} value={o.mode}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                {kind === "radar" ? "Axes" : "Statistics"} ({picked.length}/{maxMetrics})
              </label>
              <div className="cmp-metric-picker">
                {COMPARISON_GROUP_ORDER.map((group) => (
                  <div key={group}>
                    <div className="cmp-metric-picker-group">{COMPARISON_GROUP_LABELS[group]}</div>
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
            </div>
          </>
        )}

        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="cmp-element-min-minutes">Min minutes</label>
          <input
            id="cmp-element-min-minutes"
            type="number"
            step={MINUTES_STEP}
            min={0}
            value={minMinutesDraft ?? String(settings.minMinutes)}
            onChange={(e) => typeMinMinutes(e.target.value)}
            onBlur={() => setMinMinutesDraft(null)}
          />
        </div>

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
