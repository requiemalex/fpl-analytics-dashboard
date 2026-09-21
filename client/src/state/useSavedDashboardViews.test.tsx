import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSavedDashboardViews, isDefaultSavedView } from "./useSavedDashboardViews";
import { DEFAULT_SUMMARY_TILES } from "./useSummaryTiles";

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

  // Default is now permanent AND immutable (Dashboard.tsx blocks every
  // add/remove/edit control while it's selected) — nothing in the UI can
  // legitimately make a stored Default entry's tiles differ from the
  // packaged set any more, so migrate() force-resyncs it unconditionally
  // rather than only backfilling when the entry is missing outright. This
  // is the "one-off fresh reset" for anyone whose Default view had already
  // drifted from a pre-upgrade install where it could still be freely
  // edited, and it also guards against any future drift the same way.
  it("force-resyncs an existing Default entry's tiles to the packaged set, even if they'd drifted (e.g. a pre-upgrade install)", () => {
    const staleDefaultTiles = [{ id: "some-old-tile", scope: "player", metricKey: "totalPoints", direction: "desc", dataView: "lastSeason", name: null, criteria: null }];
    const existing = [
      { id: "default-view-player", scope: "player", name: "Default", tiles: staleDefaultTiles, updatedAt: 999 },
      { id: "default-view-team", scope: "team", name: "Default", tiles: [], updatedAt: 999 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: existing }));

    const { result } = renderHook(() => useSavedDashboardViews());
    const playerDefault = result.current.views.find((v) => v.id === "default-view-player");
    const teamDefault = result.current.views.find((v) => v.id === "default-view-team");
    expect(playerDefault?.tiles).toEqual(DEFAULT_SUMMARY_TILES.filter((t) => t.scope === "player"));
    expect(teamDefault?.tiles).toEqual(DEFAULT_SUMMARY_TILES.filter((t) => t.scope === "team"));
  });

  it("leaves non-Default entries completely untouched by the Default resync", () => {
    const existing = [{ id: "view-custom-1", scope: "player", name: "My View", tiles: [{ id: "t1", scope: "player", metricKey: "xGI", direction: "desc", dataView: "live", name: null, criteria: null }], updatedAt: 5 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: existing }));
    const { result } = renderHook(() => useSavedDashboardViews());
    const custom = result.current.views.find((v) => v.id === "view-custom-1");
    expect(custom?.tiles).toEqual(existing[0].tiles);
  });
});

describe("useSavedDashboardViews — save()/updateTiles() (backing Create View and its live-sync)", () => {
  it("save() returns the new view's id", () => {
    const { result } = renderHook(() => useSavedDashboardViews());
    let newId = "";
    act(() => {
      newId = result.current.save("player", "My New View", []);
    });
    expect(newId).toMatch(/^view-/);
    expect(result.current.views.find((v) => v.id === newId)).toMatchObject({ name: "My New View", scope: "player", tiles: [] });
  });

  it("updateTiles() overwrites an existing view's tiles in place and bumps updatedAt", () => {
    const { result } = renderHook(() => useSavedDashboardViews());
    let id = "";
    act(() => {
      id = result.current.save("player", "My View", []);
    });
    const newTiles = [{ id: "t1", scope: "player" as const, metricKey: "xGI", direction: "desc" as const, dataView: "live" as const, name: null, criteria: null }];
    act(() => {
      result.current.updateTiles(id, newTiles);
    });
    const view = result.current.views.find((v) => v.id === id);
    expect(view?.tiles).toEqual(newTiles);
    expect(view?.updatedAt).toBeGreaterThan(0);
  });

  it("updateTiles() refuses to touch a Default view", () => {
    const { result } = renderHook(() => useSavedDashboardViews());
    const before = result.current.views.find((v) => v.id === "default-view-player")?.tiles;
    act(() => {
      result.current.updateTiles("default-view-player", []);
    });
    const after = result.current.views.find((v) => v.id === "default-view-player")?.tiles;
    expect(after).toEqual(before);
    expect(after).not.toEqual([]);
  });

  it("updateTiles() is a no-op when the tiles haven't actually changed", () => {
    const { result } = renderHook(() => useSavedDashboardViews());
    let id = "";
    act(() => {
      id = result.current.save("player", "My View", []);
    });
    const viewsBeforeRef = result.current.views;
    act(() => {
      result.current.updateTiles(id, []); // same (empty) content it was created with
    });
    expect(result.current.views).toBe(viewsBeforeRef); // same array reference — no state update fired
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
