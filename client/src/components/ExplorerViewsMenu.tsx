import React, { useEffect, useRef, useState } from "react";
import { CloseIcon, CreateViewIcon, IconChipButton, SaveIcon, SavedViewsIcon, TrashIcon } from "./IconToolbar";
import { MAX_NAME_LENGTH, MenuGroupHeading } from "./MenuControls";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { MAX_EXPLORER_VIEWS, type ExplorerView } from "../state/useExplorerViews";

type Dialog = { kind: "save" } | { kind: "overwrite"; view: ExplorerView } | { kind: "delete"; view: ExplorerView };

/**
 * The Explorers' saved-views control (<explorer_views>): a toolbar icon
 * opening a menu of the page's saved views — click one to load it, its
 * save icon to save what's on screen over it, its bin to delete it — and
 * "Save current view" at the foot. The menu closes like the Columns picker
 * (Escape, or a click outside); naming, the cap and the confirm dialogs
 * follow the Dashboard's and Player Comparison's Create View and Delete
 * View, word for word where they mean the same.
 */
export function ExplorerViewsMenu({
  pageName,
  views,
  placeholder,
  onSave,
  onLoad,
  onOverwrite,
  onDelete,
}: {
  /** "Player Explorer": in the Save dialog's title. */
  pageName: string;
  views: ExplorerView[];
  /** The Save dialog's example name. */
  placeholder: string;
  onSave: (name: string) => void;
  onLoad: (view: ExplorerView) => void;
  onOverwrite: (view: ExplorerView) => void;
  onDelete: (view: ExplorerView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Closes on Escape or a click anywhere outside it, as the Columns picker does.
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);
  // Escape discards a dialog like Cancel.
  useEscapeLayer(dialog !== null, () => setDialog(null));

  function openDialog(next: Dialog) {
    setOpen(false);
    setName("");
    setError(null);
    setDialog(next);
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for this view.");
      return;
    }
    if (views.some((v) => v.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError(`There's already a view called "${trimmed}". Pick another name, or save over that one from the menu.`);
      return;
    }
    if (views.length >= MAX_EXPLORER_VIEWS) {
      setError(`You already have ${MAX_EXPLORER_VIEWS} views, which is the maximum. Delete one first, or save over one from the menu.`);
      return;
    }
    onSave(trimmed);
    setDialog(null);
  }

  return (
    <>
      <div style={{ position: "relative" }} ref={menuRef}>
        <IconChipButton
          icon={<SavedViewsIcon />}
          label="Saved views: save the Data View, columns, their order and widths, sort and every filter, or load a view you saved"
          onClick={() => setOpen((v) => !v)}
        />
        {open && (
          <div className="popover explorer-views-menu" style={{ left: 0, right: "auto" }}>
            <div>
              <MenuGroupHeading group="views" label={`Saved Views (${views.length} of ${MAX_EXPLORER_VIEWS})`} icon={<SavedViewsIcon size={14} />} />
              {views.length === 0 && <div className="explorer-views-empty">No saved views yet</div>}
              {views.map((view) => (
                <div key={view.id} className="explorer-views-row">
                  <button
                    type="button"
                    className="explorer-views-load"
                    title={`Load "${view.name}"`}
                    onClick={() => {
                      setOpen(false);
                      onLoad(view);
                    }}
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    className="chip chip-icon"
                    title={`Save what's on screen over "${view.name}"`}
                    aria-label={`Save over "${view.name}"`}
                    onClick={() => openDialog({ kind: "overwrite", view })}
                  >
                    <SaveIcon />
                  </button>
                  <button type="button" className="chip chip-icon" title={`Delete "${view.name}"`} aria-label={`Delete "${view.name}"`} onClick={() => openDialog({ kind: "delete", view })}>
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="explorer-views-save" onClick={() => openDialog({ kind: "save" })}>
              <CreateViewIcon />
              Save current view
            </button>
          </div>
        )}
      </div>

      {dialog?.kind === "save" && (
        <div className="dialog-backdrop" onClick={() => setDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Save {pageName} View</div>
            <div className="field">
              <label htmlFor="explorer-new-view-name">Name</label>
              <input
                id="explorer-new-view-name"
                type="text"
                autoFocus
                maxLength={MAX_NAME_LENGTH}
                placeholder={placeholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
            {error && <div className="banner error">{error}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {(dialog?.kind === "overwrite" || dialog?.kind === "delete") && (
        <div className="dialog-backdrop" onClick={() => setDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{dialog.kind === "delete" ? "Delete view" : "Save over view"}</div>
            <p className="page-subtitle" style={{ margin: "0 0 12px" }}>
              {dialog.kind === "delete"
                ? `Delete "${dialog.view.name}"? This can't be undone.`
                : `Replace what "${dialog.view.name}" holds with what's on screen now? This can't be undone.`}
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  if (dialog.kind === "delete") onDelete(dialog.view);
                  else onOverwrite(dialog.view);
                  setDialog(null);
                }}
              >
                {dialog.kind === "delete" ? "Delete" : "Save over"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** What a loaded view had to leave out (<explorer_view_load>), above the table until dismissed or the next load or Reset — styled as Team Building's notice of saved players no longer in FPL. */
export function ExplorerViewNotice({ note, onDismiss }: { note: string | null; onDismiss: () => void }) {
  if (!note) return null;
  return (
    <div className="banner stale" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1 }}>{note}</span>
      <IconChipButton icon={<CloseIcon size={14} />} label="Dismiss" onClick={onDismiss} />
    </div>
  );
}

/** The notice's text for a view loaded with parts left out; null when it loaded whole. */
export function explorerViewNote(viewName: string, leftOut: string[]): string | null {
  return leftOut.length > 0 ? `Loaded "${viewName}" without what can't be shown now: ${leftOut.join("; ")}.` : null;
}
