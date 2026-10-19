import { useCallback, useRef } from "react";
import { type VersionedStore, usePersistentState } from "./persistentStorage";

const STORAGE_KEY = "fpl-dashboard:notepad:v1";
/**
 * Version 1: the first shape — `{ tabs: { id, title, body }[], activeTabId }`, names up to 40 characters.
 * Version 2: same shape, names up to MAX_TAB_TITLE (20) — a longer name from version 1 is cut to fit.
 */
const STORAGE_VERSION = 2;

export interface NotepadTab {
  id: string;
  title: string;
  body: string;
}

export interface NotepadData {
  tabs: NotepadTab[];
  /** The tab showing when the notepad opens; null only when there are no tabs. */
  activeTabId: string | null;
}

const FIRST_TAB: NotepadTab = { id: "notes", title: "Notes", body: "" };

export const DEFAULT_NOTEPAD: NotepadData = { tabs: [FIRST_TAB], activeTabId: FIRST_TAB.id };

/** Longest tab name kept, spaces included — so a full strip of tabs still fits the panel. */
export const MAX_TAB_TITLE = 20;

/** Most tabs that can be open at once; adding another does nothing until one is deleted. */
export const MAX_TABS = 5;

function newId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A stored tab in the current shape, or null if it has no usable id. A missing title or body becomes empty rather than dropping the tab's other text. */
function normalizeTab(raw: unknown): NotepadTab | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Record<keyof NotepadTab, unknown>>;
  if (typeof t.id !== "string" || !t.id) return null;
  return {
    id: t.id,
    title: typeof t.title === "string" ? t.title.slice(0, MAX_TAB_TITLE) : "",
    body: typeof t.body === "string" ? t.body : "",
  };
}

const NOTEPAD_STORE: VersionedStore<NotepadData> = {
  version: STORAGE_VERSION,
  fallback: DEFAULT_NOTEPAD,
  migrate(data) {
    if (!data || typeof data !== "object") return null;
    const d = data as { tabs?: unknown; activeTabId?: unknown };
    if (!Array.isArray(d.tabs)) return null;
    const seen = new Set<string>();
    const tabs: NotepadTab[] = [];
    for (const raw of d.tabs) {
      const tab = normalizeTab(raw);
      if (tab && !seen.has(tab.id)) {
        seen.add(tab.id);
        tabs.push(tab);
      }
    }
    // An empty list is a deliberate user state (every tab deleted), kept as is rather than reseeded.
    const activeTabId = tabs.some((t) => t.id === d.activeTabId) ? (d.activeTabId as string) : (tabs[0]?.id ?? null);
    return { tabs, activeTabId };
  },
};

/** "Tab 2", "Tab 3"… — the lowest number no existing tab is already called. */
function nextTabTitle(tabs: NotepadTab[]): string {
  const taken = new Set(tabs.map((t) => t.title));
  let n = tabs.length + 1;
  while (taken.has(`Tab ${n}`)) n++;
  return `Tab ${n}`;
}

export interface UseNotepad {
  tabs: NotepadTab[];
  activeTab: NotepadTab | null;
  selectTab: (id: string) => void;
  /** Adds an empty tab after the others, makes it the active one, and returns its id — or null, adding nothing, when MAX_TABS are already open. */
  addTab: () => string | null;
  renameTab: (id: string, title: string) => void;
  setBody: (id: string, body: string) => void;
  /** Removes a tab; if it was active, its right-hand neighbour (or else its left) becomes active. */
  removeTab: (id: string) => void;
}

/**
 * The notepad's tabs and their text, saved to localStorage on every change
 * (README "Saved data") — like saved squads, notes stay in this browser /
 * install only. Not tied to any page: the same notes show wherever the
 * notepad is opened.
 */
export function useNotepad(): UseNotepad {
  const [data, setData] = usePersistentState(STORAGE_KEY, NOTEPAD_STORE);


  const selectTab = useCallback((id: string) => {
    setData((prev) => (prev.tabs.some((t) => t.id === id) ? { ...prev, activeTabId: id } : prev));
  }, []);

  // `data` is read through a ref so addTab can say whether it added a tab without being re-created on every keystroke.
  const latest = useRef(data);
  latest.current = data;

  const addTab = useCallback(() => {
    if (latest.current.tabs.length >= MAX_TABS) return null;
    const id = newId();
    setData((prev) =>
      prev.tabs.length >= MAX_TABS ? prev : { tabs: [...prev.tabs, { id, title: nextTabTitle(prev.tabs), body: "" }], activeTabId: id },
    );
    return id;
  }, []);

  const renameTab = useCallback((id: string, title: string) => {
    const trimmed = title.trim().slice(0, MAX_TAB_TITLE);
    if (!trimmed) return; // an empty name would leave a blank, unclickable-looking tab — keep the old one
    setData((prev) => ({ ...prev, tabs: prev.tabs.map((t) => (t.id === id ? { ...t, title: trimmed } : t)) }));
  }, []);

  const setBody = useCallback((id: string, body: string) => {
    setData((prev) => ({ ...prev, tabs: prev.tabs.map((t) => (t.id === id ? { ...t, body } : t)) }));
  }, []);

  const removeTab = useCallback((id: string) => {
    setData((prev) => {
      const index = prev.tabs.findIndex((t) => t.id === id);
      if (index === -1) return prev;
      const tabs = prev.tabs.filter((t) => t.id !== id);
      const activeTabId = prev.activeTabId !== id ? prev.activeTabId : (tabs[index]?.id ?? tabs[index - 1]?.id ?? null);
      return { tabs, activeTabId };
    });
  }, []);

  const activeTab = data.tabs.find((t) => t.id === data.activeTabId) ?? null;

  return { tabs: data.tabs, activeTab, selectTab, addTab, renameTab, setBody, removeTab };
}
