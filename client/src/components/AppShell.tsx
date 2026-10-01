import React from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { fmtTimeAgo, fmtDate, fmtDateShort } from "../utils/format";
import { CalendarIcon } from "./IconToolbar";

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
      { to: "/teams", label: "Team Explorer" },
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

type GameweekInfo = { label: string; title: string; deadlineIso: string | null };

/** Same underlying gameweekState logic the old text label used — reduced to a short "Gameweek N"-style tag plus (where there's an upcoming deadline worth showing) an ISO date for the calendar icon, with the full explanation kept as a hover tooltip rather than always-visible text. */
function getGameweekInfo(gameweekState: ReturnType<typeof useAppState>["gameweekState"], events: ReturnType<typeof useAppState>["events"]): GameweekInfo {
  if (!gameweekState) return { label: "Loading…", title: "Loading gameweek…", deadlineIso: null };
  if (gameweekState.kind === "current") {
    // FPL keeps an event marked "current" until the NEXT one's deadline
    // passes — even once this one's own matches have all finished — so
    // "in progress" alone goes stale for however long that gap lasts.
    if (gameweekState.event.finished) {
      const next = events.find((e) => e.isNext);
      return next
        ? { label: `Gameweek ${next.id}`, title: `Gameweek ${next.id} deadline ${fmtDate(next.deadlineTime)}`, deadlineIso: next.deadlineTime }
        : { label: `Gameweek ${gameweekState.event.id} finished`, title: `Gameweek ${gameweekState.event.id} finished`, deadlineIso: null };
    }
    return { label: `Gameweek ${gameweekState.event.id}`, title: `Gameweek ${gameweekState.event.id} · in progress`, deadlineIso: null };
  }
  if (gameweekState.kind === "last-completed") {
    return { label: `GW ${gameweekState.event.id} · final`, title: `Last completed: GW ${gameweekState.event.id}`, deadlineIso: null };
  }
  return { label: "Pre-season", title: "Pre-season / No active gameweek", deadlineIso: null };
}

/** One player: head and shoulders, on the shared 16-unit icon grid. */
function PersonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 14c0-2.9 2.3-4.9 5.2-4.9s5.2 2 5.2 4.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Two arcs chasing each other round: fetch everything again. */
function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13 6.4A5.2 5.2 0 0 0 3.6 4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 9.6a5.2 5.2 0 0 0 9.4 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.4 2.6v3.8H9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.6 13.4V9.6h3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, isStale, lastUpdated, refreshing, refresh, players, errorMessage, gameweekState, events } = useAppState();
  const gwInfo = getGameweekInfo(gameweekState, events);
  const statusTitle = status === "error" ? `Data error: ${errorMessage ?? "unknown"}` : isStale ? "Stale data: showing the last successful fetch" : `Live, updated ${fmtTimeAgo(lastUpdated)}`;

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
            <span className="topbar-status-group" title={statusTitle}>
              <span className={`status-dot ${status === "error" ? "error" : isStale ? "stale" : "live"}`} />
              {gwInfo.label}
            </span>
            {gwInfo.deadlineIso && (
              <>
                <span className="topbar-divider" />
                <span className="topbar-status-group" title={gwInfo.title}>
                  <CalendarIcon size={13} />
                  {fmtDateShort(gwInfo.deadlineIso)}
                </span>
              </>
            )}
            <span className="topbar-divider" />
            <span className="topbar-status-group" title={`${players.length.toLocaleString("en-GB")} players loaded`}>
              <PersonIcon />×{players.length.toLocaleString("en-GB")}
            </span>
          </div>
          <button
            type="button"
            className={`refresh-btn${refreshing ? " spinning" : ""}`}
            onClick={() => refresh()}
            disabled={refreshing}
            title={refreshing ? "Refreshing…" : `Refresh data (updated ${fmtTimeAgo(lastUpdated)})`}
            aria-label={refreshing ? "Refreshing…" : "Refresh data"}
          >
            <RefreshIcon />
          </button>
        </div>
        <WindowControls />
      </header>

      <main className="main-content">
        {isStale && (
          <div className="banner stale">
            Showing cached data from {fmtTimeAgo(lastUpdated)} because the live API request failed. It may not be current.
          </div>
        )}
        {errorMessage && status !== "error" && <div className="banner error">Refresh failed: {errorMessage}</div>}
        {children}
      </main>
    </div>
  );
}
