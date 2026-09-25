import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Every open dialog's element, oldest first — only the newest one keeps focus, as with useEscapeLayer. */
const openDialogs: HTMLElement[] = [];

function onKeyDown(e: KeyboardEvent) {
  const node = openDialogs[openDialogs.length - 1];
  if (e.key !== "Tab" || !node) return;
  const focusables = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (focusables.length === 0) {
    e.preventDefault();
    node.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const current = document.activeElement;
  if (!node.contains(current)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && (current === first || current === node)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && current === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * A profile overlay behaves as a modal dialog for the keyboard: opening it
 * moves focus into the sheet (the element `ref` points at, which needs
 * tabIndex={-1}), Tab and Shift+Tab stay inside it, and closing it returns
 * focus to wherever it was before (audit 2026-09-25 player-team-profiles
 * L8). With two open, only the newest one holds focus.
 */
export function useDialogFocus(active: boolean, ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(node);
    if (openDialogs.length === 1) document.addEventListener("keydown", onKeyDown);
    node.focus({ preventScroll: true });
    return () => {
      const index = openDialogs.indexOf(node);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.removeEventListener("keydown", onKeyDown);
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
