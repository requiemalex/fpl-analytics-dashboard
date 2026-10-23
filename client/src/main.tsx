import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
// The app's three typefaces, bundled so the app draws the same offline (<font_families>, styles/fontRule.ts).
import "@fontsource-variable/archivo";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/components.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
