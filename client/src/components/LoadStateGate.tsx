import React from "react";
import { useAppState } from "../state/AppStateContext";

export function LoadStateGate({ children }: { children: React.ReactNode }) {
  const { status, errorMessage, refresh, refreshing } = useAppState();

  if (status === "loading") {
    return (
      <div className="empty-state" style={{ paddingTop: "18vh" }}>
        <h3>Loading live FPL data…</h3>
        <p>Fetching bootstrap-static from the official Fantasy Premier League API.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="empty-state" style={{ paddingTop: "18vh" }}>
        <h3>Couldn't load live FPL data</h3>
        <p style={{ maxWidth: 520, margin: "0 auto 16px" }}>{errorMessage}</p>
        <button className="btn primary" onClick={() => refresh()} disabled={refreshing}>
          {refreshing ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
