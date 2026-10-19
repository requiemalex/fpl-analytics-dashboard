import { useRef, useState } from "react";
import termsText from "../../../LICENSE.txt?raw";
import { APP_NAME, COPYRIGHT_HOLDER, TERMS_VERSION } from "../brand";
import { loadVersioned, saveVersioned, type VersionedStore } from "../state/persistentStorage";
import { useDialogFocus } from "../state/useDialogFocus";

const STORAGE_KEY = "scoutline:terms-accepted:v1";
const STORAGE_VERSION = 1;

/** The TERMS_VERSION last accepted on this computer, or null. */
const TERMS_STORE: VersionedStore<string | null> = {
  version: STORAGE_VERSION,
  fallback: null,
  migrate: (data) => (typeof data === "string" ? data : null),
};

/**
 * <terms_gate>: on first launch, and again whenever the terms change
 * (TERMS_VERSION, brand.ts), the app shows a summary of its terms and asks
 * the person to accept them before carrying on — so nobody uses it without
 * having seen them. Accepting is remembered on this computer. Declining
 * closes the desktop app; a plain browser tab has nothing to close, so it
 * only offers Accept.
 */
export function TermsGate() {
  const [accepted, setAccepted] = useState(() => loadVersioned(STORAGE_KEY, TERMS_STORE) === TERMS_VERSION);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(!accepted, dialogRef);
  if (accepted) return null;

  function accept() {
    saveVersioned(STORAGE_KEY, STORAGE_VERSION, TERMS_VERSION);
    setAccepted(true);
  }

  const electronWindow = window.electronWindow;
  return (
    <div className="dialog-backdrop">
      <div className="dialog terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" ref={dialogRef} tabIndex={-1}>
        <div className="dialog-title" id="terms-title">
          Welcome to {APP_NAME}
        </div>
        <ul className="terms-summary">
          <li>{APP_NAME} is independent: not affiliated with or endorsed by the Premier League, any club, or Understat.</li>
          <li>Its figures and predictions are for information only, may be wrong, and aren't betting or financial advice.</li>
          <li>The football data belongs to its owners; the app itself belongs to {COPYRIGHT_HOLDER}, licensed for your personal use.</li>
          <li>Your settings and saved work stay on this computer. There is no tracking.</li>
        </ul>
        <details className="legal-details">
          <summary>Read the full terms</summary>
          <pre className="legal-text">{termsText}</pre>
        </details>
        <div className="dialog-actions">
          {electronWindow && (
            <button type="button" className="btn" onClick={() => electronWindow.close()}>
              Decline and close
            </button>
          )}
          <button type="button" className="btn primary" onClick={accept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
