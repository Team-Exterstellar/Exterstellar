import type { Cfg } from "./types";
import { trackObserver } from "./cleanupRegistry";

function isRowHardware(row: HTMLTableRowElement): boolean {
  const typeCell = row.querySelector(
    'td[data-label="Type"]',
  ) as HTMLTableCellElement | null;
  if (!typeCell) return false;

  const text = typeCell.textContent?.trim().toLowerCase() ?? "";
  return text.includes("hardware");
}

function removeHardwareRows(table: Element): number {
  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  let removed = 0;
  for (const row of rows) {
    if (isRowHardware(row)) {
      row.remove();
      removed++;
    }
  }
  return removed;
}

function observeForHardwareRows(table: Element) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const observer = trackObserver(new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    if (!shouldCheck) return;

    observer.disconnect();
    removeHardwareRows(table);
    observer.observe(tbody, { childList: true });
  }));

  observer.observe(tbody, { childList: true });
}

export function handleHardwareFilter(cfg: Cfg) {
  if (cfg.hideHardware === false || cfg.hideHardware === "false") return;

  const table = document.querySelector<HTMLTableElement>(
    ".ysws-queue__table-container table",
  );
  if (!table) return;

  removeHardwareRows(table);
  if (table.hasAttribute("data-exterstellar-hide-hardware-init")) return;
  table.setAttribute("data-exterstellar-hide-hardware-init", "1");
  observeForHardwareRows(table);
}
