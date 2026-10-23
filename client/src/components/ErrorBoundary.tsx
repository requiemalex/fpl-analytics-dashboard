import React from "react";
import { useLocation } from "react-router-dom";

/**
 * <crash_screen>: a display bug used to blank the whole window, with no
 * message and no way back but restarting the app (audit 2026-10-23, finding
 * 6). Now it shows what went wrong and a Reload button, in LoadStateGate's
 * style, and logs it (console.error, which the desktop app's log records:
 * <app_log>). Two of them: one around the pages and overlays, so the menu
 * still works and any change of address (another page, a profile closed)
 * clears it, and one around the whole app (main.tsx) for anything outside
 * them. A page that fails to load its code (a missing file) lands here too.
 * Reload drops the address's overlay part (?player=…), so a profile that
 * fails to draw doesn't fail again straight after.
 */
interface Props {
  scope: "page" | "app";
  /** The address: when it changes, what failed is tried again. */
  resetKey?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Display error (${this.props.scope}): ${error.message}`, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" style={{ paddingTop: "18vh" }} role="alert">
        <h3>{this.props.scope === "page" ? "Something went wrong on this page" : "Something went wrong"}</h3>
        <p style={{ maxWidth: 520, margin: "0 auto 16px" }}>{this.state.error.message || String(this.state.error)}. Your saved data is safe.</p>
        <button className="btn primary" onClick={() => window.location.assign(window.location.pathname)}>
          Reload
        </button>
      </div>
    );
  }
}

/** The pages' and overlays' boundary, cleared by any change of address. Inside the router. */
export function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname, search } = useLocation();
  return (
    <ErrorBoundary scope="page" resetKey={pathname + search}>
      {children}
    </ErrorBoundary>
  );
}
