import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppStateProvider } from "./state/AppStateContext";
import { AppShell } from "./components/AppShell";
import { LoadStateGate } from "./components/LoadStateGate";
import { PlayerDetailOverlay } from "./components/PlayerDetailOverlay";
import { TeamDetailOverlay } from "./components/TeamDetailOverlay";

// Lazy-loaded per route: these pages (and recharts, which only they pull
// in) previously all sat in one ~880KB bundle parsed upfront on startup,
// whether or not that page was ever opened this session. Each now loads
// on first visit only.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const PlayerExplorer = lazy(() => import("./pages/PlayerExplorer").then((m) => ({ default: m.PlayerExplorer })));
const Teams = lazy(() => import("./pages/Teams").then((m) => ({ default: m.Teams })));
const TeamBuilder = lazy(() => import("./pages/TeamBuilder").then((m) => ({ default: m.TeamBuilder })));
const PlayerComparison = lazy(() => import("./pages/PlayerComparison").then((m) => ({ default: m.PlayerComparison })));
const UserGuide = lazy(() => import("./pages/UserGuide").then((m) => ({ default: m.UserGuide })));

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <AppShell>
          <LoadStateGate>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/players" element={<PlayerExplorer />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/player-comparison" element={<PlayerComparison />} />
                <Route path="/team-building" element={<TeamBuilder />} />
                <Route path="/guide" element={<UserGuide />} />
              </Routes>
            </Suspense>
            <PlayerDetailOverlay />
            <TeamDetailOverlay />
          </LoadStateGate>
        </AppShell>
      </BrowserRouter>
    </AppStateProvider>
  );
}
