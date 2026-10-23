import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PlayerSearch } from "./PlayerSearch";
import { makePlayer } from "../test/fixtures";
import { useEscapeLayer } from "../state/useEscapeLayer";

vi.mock("../state/AppStateContext", () => ({ useAppState: () => ({ players: [] }) }));

const COSTINHA = makePlayer({ id: 1, position: "DEF", name: "Costinha", firstName: "João Pedro", lastName: "Loureiro da Costa" });
const JOAO_PEDRO = makePlayer({ id: 2, position: "FWD", name: "João Pedro", firstName: "João Pedro", lastName: "Junqueira de Jesus" });
const PALMER = makePlayer({ id: 3, position: "MID", name: "Palmer", firstName: "Cole", lastName: "Palmer" });

function Harness({ onPick, onDialogEscape }: { onPick: (id: number) => void; onDialogEscape?: () => void }) {
  // A dialog underneath, as on the Dashboard: Escape closes only the list.
  useEscapeLayer(true, () => onDialogEscape?.());
  return <PlayerSearch excludeIds={[]} onPick={onPick} disabled={false} candidates={[COSTINHA, JOAO_PEDRO, PALMER]} />;
}

afterEach(cleanup);

describe("PlayerSearch works from the keyboard (audit 2026-10-23 in-app)", () => {
  it("Enter adds the top suggestion: the player whose name was typed", () => {
    const onPick = vi.fn();
    const { getByRole } = render(<Harness onPick={onPick} />);
    const input = getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "joao pedro" } });
    expect(getByRole("listbox").textContent).toMatch(/^FWDJoão Pedro/);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(2);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("↓ moves to the next suggestion and Enter adds it", () => {
    const onPick = vi.fn();
    const { getByRole } = render(<Harness onPick={onPick} />);
    const input = getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "joao" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("Escape closes the list and leaves the dialog under it open", () => {
    const onDialogEscape = vi.fn();
    const { getByRole, queryByRole } = render(<Harness onPick={vi.fn()} onDialogEscape={onDialogEscape} />);
    const input = getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "palmer" } });
    expect(queryByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByRole("listbox")).toBeNull();
    expect(onDialogEscape).not.toHaveBeenCalled();
  });

  it("clicking away closes the list", () => {
    const { getByRole, queryByRole } = render(<Harness onPick={vi.fn()} />);
    const input = getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "palmer" } });
    fireEvent.blur(input);
    expect(queryByRole("listbox")).toBeNull();
  });
});
