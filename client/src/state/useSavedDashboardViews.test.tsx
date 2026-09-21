import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSavedDashboardViews, isDefaultSavedView } from "./useSavedDashboardViews";

const STORAGE_KEY = "fpl-dashboard:dashboard:saved-views:v1";

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
