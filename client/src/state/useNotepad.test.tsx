import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useNotepad, DEFAULT_NOTEPAD, MAX_TAB_TITLE } from "./useNotepad";

// The store's on-disk key (useNotepad.ts) — part of its persistence contract, so hardcoded here deliberately.
const STORAGE_KEY = "fpl-dashboard:notepad:v1";

function stored() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("useNotepad — saved notes", () => {
  it("with nothing saved, starts with one empty Notes tab", () => {
    const { result } = renderHook(() => useNotepad());
    expect(result.current.tabs).toEqual(DEFAULT_NOTEPAD.tabs);
    expect(result.current.activeTab?.title).toBe("Notes");
  });

  it("saves typed notes, new tabs and the active tab, and a fresh load reads them back", () => {
    const first = renderHook(() => useNotepad());
    act(() => first.result.current.setBody("notes", "Salah vs Palmer?"));
    let newId = "";
    act(() => {
      newId = first.result.current.addTab();
    });
    act(() => first.result.current.renameTab(newId, "  Wildcard GW8  "));
    act(() => first.result.current.setBody(newId, "3 at the back"));

    expect(stored().version).toBe(1);
    first.unmount();

    const second = renderHook(() => useNotepad());
    expect(second.result.current.tabs.map((t) => [t.title, t.body])).toEqual([
      ["Notes", "Salah vs Palmer?"],
      ["Wildcard GW8", "3 at the back"],
    ]);
    expect(second.result.current.activeTab?.id).toBe(newId);
  });

  it("names new tabs Tab 2, Tab 3… without repeating a name already in use", () => {
    const { result } = renderHook(() => useNotepad());
    act(() => {
      result.current.addTab();
    });
    act(() => {
      result.current.addTab();
    });
    expect(result.current.tabs.map((t) => t.title)).toEqual(["Notes", "Tab 2", "Tab 3"]);
    act(() => result.current.removeTab(result.current.tabs[1].id));
    act(() => {
      result.current.addTab();
    });
    expect(result.current.tabs.map((t) => t.title)).toEqual(["Notes", "Tab 3", "Tab 4"]);
  });

  it("ignores a blank rename and cuts an over-long one to the limit", () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.renameTab("notes", "   "));
    expect(result.current.tabs[0].title).toBe("Notes");
    act(() => result.current.renameTab("notes", "x".repeat(100)));
    expect(result.current.tabs[0].title).toHaveLength(MAX_TAB_TITLE);
  });

  it("deleting the active tab moves to its right-hand neighbour, or the left one when it was last", () => {
    const { result } = renderHook(() => useNotepad());
    let b = "";
    let c = "";
    act(() => {
      b = result.current.addTab();
    });
    act(() => {
      c = result.current.addTab();
    });
    act(() => result.current.selectTab(b));
    act(() => result.current.removeTab(b));
    expect(result.current.activeTab?.id).toBe(c);
    act(() => result.current.removeTab(c));
    expect(result.current.activeTab?.id).toBe("notes");
  });

  it("keeps an empty tab list (every tab deleted) on reload rather than recreating the Notes tab", () => {
    const first = renderHook(() => useNotepad());
    act(() => first.result.current.removeTab("notes"));
    expect(first.result.current.tabs).toEqual([]);
    expect(first.result.current.activeTab).toBeNull();
    first.unmount();

    const second = renderHook(() => useNotepad());
    expect(second.result.current.tabs).toEqual([]);
  });

  it("salvages what it can from damaged saved data: drops tabs with no id or a repeated id, blanks a missing title/body, fixes a dangling active tab", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: {
          tabs: [{ id: "a", title: "Keep", body: 7 }, { title: "no id" }, null, { id: "a", title: "duplicate" }, { id: "b" }],
          activeTabId: "gone",
        },
      }),
    );
    const { result } = renderHook(() => useNotepad());
    expect(result.current.tabs).toEqual([
      { id: "a", title: "Keep", body: "" },
      { id: "b", title: "", body: "" },
    ]);
    expect(result.current.activeTab?.id).toBe("a");
  });

  it("falls back to the default notepad when the saved data isn't a notepad at all", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: ["not", "a", "notepad"] }));
    const { result } = renderHook(() => useNotepad());
    expect(result.current.tabs).toEqual(DEFAULT_NOTEPAD.tabs);
  });
});
