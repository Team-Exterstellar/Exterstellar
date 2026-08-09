import type { Cfg } from "./types";

let sidebarHotkeyAttached = false;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable);
}

function handleSidebarHotkeyPress(e: KeyboardEvent) {
  if (e.key !== "Tab") return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (isEditableTarget(e.target)) return;
  if (!/^\/admin\/certification\/review\/[^/]+\/?$/.test(window.location.pathname)) return;

  const toggle = document.querySelector<HTMLButtonElement>(".review-sidebar-toggle");
  if (!toggle) return;

  e.preventDefault();
  toggle.click();
}

export function handleSidebarToggleHotkey(cfg: Cfg) {
  if (cfg.sidebarToggleHotkey === false || cfg.sidebarToggleHotkey === "false")
    return;

  if (sidebarHotkeyAttached) return;
  sidebarHotkeyAttached = true;

  document.addEventListener("keydown", handleSidebarHotkeyPress);
}

export function teardownSidebarHotkey() {
  document.removeEventListener("keydown", handleSidebarHotkeyPress);
  sidebarHotkeyAttached = false;
}