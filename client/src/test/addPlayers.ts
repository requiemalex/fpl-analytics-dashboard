import { fireEvent, type RenderResult } from "@testing-library/react";

/** Team Building's Add Players table (<add_players_dialog>, the shared player table). */
export const ADD_TABLE = ".add-players-panel table.data-table";

/** Opens Add Players from the first open "+" place for `position` ("goalkeeper", "defender", "midfielder", "forward"), which lists that position. */
export function openAddPlayers(utils: Pick<RenderResult, "getAllByRole">, position = "midfielder"): void {
  fireEvent.click(utils.getAllByRole("button", { name: new RegExp(`^Add a ${position}`) })[0]);
}

export function addPlayersHeaders(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${ADD_TABLE} thead th`));
}

export function addPlayersHeader(container: HTMLElement, label: string): HTMLElement | undefined {
  return addPlayersHeaders(container).find((th) => th.childNodes[0]?.textContent?.trim() === label);
}

export function addPlayersRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${ADD_TABLE} tbody tr:not(.width-sizer-row)`)).filter((tr) => tr.querySelector(".name"));
}

export function addPlayersRow(container: HTMLElement, name: string): HTMLElement | undefined {
  return addPlayersRows(container).find((tr) => tr.querySelector(".name")?.childNodes[0]?.textContent?.trim() === name);
}

/** His cell under the column headed `label`; undefined when he isn't listed. */
export function addPlayersCell(container: HTMLElement, label: string, name: string): HTMLElement | undefined {
  const index = addPlayersHeaders(container).findIndex((th) => th.childNodes[0]?.textContent?.trim() === label);
  return index < 0 ? undefined : addPlayersRow(container, name)?.querySelectorAll<HTMLElement>("td")[index];
}

export function addButton(container: HTMLElement, name: string): HTMLButtonElement {
  return addPlayersRow(container, name)!.querySelector<HTMLButtonElement>("button.inline-add-btn")!;
}
