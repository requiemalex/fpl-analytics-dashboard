import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppStateProvider } from "./state/AppStateContext";
import { AppShell } from "./components/AppShell";
import { LoadStateGate } from "./components/LoadStateGate";
import { PageErrorBoundary } from "./components/ErrorBoundary";
import { PlayerDetailOverlay } from "./components/PlayerDetailOverlay";
import { TeamDetailOverlay } from "./components/TeamDetailOverlay";
import { TermsGate } from "./components/TermsGate";
import { useComparativeColour } from "./state/comparativeColour";
import { useFinishedGameweeks } from "./state/seasonProgress";
// Understat (optional second source): this import and the provider below are its only connection to the app.
import { UnderstatProvider } from "./understat/UnderstatProvider";

// Lazy-loaded per route: these pages (and recharts, which only they pull
// in) previously all sat in one ~880KB bundle parsed upfront on startup,
// whether or not that page was ever opened this session. Each now loads
// on first visit only.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const PlayerExplorer = lazy(() => import("./pages/PlayerExplorer").then((m) => ({ default: m.PlayerExplorer })));
const Teams = lazy(() => import("./pages/Teams").then((m) => ({ default: m.Teams })));
const TeamBuilder = lazy(() => import("./pages/TeamBuilder").then((m) => ({ default: m.TeamBuilder })));
const PlayerComparison = lazy(() => import("./pages/PlayerComparison").then((m) => ({ default: m.PlayerComparison })));
const Legal = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Legal })));

export default function App() {
  // Subscribed here so switching comparative colouring re-renders every page
  // and overlay, which then paint (or don't) through percentileTint
  // (<comparative_colour_switch>).
  useComparativeColour();
  // Likewise for Current Season's minutes floor, which grows with the
  // gameweeks finished (<fixed_minutes_floor>).
  useFinishedGameweeks();
  return (
    <AppStateProvider>
      <UnderstatProvider>
        <BrowserRouter>
          <AppShell>
            <LoadStateGate>
              <PageErrorBoundary>
                <Suspense fallback={null}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/players" element={<PlayerExplorer />} />
                    <Route path="/teams" element={<Teams />} />
                    <Route path="/player-comparison" element={<PlayerComparison />} />
                    <Route path="/team-building" element={<TeamBuilder />} />
                    <Route path="/legal" element={<Legal />} />
                  </Routes>
                </Suspense>
                <PlayerDetailOverlay />
                <TeamDetailOverlay />
              </PageErrorBoundary>
            </LoadStateGate>
          </AppShell>
          <TermsGate />
        </BrowserRouter>
      </UnderstatProvider>
    </AppStateProvider>
  );
}
