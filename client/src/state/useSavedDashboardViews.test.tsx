import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSavedDashboardViews, isDefaultSavedView } from "./useSavedDashboardViews";

const STORAGE_KEY = "fpl-dashboard:dashboard:saved-views:v1";
const SELECTED_VIEW_STORAGE_KEY = "fpl-dashboard:dashboard:selected-view:v1";

beforeEach(() => {
  localStorage.clear();
});

describe("useSavedDashboardViews — Default-view self-healing migration", () => {
  it("with nothing stored, seeds both per-scope Default views", () => {
    const { result } = renderHook(() => useSavedDashboardViews());
    const ids = result.current.views.map((v) => v.id);
    expect(ids).toContain("default-view-player");
    expect(ids).toContain("default-view-team");
  });

  it("restores a missing Default view (e.g. deleted before the delete-guard existed) rather than requiring another version bump", () => {
    // Old data with the player-scope Default view missing, plus one real user view.
    const existing = [
      { id: "default-view-team", scope: "team", name: "Default", tiles: [], updatedAt: 0 },
      { id: "view-custom-1", scope: "player", name: "My View", tiles: [], updatedAt: 123 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: existing }));

    const { result } = renderHook(() => useSavedDashboardViews());
    const ids = result.current.views.map((v) => v.id);
    expect(ids).toContain("default-view-player"); // restored
    expect(ids).toContain("default-view-team"); // untouched
    expect(ids).toContain("view-custom-1"); // user data preserved
  });

  it("is a no-op (doesn't duplicate) when both Default views are already present", () => {
    const existing = [
      { id: "default-view-player", scope: "player", name: "Default", tiles: [], updatedAt: 0 },
      { id: "default-view-team", scope: "team", name: "Default", tiles: [], updatedAt: 0 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: existing }));
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.views).toHaveLength(2);
  });

  it("migrates un-enveloped legacy data (storedVersion null) the same way", () => {
    const existing = [{ id: "view-custom-1", scope: "player", name: "My View", tiles: [], updatedAt: 123 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing)); // no envelope
    const { result } = renderHook(() => useSavedDashboardViews());
    const ids = result.current.views.map((v) => v.id);
    expect(ids).toContain("default-view-player");
    expect(ids).toContain("default-view-team");
    expect(ids).toContain("view-custom-1");
  });
});

describe("isDefaultSavedView", () => {
  it("identifies the two permanent default ids", () => {
    expect(isDefaultSavedView({ id: "default-view-player" })).toBe(true);
    expect(isDefaultSavedView({ id: "default-view-team" })).toBe(true);
    expect(isDefaultSavedView({ id: "view-anything-else" })).toBe(false);
  });
});

describe("useSavedDashboardViews — selectedViewIds persistence (which view the dropdown shows per scope)", () => {
  it("with nothing stored, defaults both scopes' selection to their Default view", () => {
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.selectedViewIds).toEqual({ player: "default-view-player", team: "default-view-team" });
  });

  it("picks up a previously-saved selection on mount, simulating a reload/app restart landing back on the same view", () => {
    localStorage.setItem(
      SELECTED_VIEW_STORAGE_KEY,
      JSON.stringify({ version: 1, data: { player: "view-custom-1", team: "default-view-team" } }),
    );
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.selectedViewIds).toEqual({ player: "view-custom-1", team: "default-view-team" });
  });

  it("self-heals a partially-malformed stored selection, keeping the valid scope and defaulting the broken one", () => {
    localStorage.setItem(SELECTED_VIEW_STORAGE_KEY, JSON.stringify({ version: 1, data: { player: "view-custom-1", team: 42 } }));
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.selectedViewIds).toEqual({ player: "view-custom-1", team: "default-view-team" });
  });

  it("falls back to full defaults for genuinely unsalvageable data (not an object at all)", () => {
    localStorage.setItem(SELECTED_VIEW_STORAGE_KEY, JSON.stringify({ version: 1, data: "not an object" }));
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.selectedViewIds).toEqual({ player: "default-view-player", team: "default-view-team" });
  });

  it("setSelectedViewId updates just that scope and persists it for the next mount", () => {
    const { result, unmount } = renderHook(() => useSavedDashboardViews());
    act(() => {
      result.current.setSelectedViewId("player", "view-custom-1");
    });
    expect(result.current.selectedViewIds).toEqual({ player: "view-custom-1", team: "default-view-team" });
    unmount();

    const { result: reloaded } = renderHook(() => useSavedDashboardViews());
    expect(reloaded.current.selectedViewIds.player).toBe("view-custom-1");
  });

  it("removing the currently-selected view falls that scope back to Default rather than pointing at a deleted view", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: [{ id: "view-custom-1", scope: "player", name: "My View", tiles: [], updatedAt: 1 }] }));
    localStorage.setItem(
      SELECTED_VIEW_STORAGE_KEY,
      JSON.stringify({ version: 1, data: { player: "view-custom-1", team: "default-view-team" } }),
    );
    const { result } = renderHook(() => useSavedDashboardViews());
    expect(result.current.selectedViewIds.player).toBe("view-custom-1");

    act(() => {
      result.current.remove("view-custom-1");
    });
    expect(result.current.selectedViewIds.player).toBe("default-view-player");
  });

  it("removing a view that ISN'T the current selection leaves the selection untouched", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        data: [
          { id: "view-custom-1", scope: "player", name: "My View", tiles: [], updatedAt: 1 },
          { id: "view-custom-2", scope: "player", name: "Other View", tiles: [], updatedAt: 2 },
        ],
      }),
    );
    localStorage.setItem(
      SELECTED_VIEW_STORAGE_KEY,
      JSON.stringify({ version: 1, data: { player: "view-custom-1", team: "default-view-team" } }),
    );
    const { result } = renderHook(() => useSavedDashboardViews());

    act(() => {
      result.current.remove("view-custom-2");
    });
    expect(result.current.selectedViewIds.player).toBe("view-custom-1");
  });
});
