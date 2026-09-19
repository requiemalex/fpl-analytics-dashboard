import React from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { fmtTimeAgo, fmtDate } from "../utils/format";

type NavEntry =
  | { type: "link"; to: string; label: string }
  | { type: "separator" }
  | { type: "group"; label: string; links: { to: string; label: string }[] };

const NAV_STRUCTURE: NavEntry[] = [
  { type: "link", to: "/", label: "Dashboard" },
  { type: "separator" },
  {
    type: "group",
    label: "Analysis Tools",
    links: [
      { to: "/players", label: "Player Explorer" },
      { to: "/underlying", label: "Underlying Numbers" },
      { to: "/teams", label: "Teams" },
      { to: "/player-comparison", label: "Player Comparison" },
    ],
  },
  { type: "separator" },
  {
    type: "group",
    label: "Predictive Tools",
    links: [{ to: "/team-building", label: "Team Building" }],
  },
  { type: "separator" },
  { type: "link", to: "/guide", label: "User Guide" },
];

function WindowControls() {
  const electronWindow = window.electronWindow;
  if (!electronWindow) return null; // plain browser tab (dev server, etc.) — nothing to control

  return (
    <div className="window-controls">
      <button type="button" className="window-control" title="Minimize" onClick={() => electronWindow.minimize()}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="window-control close" title="Close" onClick={() => electronWindow.close()}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function GameweekLabel() {
  const { gameweekState, events } = useAppState();
  if (!gameweekState) return <span>Loading gameweek…</span>;
  if (gameweekState.kind === "current") {
    // FPL keeps an event marked "current" until the NEXT one's deadline
    // passes — even once this one's own matches have all finished — so
    // "in progress" alone goes stale for however long that gap lasts.
    if (gameweekState.event.finished) {
      const next = events.find((e) => e.isNext);
      return <span>{next ? `Gameweek ${next.id} deadline ${fmtDate(next.deadlineTime)}` : `Gameweek ${gameweekState.event.id} finished`}</span>;
    }
    return <span>Gameweek {gameweekState.event.id} · in progress</span>;
  }
  if (gameweekState.kind === "last-completed") return <span>Last completed: GW {gameweekState.event.id}</span>;
  return <span>Pre-season / No active gameweek</span>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, isStale, lastUpdated, refreshing, refresh, players, errorMessage } = useAppState();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          FPL<span>Analytics</span>
        </div>
        {NAV_STRUCTURE.map((entry, i) => {
          if (entry.type === "separator") return <div key={i} className="nav-separator" />;
          if (entry.type === "link") {
            return (
              <NavLink key={entry.to} to={entry.to} end={entry.to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                {entry.label}
              </NavLink>
            );
          }
          return (
            <div key={entry.label}>
              <div className="nav-group-label">{entry.label}</div>
              {entry.links.map((link) => (
                <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </aside>

      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-status">
            <span>
              <span className={`status-dot ${status === "error" ? "error" : isStale ? "stale" : "live"}`} />
              <GameweekLabel />
            </span>
            <span>{players.length.toLocaleString("en-GB")} players</span>
            <span>Updated {fmtTimeAgo(lastUpdated)}</span>
            {isStale && <span style={{ color: "var(--accent-value)" }}>Stale data — showing last successful fetch</span>}
          </div>
          <button className="btn primary" onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh Data"}
          </button>
        </div>
        <WindowControls />
      </header>

      <main className="main-content">
        {isStale && (
          <div className="banner stale">
            Showing cached data from {fmtTimeAgo(lastUpdated)} — the live API request failed. This is not necessarily current.
          </div>
        )}
        {errorMessage && status !== "error" && <div className="banner error">Refresh failed: {errorMessage}</div>}
        {children}
      </main>
    </div>
  );
}
