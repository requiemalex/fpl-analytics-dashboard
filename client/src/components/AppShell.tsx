import React from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { fmtTimeAgo } from "../utils/format";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/players", label: "Player Explorer" },
  { to: "/underlying", label: "Underlying Numbers" },
  { to: "/teams", label: "Teams" },
  { to: "/team-building", label: "Team Building" },
  { to: "/price-watch", label: "Price Watch" },
  { to: "/chip-planner", label: "Chip Planner" },
  { to: "/player-comparison", label: "Player Comparison" },
  { to: "/guide", label: "User Guide" },
];

function GameweekLabel() {
  const { gameweekState } = useAppState();
  if (!gameweekState) return <span>Loading gameweek…</span>;
  if (gameweekState.kind === "current") return <span>Gameweek {gameweekState.event.id} · in progress</span>;
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
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            {item.label}
          </NavLink>
        ))}
      </aside>

      <header className="topbar">
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
