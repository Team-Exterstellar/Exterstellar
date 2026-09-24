import type { Cfg } from "./types";
import { trackObserver } from "./cleanupRegistry";

type SortDir = "asc" | "desc";
interface Criterion { col: number; dir: SortDir; label: string; key: string }

// Keep criteria in memory — mirrors lbSort's single-criteria but as array for Shift+Click multi
let criteria: Criterion[] = [];
let originalIndexMap = new WeakMap<HTMLTableRowElement, number>();

function getTable(): HTMLTableElement | null {
  return document.querySelector(".ysws-queue__table-container table") as HTMLTableElement | null;
}
function getHeadRow(table: HTMLTableElement): HTMLTableRowElement | null {
  return table.querySelector("thead tr") as HTMLTableRowElement | null;
}

function headerLabel(th: HTMLTableCellElement): string {
  if (th.querySelector("select#filter-type")) return "Type";
  // strip sort links but keep text
  const clone = th.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("select, style, script").forEach(n => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}
function headerKey(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("review") && l.includes("id")) return "id";
  if (l.includes("integrity")) return "integrity";
  if (l === "type") return "type";
  if (l.includes("project")) return "project";
  if (l.includes("user")) return "user";
  if (l.includes("length") || l.includes("hours")) return "length";
  if (l.includes("todo")) return "todo";
  if (l.includes("age")) return "age";
  if (l.includes("actions")) return "actions";
  return l;
}

// Only these are meant to be sortable client-side — mirrors lbSort only making `ysws-dashboard__col-num` sortable
// Avoids sorting the Type dropdown and other string columns that aren't supposed to be sorted
const SORTABLE_KEYS = new Set(["id", "length", "todo", "age"]);

function isSortableTh(th: HTMLTableCellElement): boolean {
  if (th.querySelector("select")) return false;
  const key = headerKey(headerLabel(th));
  if (key === "actions" || key === "type" || key === "integrity" || key === "project" || key === "user") return false;
  // allow if native server sort exists OR key is in allowlist
  if (th.querySelector("a.ysws-queue__sort")) return true;
  return SORTABLE_KEYS.has(key);
}

function parseAgeValue(cell: HTMLTableCellElement | null): number {
  const raw = (cell?.textContent ?? "").trim().toLowerCase();
  if (!raw || raw === "—" || raw === "-") return Infinity;
  if (raw.includes("today")) return 0;
  if (raw.includes("yesterday")) return 1;
  const days = raw.match(/(\d+)\s*days?\s*ago/);
  if (days) return parseFloat(days[1] ?? "0");
  const hrs = raw.match(/(\d+(?:\.\d+)?)\s*hours?\s*ago/);
  if (hrs) return parseFloat(hrs[1] ?? "0") / 24;
  const mins = raw.match(/(\d+)\s*mins?\s*ago/);
  if (mins) return parseFloat(mins[1] ?? "0") / 1440;
  const weeks = raw.match(/(\d+)\s*weeks?\s*ago/);
  if (weeks) return parseFloat(weeks[1] ?? "0") * 7;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? Infinity : n;
}
function cellValue(row: HTMLTableRowElement, col: number, key: string): number | string {
  const td = row.querySelectorAll("td")[col] as HTMLTableCellElement | null;
  if (!td) return "";
  switch (key) {
    case "id": {
      const m = (td.textContent ?? "").trim().match(/#?(\d+)/);
      return m ? parseInt(m[1]!, 10) : Infinity;
    }
    case "length": {
      const m = (td.textContent ?? "").trim().match(/(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]!) : Infinity;
    }
    case "todo": {
      const span = td.querySelector(".ysws-queue__todo-count");
      const txt = span?.textContent?.trim() ?? td.textContent?.trim() ?? "0";
      const n = parseInt(txt, 10);
      return Number.isNaN(n) ? -Infinity : n;
    }
    case "age": return parseAgeValue(td);
    default: return (td.textContent ?? "").trim().toLowerCase();
  }
}
function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number") return -1;
  if (typeof b === "number") return 1;
  return String(a).localeCompare(String(b));
}

// --- indicator handling — reuse native .ysws-queue__sort-arrow instead of adding a second triangle ---
function clearSortIndicators(headRow: HTMLTableRowElement) {
  const sortableThs = headRow.querySelectorAll<HTMLTableCellElement>(`.exterstellar-better-goi-sortable-th`);
  for (const th of Array.from(sortableThs)) {
    th.removeAttribute("aria-sort");
    delete th.dataset.sortDir;
    delete th.dataset.sortPriority;
    // remove legacy indicator from previous builds
    th.querySelector(`.exterstellar-better-goi-sort-indicator`)?.remove();
    const link = th.querySelector("a.ysws-queue__sort") as HTMLAnchorElement | null;
    if (link) {
      link.classList.remove("ysws-queue__sort--active");
      const arrow = link.querySelector(".ysws-queue__sort-arrow") as HTMLElement | null;
      if (arrow) arrow.textContent = "▾";
      // remove priority badge if we added one
      link.querySelector(".exterstellar-queue-priority")?.remove();
      th.querySelector(":scope > .exterstellar-better-goi-sort-indicator")?.remove();
      th.querySelector(":scope > .ysws-queue__sort-arrow.exterstellar-added")?.remove();
    } else {
      // th without native link (e.g. Age, Review ID) — remove arrow we added
      th.querySelector(":scope > .ysws-queue__sort-arrow.exterstellar-added")?.remove();
      th.querySelector(":scope > .exterstellar-queue-priority")?.remove();
    }
  }
}
function markSortIndicator(th: HTMLTableCellElement, dir: SortDir, priority: number | null) {
  th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
  const arrowChar = dir === "asc" ? "▲" : "▾";
  const suffix = priority == null ? "" : String(priority);
  const link = th.querySelector("a.ysws-queue__sort") as HTMLAnchorElement | null;
  if (link) {
    link.classList.add("ysws-queue__sort--active");
    let arrow = link.querySelector(".ysws-queue__sort-arrow") as HTMLElement | null;
    if (!arrow) {
      arrow = document.createElement("span");
      arrow.className = "ysws-queue__sort-arrow";
      arrow.setAttribute("aria-hidden", "true");
      link.appendChild(arrow);
    }
    arrow.textContent = arrowChar;
    if (suffix) {
      let badge = link.querySelector(".exterstellar-queue-priority") as HTMLElement | null;
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "exterstellar-queue-priority";
        badge.setAttribute("aria-hidden", "true");
        // tiny superscript style — inherits native arrow sizing
        badge.style.fontSize = "0.7em";
        badge.style.marginLeft = "2px";
        badge.style.opacity = "0.9";
        link.appendChild(badge);
      }
      badge.textContent = suffix;
    }
  } else {
    // No native link — create/reuse arrow directly in th to match native layout
    let arrow = th.querySelector(":scope > .ysws-queue__sort-arrow.exterstellar-added") as HTMLElement | null;
    if (!arrow) {
      arrow = document.createElement("span");
      arrow.className = "ysws-queue__sort-arrow exterstellar-added";
      arrow.setAttribute("aria-hidden", "true");
      // match native spacing
      arrow.style.marginLeft = "4px";
      th.appendChild(arrow);
    }
    arrow.textContent = arrowChar;
    if (suffix) {
      let badge = th.querySelector(":scope > .exterstellar-queue-priority") as HTMLElement | null;
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "exterstellar-queue-priority";
        badge.setAttribute("aria-hidden", "true");
        badge.style.fontSize = "0.7em";
        badge.style.marginLeft = "2px";
        badge.style.opacity = "0.9";
        th.appendChild(badge);
      }
      badge.textContent = suffix;
    }
  }
}
function renderIndicators(headRow: HTMLTableRowElement) {
  clearSortIndicators(headRow);
  const ths = Array.from(headRow.querySelectorAll("th")) as HTMLTableCellElement[];
  if (criteria.length <= 1) {
    criteria.forEach(c => {
      const th = ths[c.col];
      if (!th) return;
      th.dataset.sortDir = c.dir;
      markSortIndicator(th, c.dir, null);
    });
  } else {
    criteria.forEach((c, i) => {
      const th = ths[c.col];
      if (!th) return;
      th.dataset.sortDir = c.dir;
      th.dataset.sortPriority = String(i + 1);
      markSortIndicator(th, c.dir, i + 1);
    });
  }
}

function captureOriginalIndices(table: HTMLTableElement) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr")) as HTMLTableRowElement[];
  rows.forEach((r, i) => {
    if (!originalIndexMap.has(r)) originalIndexMap.set(r, i);
  });
}

function sortQueueTable(table: HTMLTableElement) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr")) as HTMLTableRowElement[];
  if (rows.length === 0 || criteria.length === 0) return;

  // pre-cache keys for criteria to avoid header lookup per row
  const keys = criteria.map(c => c.key);

  const decorated = rows.map(row => ({
    row,
    orig: originalIndexMap.get(row) ?? 0,
    vals: criteria.map((c, i) => cellValue(row, c.col, keys[i] ?? "")),
  }));

  decorated.sort((a, b) => {
    for (let i = 0; i < criteria.length; i++) {
      const dir = criteria[i]!.dir;
      const cmp = compareValues(a.vals[i]!, b.vals[i]!);
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return a.orig - b.orig;
  });

  // Use fragment to avoid 388× reflow — lbSort appends one-by-one, we batch
  const frag = document.createDocumentFragment();
  for (const d of decorated) frag.appendChild(d.row);
  tbody.appendChild(frag);
}

function persistCriteria() {
  try {
    // store by label (like lbSort stores column label) to survive column reorders
    localStorage.setItem("exterstellar-better-goi-queue-sort", JSON.stringify(criteria.map(c => ({ label: c.label, dir: c.dir }))));
    localStorage.removeItem("exterstellar-queue-sort");
  } catch {}
}
function loadStoredCriteria(headRow: HTMLTableRowElement): Criterion[] | null {
  try {
    const raw = localStorage.getItem("exterstellar-better-goi-queue-sort") ?? localStorage.getItem("exterstellar-queue-sort");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Array<{label:string; dir:SortDir; col?:number}>;
    if (!Array.isArray(parsed) || parsed.length===0) return null;
    const ths = Array.from(headRow.querySelectorAll("th")) as HTMLTableCellElement[];
    const out: Criterion[] = [];
    for (const p of parsed) {
      if (!p.label || (p.dir !== "asc" && p.dir !== "desc")) continue;
      // support legacy col-based storage
      let idx = -1;
      if (typeof (p as any).col === "number" && !p.label) {
        idx = (p as any).col as number;
      } else {
        idx = ths.findIndex(th => headerLabel(th) === p.label);
        if (idx === -1) idx = ths.findIndex(th => headerKey(headerLabel(th)) === headerKey(p.label));
      }
      if (idx < 0 || idx >= ths.length) continue;
      const th = ths[idx]!;
      if (!isSortableTh(th)) continue;
      out.push({ col: idx, dir: p.dir, label: headerLabel(th), key: headerKey(headerLabel(th)) });
    }
    return out.length ? out : null;
  } catch { return null; }
}

function handleHeaderActivate(table: HTMLTableElement, headRow: HTMLTableRowElement, col: number, th: HTMLTableCellElement, isMulti: boolean) {
  const label = headerLabel(th);
  const key = headerKey(label);
  const existingIdx = criteria.findIndex(c => c.col === col);

  if (!isMulti) {
    if (criteria.length === 1 && existingIdx === 0) {
      criteria[0]!.dir = criteria[0]!.dir === "asc" ? "desc" : "asc";
    } else {
      criteria = [{ col, dir: "asc", label, key }];
    }
  } else {
    if (existingIdx !== -1) {
      criteria[existingIdx]!.dir = criteria[existingIdx]!.dir === "asc" ? "desc" : "asc";
    } else {
      criteria.push({ col, dir: "asc", label, key });
    }
  }

  persistCriteria();
  renderIndicators(headRow);
  sortQueueTable(table);
}

function makeColumnSortable(table: HTMLTableElement, headRow: HTMLTableRowElement, th: HTMLTableCellElement, col: number) {
  if (th.classList.contains("exterstellar-better-goi-sortable-th")) return;
  th.classList.add("exterstellar-better-goi-sortable-th");
  th.setAttribute("tabindex", "0");
  th.setAttribute("role", "button");
  th.title = "Click to sort — Shift+Click (or Ctrl+Click) to add secondary sort (multi-sort)";

  const link = th.querySelector("a.ysws-queue__sort") as HTMLAnchorElement | null;
  if (link) {
    link.addEventListener("click", e => {
      // don't hijack if user is interacting with dropdown (shouldn't happen here) — guard anyway
      if ((e.target as HTMLElement).closest("select")) return;
      e.preventDefault();
      e.stopPropagation();
      handleHeaderActivate(table, headRow, col, th, (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey);
    });
  }

  th.addEventListener("click", e => {
    if ((e.target as HTMLElement).closest("select, option")) return;
    if ((e.target as HTMLElement).closest("a.ysws-queue__sort")) return; // already handled
    handleHeaderActivate(table, headRow, col, th, e.shiftKey || e.ctrlKey || e.metaKey);
  });
  th.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const ke = e as KeyboardEvent;
      handleHeaderActivate(table, headRow, col, th, ke.shiftKey || ke.ctrlKey || ke.metaKey);
    }
  });
}

function makeAllSortableColumns(table: HTMLTableElement, headRow: HTMLTableRowElement) {
  const ths = Array.from(headRow.querySelectorAll("th")) as HTMLTableCellElement[];
  ths.forEach((th, idx) => {
    if (!isSortableTh(th)) return;
    makeColumnSortable(table, headRow, th, idx);
  });
}

function observeQueueHeader(table: HTMLTableElement, headRow: HTMLTableRowElement) {
  if (table.hasAttribute("data-exterstellar-queue-sort-init")) return;
  table.setAttribute("data-exterstellar-queue-sort-init", "1");
  const obs = trackObserver(new MutationObserver(() => {
    makeAllSortableColumns(table, headRow);
  }));
  obs.observe(headRow, { childList: true });
}

function initQueueSorting(table: HTMLTableElement) {
  const headRow = getHeadRow(table);
  if (!headRow) return;
  captureOriginalIndices(table);
  makeAllSortableColumns(table, headRow);
  observeQueueHeader(table, headRow);

  // restore multi-sort if present and nothing active yet
  if (criteria.length === 0 && !Array.from(headRow.querySelectorAll("th")).some(th => (th as HTMLTableCellElement).dataset.sortDir)) {
    const stored = loadStoredCriteria(headRow);
    if (stored) {
      criteria = stored;
      renderIndicators(headRow);
      sortQueueTable(table);
    }
  } else if (criteria.length > 0) {
    renderIndicators(headRow);
    sortQueueTable(table);
  }
}

export function handleQueueMultiSort(cfg: Cfg): void {
  if (cfg.queueMultiSort === false || cfg.queueMultiSort === "false") return;
  const table = getTable();
  if (table) initQueueSorting(table);
}

export function teardownQueueMultiSort(): void {
  criteria = [];
}
