import type { Cfg } from "./types";

// LB filters
type SortDirection = "asc" | "desc";

export function parseNumericCellValue(td: HTMLTableCellElement | null): number {
  const raw = (td?.textContent ?? "").replace(/,/g, "").trim();

  if (raw === "-" || raw === "New") return 0;
  if (raw.startsWith("▲")) {
    const n = parseFloat(raw.slice(1));
    return Number.isNaN(n) ? -Infinity : n;
  }
  if (raw.startsWith("▼")) {
    const n = parseFloat(raw.slice(1));
    return Number.isNaN(n) ? -Infinity : -n;
  }

  const value = parseFloat(raw);
  return Number.isNaN(value) ? -Infinity : value;
}

function clearSortIndicators(headRow: HTMLTableRowElement) {
  const sortableThs = headRow.querySelectorAll<HTMLTableCellElement>(
    `.exterstellar-better-goi-sortable-th`,
  );
  for (const th of Array.from(sortableThs)) {
    th.removeAttribute("aria-sort");
    delete th.dataset.sortDir;
    th.querySelector(`.${"exterstellar-better-goi-sort-indicator"}`)?.remove();
  }
}

function markSortIndicator(th: HTMLTableCellElement, direction: SortDirection) {
  th.setAttribute(
    "aria-sort",
    direction === "asc" ? "ascending" : "descending",
  );
  const indicator = document.createElement("span");
  indicator.classList.add("exterstellar-better-goi-sort-indicator");
  indicator.textContent = direction === "asc" ? " ▲" : " ▼";
  th.appendChild(indicator);
}

function sortLeaderboardTable(
  table: HTMLTableElement,
  columnIndex: number,
  direction: SortDirection,
) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(
    tbody.querySelectorAll("tr"),
  ) as HTMLTableRowElement[];

  const sorted = rows
    .map((row) => ({
      row,
      value: parseNumericCellValue(
        row.querySelectorAll("td")[columnIndex] ?? null,
      ),
    }))
    .sort((a, b) =>
      direction === "asc" ? a.value - b.value : b.value - a.value,
    );

  for (const { row } of sorted) {
    tbody.appendChild(row);
  }

  const rankCells = Array.from(
    tbody.querySelectorAll(`tr > td.ysws-dashboard__col-rank`),
  ) as HTMLTableCellElement[];
  rankCells.forEach((cell, i) => {
    cell.textContent = String(i + 1);
  });
}

function makeColumnSortable(
  table: HTMLTableElement,
  headRow: HTMLTableRowElement,
  th: HTMLTableCellElement,
  columnIndex: number,
) {
  if (th.classList.contains("exterstellar-better-goi-sortable-th")) return;
  const columnLabel = th.textContent?.trim() ?? "";
  th.classList.add("exterstellar-better-goi-sortable-th");
  th.setAttribute("tabindex", "0");
  th.setAttribute("role", "button");

  const activate = () => {
    const currentDir = th.dataset.sortDir;
    const nextDir: SortDirection = currentDir === "desc" ? "asc" : "desc";

    clearSortIndicators(headRow);
    th.dataset.sortDir = nextDir;
    markSortIndicator(th, nextDir);
    sortLeaderboardTable(table, columnIndex, nextDir);
    try {
      localStorage.setItem(
        "exterstellar-better-goi-lb-sort",
        JSON.stringify({
          column: columnLabel,
          dir: nextDir,
        }),
      );
    } catch (e) {}
  };

  th.addEventListener("click", activate);
  th.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });
}

function loadLeaderboardSortState(): {
  column: string;
  dir: SortDirection;
} | null {
  try {
    const raw = localStorage.getItem("exterstellar-better-goi-lb-sort");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.column === "string" &&
      (parsed.dir === "asc" || parsed.dir === "desc")
    ) {
      return parsed as { column: string; dir: SortDirection };
    }
    return null;
  } catch {
    return null;
  }
}

function restoreLeaderboardSort(
  table: HTMLTableElement,
  headRow: HTMLTableRowElement,
) {
  const ths = Array.from(
    headRow.querySelectorAll("th"),
  ) as HTMLTableCellElement[];

  if (ths.some((th) => th.dataset.sortDir)) return;
  const saved = loadLeaderboardSortState();
  if (!saved) return;

  const index = ths.findIndex(
    (th) =>
      th.classList.contains("exterstellar-better-goi-sortable-th") &&
      (th.textContent ?? "").trim() === saved.column,
  );
  if (index === -1) return;

  const th = ths[index]!;
  clearSortIndicators(headRow);
  th.dataset.sortDir = saved.dir;
  markSortIndicator(th, saved.dir);
  sortLeaderboardTable(table, index, saved.dir);
}

function makeAllNumericColumnsSortable(
  table: HTMLTableElement,
  headRow: HTMLTableRowElement,
) {
  const ths = Array.from(headRow.querySelectorAll("th"));
  ths.forEach((th, index) => {
    if (!th.classList.contains("ysws-dashboard__col-num")) return;
    makeColumnSortable(table, headRow, th as HTMLTableCellElement, index);
  });
}

function observeLeaderboardHeader(
  table: HTMLTableElement,
  headRow: HTMLTableRowElement,
) {
  if (table.hasAttribute("data-exterstellar-lb-sort-init")) return;
  table.setAttribute("data-exterstellar-lb-sort-init", "1");

  const observer = new MutationObserver(() => {
    makeAllNumericColumnsSortable(table, headRow);
  });
  observer.observe(headRow, { childList: true });
}

function initLeaderboardSorting(table: HTMLTableElement) {
  const headRow = table.querySelector("thead tr") as HTMLTableRowElement | null;
  if (!headRow) return;

  makeAllNumericColumnsSortable(table, headRow);
  observeLeaderboardHeader(table, headRow);
}

export function finalizeLeaderboardSortRestore(cfg: Cfg) {
  if (cfg.leaderboardSorting === false || cfg.leaderboardSorting === "false")
    return;

  const table = document.querySelector<HTMLTableElement>(
    ".ysws-dashboard__table",
  );
  const headRow = table?.querySelector(
    "thead tr",
  ) as HTMLTableRowElement | null;
  if (table && headRow) restoreLeaderboardSort(table, headRow);
}

export function handleLeaderboardSorting(cfg: Cfg) {
  if (cfg.leaderboardSorting === false || cfg.leaderboardSorting === "false")
    return;

  const table = document.querySelector<HTMLTableElement>(
    ".ysws-dashboard__table",
  );
  if (table) initLeaderboardSorting(table);
}