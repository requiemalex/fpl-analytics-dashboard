import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { GroupedPicker, type PickerGroup } from "./GroupedPicker";
import { MenuGroupHeading } from "./MenuControls";
import { useEscapeLayer } from "../state/useEscapeLayer";

// The Dashboard's Statistic and axis picker: grouped under the Explorers' headings, and used like a select.

const GROUPS: PickerGroup[] = [
  { key: "a", label: "FPL · Actual Output", heading: <MenuGroupHeading group="Actual Output" label="FPL · Actual Output" className="col-source-fpl" />, options: [
    { value: "totalPoints", label: "Points" },
    { value: "goals", label: "Goals" },
  ] },
  { key: "u", label: "FPL · Underlying Performance", heading: <MenuGroupHeading group="Underlying Performance" label="FPL · Underlying Performance" className="col-source-fpl" />, options: [
    { value: "xGC", label: "xGC" },
  ] },
  { key: "empty", label: "Nothing", heading: <MenuGroupHeading group="Nothing" />, options: [] },
];

function Harness({ onDialogEscape }: { onDialogEscape?: () => void }) {
  const [value, setValue] = useState("goals");
  // A dialog underneath, as on the Dashboard: Escape closes only the topmost layer.
  useEscapeLayer(true, () => onDialogEscape?.());
  return (
    <div>
      <label htmlFor="pick">Statistic</label>
      <GroupedPicker id="pick" value={value} groups={GROUPS} onChange={setValue} />
      <button type="button">Elsewhere</button>
    </div>
  );
}

afterEach(cleanup);

describe("GroupedPicker", () => {
  it("shows the choice, and opens on it with the groups under their headings (empty groups left out)", () => {
    const { getByRole, getByLabelText } = render(<Harness />);
    const button = getByLabelText("Statistic");
    expect(button.textContent).toBe("Goals");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const list = getByRole("listbox");
    expect([...list.querySelectorAll('[role="group"]')].map((g) => g.getAttribute("aria-label"))).toEqual(["FPL · Actual Output", "FPL · Underlying Performance"]);
    expect(list.querySelector(".menu-group-heading.col-source-fpl")).toBeTruthy();
    expect(getByRole("option", { name: "Goals" }).getAttribute("aria-selected")).toBe("true");
    expect(list.getAttribute("aria-activedescendant")).toBe(getByRole("option", { name: "Goals" }).id);
  });

  it("picks with a click, closing the list", () => {
    const { getByRole, getByLabelText, queryByRole } = render(<Harness />);
    fireEvent.click(getByLabelText("Statistic"));
    fireEvent.click(getByRole("option", { name: "xGC" }));
    expect(queryByRole("listbox")).toBeNull();
    expect(getByLabelText("Statistic").textContent).toBe("xGC");
  });

  it("works from the keyboard: arrows across groups, Enter picks, a letter jumps", () => {
    const { getByRole, getByLabelText } = render(<Harness />);
    const button = getByLabelText("Statistic");
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const list = getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(list.getAttribute("aria-activedescendant")).toBe(getByRole("option", { name: "xGC" }).id);
    fireEvent.keyDown(list, { key: "p" });
    expect(list.getAttribute("aria-activedescendant")).toBe(getByRole("option", { name: "Points" }).id);
    fireEvent.keyDown(list, { key: "Enter" });
    expect(button.textContent).toBe("Points");
  });

  it("Escape closes only the list, not the dialog under it; a click outside closes it too", () => {
    let dialogClosed = false;
    const { getByRole, getByLabelText, queryByRole } = render(<Harness onDialogEscape={() => (dialogClosed = true)} />);
    fireEvent.click(getByLabelText("Statistic"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("listbox")).toBeNull();
    expect(dialogClosed).toBe(false);
    expect(getByLabelText("Statistic").textContent).toBe("Goals");

    fireEvent.click(getByLabelText("Statistic"));
    fireEvent.mouseDown(getByRole("button", { name: "Elsewhere" }));
    expect(queryByRole("listbox")).toBeNull();
  });
  it("typing in its filter box narrows the list, keeping headings; Enter picks the first match (audit 2026-10-23 in-app)", () => {
    const { getByRole, getByLabelText, queryByRole } = render(<Harness />);
    fireEvent.click(getByLabelText("Statistic"));
    const filter = getByLabelText("Filter the list");
    fireEvent.change(filter, { target: { value: "XG" } });
    expect(queryByRole("option", { name: "Points" })).toBeNull();
    expect(getByRole("listbox").querySelectorAll('[role="group"]')).toHaveLength(1);
    fireEvent.keyDown(filter, { key: "Enter" });
    expect(getByLabelText("Statistic").textContent).toBe("xGC");
  });

  it("says so when nothing matches, and Escape still closes only the list", () => {
    let dialogClosed = false;
    const { getByText, getByLabelText, queryByRole } = render(<Harness onDialogEscape={() => (dialogClosed = true)} />);
    fireEvent.click(getByLabelText("Statistic"));
    fireEvent.change(getByLabelText("Filter the list"), { target: { value: "zzz" } });
    expect(getByText('Nothing matches "zzz".')).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("listbox")).toBeNull();
    expect(dialogClosed).toBe(false);
  });
});
