import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TermsGate } from "./TermsGate";
import { TERMS_VERSION } from "../brand";
import { saveVersioned } from "../state/persistentStorage";

const KEY = "scoutline:terms-accepted:v1";

beforeEach(() => {
  localStorage.clear();
  delete window.electronWindow;
});
afterEach(cleanup);

describe("<terms_gate>", () => {
  it("asks on first launch, with the full terms available, and remembers the acceptance", () => {
    render(<TermsGate />);
    expect(screen.getByRole("dialog", { name: /welcome to scoutline/i })).toBeTruthy();
    expect(screen.getByText(/not affiliated with or endorsed by the Premier League/i)).toBeTruthy();
    expect(document.querySelector(".legal-text")?.textContent).toContain("LICENCE AND TERMS OF USE");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    render(<TermsGate />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks again when the terms have changed since they were accepted", () => {
    saveVersioned(KEY, 1, "2000-01-01");
    render(<TermsGate />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("stays out of the way once the current terms are accepted", () => {
    saveVersioned(KEY, 1, TERMS_VERSION);
    render(<TermsGate />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers Decline and close only in the desktop app, where there's a window to close", () => {
    render(<TermsGate />);
    expect(screen.queryByRole("button", { name: /decline/i })).toBeNull();
    cleanup();
    let closed = false;
    window.electronWindow = { minimize: () => {}, close: () => (closed = true) };
    render(<TermsGate />);
    fireEvent.click(screen.getByRole("button", { name: /decline and close/i }));
    expect(closed).toBe(true);
  });
});
