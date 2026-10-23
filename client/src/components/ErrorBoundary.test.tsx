import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary, PageErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

function Broken(): JSX.Element {
  throw new Error("Cannot read properties of undefined (reading 'minutes')");
}

describe("<crash_screen>", () => {
  it("shows its children while nothing goes wrong", () => {
    render(
      <ErrorBoundary scope="app">
        <p>All fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All fine")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("replaces a display error with what went wrong and a Reload button, and logs it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary scope="app">
        <Broken />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    expect(alert.textContent).toContain("reading 'minutes'");
    expect(alert.textContent).toContain("Your saved data is safe.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(logged.mock.calls.some((args) => String(args[0]).startsWith("Display error (app): Cannot read properties"))).toBe(true);
  });

  it("keeps the menu working: a page's error is cleared by moving to another page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <Link to="/fine">Other page</Link>
        <PageErrorBoundary>
          <Routes>
            <Route path="/broken" element={<Broken />} />
            <Route path="/fine" element={<p>Other page works</p>} />
          </Routes>
        </PageErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong on this page");
    fireEvent.click(screen.getByText("Other page"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Other page works")).toBeTruthy();
  });

  it("clears a profile overlay's error once the overlay leaves the address", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Overlay() {
      return new URLSearchParams(useLocation().search).has("player") ? <Broken /> : <p>Page without profile</p>;
    }
    render(
      <MemoryRouter initialEntries={["/players?player=5"]}>
        <Link to="/players">Close profile</Link>
        <PageErrorBoundary>
          <Overlay />
        </PageErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByText("Close profile"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Page without profile")).toBeTruthy();
  });
});
