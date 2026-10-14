import React, { useState } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { Notepad, NOTEPAD_KEY, useNotepadHotkey } from "./Notepad";
import { MAX_TAB_TITLE, MAX_TABS } from "../state/useNotepad";

/** The same wiring AppShell uses: the hotkey toggles, the panel's own controls close. */
function Harness() {
  const [open, setOpen] = useState(false);
  useNotepadHotkey(() => setOpen((o) => !o));
  return (
    <>
      <input aria-label="Page search" />
      <Notepad open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function layer() {
  return document.querySelector(".notepad-layer")!;
}

function press(key: string, init: KeyboardEventInit = {}, target: Element | Window = window) {
  act(() => {
    fireEvent.keyDown(target, { key, ...init });
  });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("Notepad overlay", () => {
  it("the hotkey opens it and the same key closes it, from anywhere including inside the notes", () => {
    render(<Harness />);
    expect(layer().classList.contains("open")).toBe(false);

    press(NOTEPAD_KEY);
    expect(layer().classList.contains("open")).toBe(true);
    const notes = screen.getByRole("textbox", { name: "Notes notes" });
    expect(document.activeElement).toBe(notes);

    press(NOTEPAD_KEY, {}, notes);
    expect(layer().classList.contains("open")).toBe(false);
  });

  it("also opens from another text field, without typing the key into it", () => {
    render(<Harness />);
    const search = screen.getByRole("textbox", { name: "Page search" });
    search.focus();
    const event = new KeyboardEvent("keydown", { key: NOTEPAD_KEY, bubbles: true, cancelable: true });
    act(() => {
      search.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(layer().classList.contains("open")).toBe(true);
  });

  it("ignores the key with Ctrl or Alt held, and a held-down repeat", () => {
    render(<Harness />);
    press(NOTEPAD_KEY, { ctrlKey: true });
    press(NOTEPAD_KEY, { altKey: true });
    press(NOTEPAD_KEY, { repeat: true });
    expect(layer().classList.contains("open")).toBe(false);
  });

  it("Escape closes it", () => {
    render(<Harness />);
    press(NOTEPAD_KEY);
    press("Escape");
    expect(layer().classList.contains("open")).toBe(false);
  });

  it("typed notes are saved and still there after a restart", () => {
    const first = render(<Harness />);
    press(NOTEPAD_KEY);
    fireEvent.change(screen.getByRole("textbox", { name: "Notes notes" }), { target: { value: "Bench boost GW12" } });
    first.unmount();

    render(<Harness />);
    press(NOTEPAD_KEY);
    expect(screen.getByRole("textbox", { name: "Notes notes" })).toHaveProperty("value", "Bench boost GW12");
  });

  it("a new tab starts with its name box open; Enter keeps the typed name, Escape in the box only cancels the rename", () => {
    render(<Harness />);
    press(NOTEPAD_KEY);
    fireEvent.click(screen.getByRole("button", { name: "New tab" }));

    let nameBox = screen.getByRole("textbox", { name: "Tab name" });
    expect(document.activeElement).toBe(nameBox);
    fireEvent.change(nameBox, { target: { value: "Differentials" } });
    fireEvent.keyDown(nameBox, { key: "Enter" });
    expect(screen.getByRole("tab", { name: "Differentials" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.doubleClick(screen.getByRole("tab", { name: "Differentials" }));
    nameBox = screen.getByRole("textbox", { name: "Tab name" });
    fireEvent.change(nameBox, { target: { value: "Discarded" } });
    press("Escape");
    expect(screen.getByRole("tab", { name: "Differentials" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Discarded" })).toBeNull();
    expect(layer().classList.contains("open")).toBe(true);
  });

  it("the notes box is blank, with no placeholder text", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "Notes notes", hidden: true }).getAttribute("placeholder")).toBeNull();
  });

  it("the arrow widens the panel to the full page and back", () => {
    render(<Harness />);
    press(NOTEPAD_KEY);
    const panel = document.querySelector(".notepad-panel")!;
    expect(panel.classList.contains("expanded")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Expand to full page" }));
    expect(panel.classList.contains("expanded")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to side panel" }));
    expect(panel.classList.contains("expanded")).toBe(false);
  });

  it(`the new-tab button turns off at ${MAX_TABS} tabs and back on when one is deleted`, () => {
    render(<Harness />);
    press(NOTEPAD_KEY);
    const plus = screen.getByRole("button", { name: "New tab" });
    for (let i = 1; i < MAX_TABS; i++) {
      fireEvent.click(plus);
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Tab name" }), { key: "Enter" });
    }
    expect(screen.getAllByRole("tab")).toHaveLength(MAX_TABS);
    expect(plus).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Delete tab" })); // the last tab added, still empty
    expect(screen.getAllByRole("tab")).toHaveLength(MAX_TABS - 1);
    expect(plus).toHaveProperty("disabled", false);
  });

  it(`a tab name stops at ${MAX_TAB_TITLE} characters, spaces included`, () => {
    render(<Harness />);
    press(NOTEPAD_KEY);
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByRole("textbox", { name: "Tab name" }).getAttribute("maxlength")).toBe(String(MAX_TAB_TITLE));
  });

  it("deleting a tab with notes asks first; an empty tab goes straight away", () => {
    render(<Harness />);
    press(NOTEPAD_KEY);
    fireEvent.change(screen.getByRole("textbox", { name: "Notes notes" }), { target: { value: "keep me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete tab" }));
    expect(screen.getByText(/Do you want to delete "Notes"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("tab", { name: "Notes" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Tab name" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Delete tab" }));
    expect(screen.queryByText(/Do you want to delete/)).toBeNull();
    expect(screen.queryByRole("tab", { name: "Tab 2" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
  });
});
