import React from "react";

/**
 * The pieces Help guides are drawn with (<help_guide>): numbered steps,
 * an icon key, big figures, a colour scale, a hover example and so on —
 * so a guide shows its point instead of explaining it. Icons are the
 * app's own components, so a guide changes whenever an icon does.
 */

/** Numbered steps, in order. */
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="help-steps">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

/** A few short points. */
export function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="help-points">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** One muted line under a visual. */
export function Note({ children }: { children: React.ReactNode }) {
  return <p className="help-note">{children}</p>;
}

/** A small uppercase label over a visual. */
export function Label({ children }: { children: React.ReactNode }) {
  return <div className="help-label">{children}</div>;
}

/** Icon → what it means. `tone` colours the icon's square. */
export function IconKey({ rows }: { rows: { icon: React.ReactNode; label: string; text?: React.ReactNode; tone?: "amber" | "green" | "violet" | "rose" | "muted" }[] }) {
  return (
    <div className="help-iconkey">
      {rows.map((r) => (
        <div className="help-iconkey-row" key={r.label}>
          <span className={`help-icon-square${r.tone ? ` tone-${r.tone}` : ""}`}>{r.icon}</span>
          <span>
            <b>{r.label}</b>
            {r.text && <> {r.text}</>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Big numbers with a caption each. */
export function Figures({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className="help-figures">
      {items.map((f) => (
        <div className="help-figure" key={f.label}>
          <b>{f.value}</b>
          <span>{f.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Steps joined by arrows, the last one highlighted. */
export function Flow({ steps }: { steps: React.ReactNode[] }) {
  return (
    <div className="help-flow">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="help-flow-arrow">→</span>}
          <span className={`help-flow-step${i === steps.length - 1 ? " last" : ""}`}>{s}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Small labels in a row. */
export function Chips({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="help-chips">
      {items.map((c, i) => (
        <span className="help-chip" key={i}>
          {c}
        </span>
      ))}
    </div>
  );
}

/** Term → meaning, as a compact two-column table. */
export function Terms({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <table className="help-terms">
      <tbody>
        {rows.map(([term, meaning], i) => (
          <tr key={i}>
            <td>{term}</td>
            <td>{meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What a hover box says, as it appears. */
export function HoverExample({ lines }: { lines: string[] }) {
  return <div className="help-hover">{lines.join("\n")}</div>;
}

/** The comparative colour scale: red at the bottom of the pool, none around average, green at the top. */
export function ColourScale({ low = "Bottom", mid = "About average: none", high = "Top" }: { low?: string; mid?: string; high?: string }) {
  return (
    <div>
      <div className="help-scale" role="img" aria-label={`${low}: red. ${mid}. ${high}: green`} />
      <div className="help-scale-labels">
        <span>{low}</span>
        <span>{mid}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/** Two things side by side: what goes into each, and what comes out. */
export function TwoWays({ ways }: { ways: { title: string; inputs: string[]; result: string }[] }) {
  return (
    <div className="help-twoways">
      {ways.map((w) => (
        <div className="help-way" key={w.title}>
          <b>{w.title}</b>
          <Chips items={w.inputs} />
          <span className="help-way-result">→ {w.result}</span>
        </div>
      ))}
    </div>
  );
}

/** Colour swatches with labels (a chart's series colours). */
export function Swatches({ items }: { items: { colour: string; label: string }[] }) {
  return (
    <div className="help-swatches">
      {items.map((s) => (
        <span key={s.label}>
          <i style={{ background: `var(${s.colour})` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** A column header as it looks, in a colour token, with what that colour means. */
export function HeaderKey({ rows }: { rows: { header: string; colour: string; text: string }[] }) {
  return (
    <div className="help-headerkey">
      {rows.map((r) => (
        <div className="help-headerkey-row" key={r.header}>
          <span className="help-header" style={{ color: `var(${r.colour})` }}>
            {r.header}
          </span>
          <span>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Seasons as tiles: counted (green), not counted (struck through, amber), with a small figure each. */
export function SeasonStrip({ seasons }: { seasons: { season: string; figure: string; counts: boolean }[] }) {
  return (
    <div className="help-strip">
      {seasons.map((s) => (
        <div className={`help-season ${s.counts ? "counts" : "skipped"}`} key={s.season}>
          <b>{s.season}</b>
          {s.figure}
        </div>
      ))}
    </div>
  );
}

/** Bars over a run of seasons: which data exists from when. `from`/`to` are 0-based season indexes into `seasons`. */
export function SeasonBars({ seasons, rows }: { seasons: string[]; rows: { label: string; from: number; to?: number; tone?: "green" | "violet" | "live" }[] }) {
  const n = seasons.length;
  return (
    <div className="help-bars">
      <span />
      <div className="help-bars-axis">
        <span>{seasons[0]}</span>
        <span>{seasons[Math.floor((n - 1) / 2)]}</span>
        <span>{seasons[n - 1]}</span>
      </div>
      {rows.map((r) => (
        <React.Fragment key={r.label}>
          <span className="help-bars-label">{r.label}</span>
          <div className="help-bars-track">
            <i className={`tone-${r.tone ?? "green"}`} style={{ left: `${(r.from / n) * 100}%`, right: `${((n - 1 - (r.to ?? n - 1)) / n) * 100}%` }} />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/** A keyboard key. */
export function Key({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}
