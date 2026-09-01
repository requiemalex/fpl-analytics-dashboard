import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppStateProvider } from "./state/AppStateContext";
import { AppShell } from "./components/AppShell";
import { LoadStateGate } from "./components/LoadStateGate";
import { PlayerDetailOverlay } from "./components/PlayerDetailOverlay";
import { Dashboard } from "./pages/Dashboard";
import { PlayerExplorer } from "./pages/PlayerExplorer";
import { UnderlyingNumbers } from "./pages/UnderlyingNumbers";
import { Teams } from "./pages/Teams";
import { TeamDetail } from "./pages/TeamDetail";
import { TeamBuilder } from "./pages/TeamBuilder";
import { PlayerComparison } from "./pages/PlayerComparison";
import { PriceWatch } from "./pages/PriceWatch";
import { ChipPlanner } from "./pages/ChipPlanner";
import { UserGuide } from "./pages/UserGuide";
import { Championship } from "./pages/Championship";

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            {/* Static, non-live data — doesn't touch AppStateContext, so it
                deliberately sits outside LoadStateGate: a live-FPL-API outage
                (or the cold-load spinner) shouldn't block a page that never
                depended on that data in the first place. */}
            <Route path="/championship" element={<Championship />} />
            <Route
              path="*"
              element={
                <LoadStateGate>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/players" element={<PlayerExplorer />} />
                    <Route path="/underlying" element={<UnderlyingNumbers />} />
                    <Route path="/teams" element={<Teams />} />
                    <Route path="/teams/:teamId" element={<TeamDetail />} />
                    <Route path="/team-building" element={<TeamBuilder />} />
                    <Route path="/price-watch" element={<PriceWatch />} />
                    <Route path="/chip-planner" element={<ChipPlanner />} />
                    <Route path="/player-comparison" element={<PlayerComparison />} />
                    <Route path="/guide" element={<UserGuide />} />
                  </Routes>
                  <PlayerDetailOverlay />
                </LoadStateGate>
              }
            />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AppStateProvider>
  );
}
