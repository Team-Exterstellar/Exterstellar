import type { Cfg } from "./types";

function isRowBanned(row: HTMLTableRowElement): boolean {
  const integrityCell = row.querySelector(
    'td[data-label="Integrity"]',
  ) as HTMLTableCellElement | null;
  if (!integrityCell) return false;

  const text = integrityCell.textContent?.trim().toLowerCase() ?? "";
  return text.includes("banned");
}

function removeBannedRows(table: Element): number {
  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  let removed = 0;
  for (const row of rows) {
    if (isRowBanned(row)) {
      row.remove();
      removed++;
    }
  }
  return removed;
}

function observeForBannedRows(table: Element) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    if (!shouldCheck) return;

    observer.disconnect();
    removeBannedRows(table);
    observer.observe(tbody, { childList: true });
  });

  observer.observe(tbody, { childList: true });
}

export function handleBannedFilter(cfg: Cfg) {
  if (cfg.hideBanned == false || cfg.hideBanned === "false") return;

  const table = document.querySelector(".ysws-queue__table-container table");
  if (!table) return;

  removeBannedRows(table);
  observeForBannedRows(table);
}
