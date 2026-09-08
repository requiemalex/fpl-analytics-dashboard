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
import { UserGuide } from "./pages/UserGuide";

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <AppShell>
          <LoadStateGate>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/players" element={<PlayerExplorer />} />
              <Route path="/underlying" element={<UnderlyingNumbers />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/teams/:teamId" element={<TeamDetail />} />
              <Route path="/player-comparison" element={<PlayerComparison />} />
              <Route path="/team-building" element={<TeamBuilder />} />
              <Route path="/guide" element={<UserGuide />} />
            </Routes>
            <PlayerDetailOverlay />
          </LoadStateGate>
        </AppShell>
      </BrowserRouter>
    </AppStateProvider>
  );
}
