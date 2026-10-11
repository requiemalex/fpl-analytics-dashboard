import React, { useEffect, useRef, useState } from "react";
import { useNotepad, MAX_TAB_TITLE, type NotepadTab } from "../state/useNotepad";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { EditIcon, PlusIcon, TrashIcon } from "./IconToolbar";

/** The key that opens and closes the notepad from anywhere in the app — the key left of 1 on UK and US keyboards. */
export const NOTEPAD_KEY = "`";

/**
 * Calls `onToggle` when NOTEPAD_KEY is pressed, wherever focus is —
 * including inside the notepad itself, so the same key closes it. A press
 * with Ctrl/Alt/Cmd held is left alone (AltGr layouts type other characters
 * that way), as is a held-down key repeating.
 */
export function useNotepadHotkey(onToggle: () => void): void {
  const latest = useRef(onToggle);
  latest.current = onToggle;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== NOTEPAD_KEY || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      e.preventDefault(); // don't also type the character into whatever field has focus
      latest.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A tab's name, or an inline text box while it's being renamed. Enter or clicking away keeps the new name; Escape keeps the old one. */
function TabLabel({ tab, active, renaming, onSelect, onStartRename, onFinishRename }: {
  tab: NotepadTab;
  active: boolean;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onFinishRename: (title: string | null) => void;
}) {
  const [draft, setDraft] = useState(tab.title);
  const inputRef = useRef<HTMLInputElement>(null);
  // The box can lose focus as it's removed, straight after Enter or Escape
  // has already finished the rename — that blur mustn't finish it again
  // (and after Escape, save the name that was just discarded).
  const finished = useRef(false);
  const finish = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onFinishRename(title);
  };

  useEffect(() => {
    if (!renaming) return;
    finished.current = false;
    setDraft(tab.title);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  useEscapeLayer(renaming, () => finish(null));

  if (renaming) {
    return (
      <input
        ref={inputRef}
        className="notepad-tab-input"
        value={draft}
        maxLength={MAX_TAB_TITLE}
        aria-label="Tab name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(draft);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`notepad-tab${active ? " active" : ""}`}
      title={`${tab.title}: double-click to rename`}
      onClick={onSelect}
      onDoubleClick={onStartRename}
    >
      {tab.title}
    </button>
  );
}

/**
 * The notepad: a panel that slides in over the right of the screen, below
 * the topbar, with the page behind it dimmed but still visible — and still
 * scrollable and clickable, so figures can be read off it while writing.
 * Always mounted (hidden when closed) so it can slide both ways; its notes
 * save as they're typed (useNotepad).
 */
export function Notepad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tabs, activeTab, selectTab, addTab, renameTab, setBody, removeTab } = useNotepad();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NotepadTab | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEscapeLayer(open, onClose);
  useEscapeLayer(confirmDelete !== null, () => setConfirmDelete(null));

  // Opening puts the cursor in the notes; closing hands focus back to
  // wherever it was, but only if it's still inside the (now hidden) panel —
  // if the user has since clicked into the page behind, leave it there.
  useEffect(() => {
    if (open) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      textareaRef.current?.focus({ preventScroll: true });
      return;
    }
    setRenamingId(null);
    setConfirmDelete(null);
    if (panelRef.current?.contains(document.activeElement)) {
      const previous = returnFocusTo.current;
      if (previous && previous.isConnected && !panelRef.current.contains(previous)) previous.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [open]);

  // Switching tabs (not while naming a new one) moves the cursor into that tab's notes.
  useEffect(() => {
    if (open && renamingId === null) textareaRef.current?.focus({ preventScroll: true });
  }, [activeTab?.id]); // only on a tab switch, not on every rename

  const handleAdd = () => setRenamingId(addTab());

  const handleDelete = () => {
    if (!activeTab) return;
    // An empty tab has nothing to lose, so it goes straight away.
    if (activeTab.body.trim() === "") removeTab(activeTab.id);
    else setConfirmDelete(activeTab);
  };

  const finishRename = (id: string, title: string | null) => {
    if (title !== null) renameTab(id, title);
    setRenamingId(null);
    textareaRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className={`notepad-layer${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="notepad-dim" />
        <div className="notepad-panel" ref={panelRef} role="dialog" aria-modal="false" aria-label="Notepad">
          <div className="notepad-header">
            <span className="notepad-title">Notepad</span>
            <div className="notepad-actions">
              <button type="button" className="chip chip-icon" title="New tab" aria-label="New tab" onClick={handleAdd}>
                <PlusIcon size={13} />
              </button>
              {activeTab && (
                <>
                  <button type="button" className="chip chip-icon" title="Rename this tab" aria-label="Rename tab" onClick={() => setRenamingId(activeTab.id)}>
                    <EditIcon />
                  </button>
                  <button type="button" className="chip chip-icon" title="Delete this tab" aria-label="Delete tab" onClick={handleDelete}>
                    <TrashIcon />
                  </button>
                </>
              )}
              <button type="button" className="chip chip-icon" title={`Close notepad (${NOTEPAD_KEY} or Esc)`} aria-label="Close notepad" onClick={onClose}>
                <CloseIcon />
              </button>
            </div>
          </div>

          {tabs.length > 0 && (
            <div className="notepad-tabs" role="tablist" aria-label="Notepad tabs">
              {tabs.map((tab) => (
                <TabLabel
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTab?.id}
                  renaming={tab.id === renamingId}
                  onSelect={() => selectTab(tab.id)}
                  onStartRename={() => setRenamingId(tab.id)}
                  onFinishRename={(title) => finishRename(tab.id, title)}
                />
              ))}
            </div>
          )}

          {activeTab ? (
            <textarea
              ref={textareaRef}
              className="notepad-body"
              value={activeTab.body}
              onChange={(e) => setBody(activeTab.id, e.target.value)}
              placeholder="Notes, ideas, players to watch…"
              aria-label={`${activeTab.title} notes`}
            />
          ) : (
            <div className="notepad-empty">
              <button type="button" className="btn" onClick={handleAdd}>
                <PlusIcon size={12} /> New tab
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="dialog-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Delete tab</div>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Do you want to delete "{confirmDelete.title}" and its notes?
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ borderColor: "var(--accent-negative)", color: "var(--accent-negative)" }}
                onClick={() => {
                  removeTab(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
