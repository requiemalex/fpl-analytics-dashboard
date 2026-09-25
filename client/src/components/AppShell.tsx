import React from "react";
import { NavLink } from "react-router-dom";
import { useAppState } from "../state/AppStateContext";
import { fmtTimeAgo, fmtDate, fmtDateShort } from "../utils/format";

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

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, isStale, lastUpdated, refreshing, refresh, players, errorMessage, gameweekState, events } = useAppState();
  const gwInfo = getGameweekInfo(gameweekState, events);
  const statusTitle = status === "error" ? `Data error — ${errorMessage ?? "unknown"}` : isStale ? "Stale data — showing last successful fetch" : `Live — updated ${fmtTimeAgo(lastUpdated)}`;

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
                  <CalendarIcon />
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
            title={refreshing ? "Refreshing…" : `Refresh data — updated ${fmtTimeAgo(lastUpdated)}`}
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
            Showing cached data from {fmtTimeAgo(lastUpdated)} — the live API request failed. This is not necessarily current.
          </div>
        )}
        {errorMessage && status !== "error" && <div className="banner error">Refresh failed: {errorMessage}</div>}
        {children}
      </main>
    </div>
  );
}
