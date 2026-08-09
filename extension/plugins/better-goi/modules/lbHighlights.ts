import { parseNumericCellValue } from "./lbSort";

function clearHighlights(table: HTMLTableElement) {
  const highlighted = table.querySelectorAll(
    `.exterstellar-better-goi-top-value, .exterstellar-better-goi-rank-gain`,
  );
  for (const cell of Array.from(highlighted)) {
    cell.classList.remove("exterstellar-better-goi-top-value", "exterstellar-better-goi-rank-gain");
  }
}

export function highlightLeaderboardColumns(table: HTMLTableElement) {
  const headRow = table.querySelector("thead tr");
  if (!headRow) return;

  clearHighlights(table);

  const ths = Array.from(headRow.querySelectorAll("th")) as HTMLTableCellElement[];
  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  ths.forEach((th, columnIndex) => {
    if (!th.classList.contains("ysws-dashboard__col-num")) return;
    const label = th.textContent?.replace(/[▲▼]\s*\d*$/, "").trim() ?? "";

    if (label === "Past 7 days") {
      for (const row of rows) {
        const cell = row.querySelectorAll("td")[columnIndex];
        if (cell?.textContent?.trim().startsWith("▲")) {
          cell.classList.add("exterstellar-better-goi-rank-gain");
        }
      }
      return;
    }

    let topCell: HTMLTableCellElement | null = null;
    let topValue = -Infinity;

    for (const row of rows) {
      const cell = row.querySelectorAll("td")[columnIndex] ?? null;
      const value = parseNumericCellValue(cell);
      if (cell && value > topValue) {
        topValue = value;
        topCell = cell;
      }
    }

    if (topCell && Number.isFinite(topValue)) {
      topCell.classList.add("exterstellar-better-goi-top-value");
    }
  });
}