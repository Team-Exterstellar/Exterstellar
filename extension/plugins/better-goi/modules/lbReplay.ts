import type { Cfg } from "./types";
import { findReviewerChartElements, getChartInstance } from "../utils/chartUtils";
import { computeCumulativeStateForDay } from "../utils/rankUtils";
import { finalizeLeaderboardSortRestore } from "./lbSort";
import { getUsernameFromLeaderboardRow } from "./lbCol";
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let replayInProgress = false;

function reorderRowsByRank(
  table: HTMLTableElement,
  ranks: Map<string, number>,
  totals: Map<string, number>,
) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr")) as HTMLTableRowElement[];

  const ordered = rows
    .map((row) => {
      const username = getUsernameFromLeaderboardRow(row);
      return {
        row,
        username,
        rank: username ? (ranks.get(username) ?? Infinity) : Infinity,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  for (const { row, username } of ordered) {
    tbody.appendChild(row);
    const devlogsCell = row.querySelectorAll("td")[2];
    if (devlogsCell && username) {
      devlogsCell.textContent = String(totals.get(username) ?? 0);
    }
  }

  const rankCells = Array.from(
    tbody.querySelectorAll(`tr > td.ysws-dashboard__col-rank`),
  ) as HTMLTableCellElement[];
  rankCells.forEach((cell, i) => {
    cell.textContent = String(i + 1);
  });
}

async function playLeaderboardReplay(
  table: HTMLTableElement,
  chart: any,
  dateLabel: HTMLElement,
  cfg: Cfg
) {
  if (replayInProgress) return;
  replayInProgress = true;

  const labels: string[] = chart.data.labels ?? [];
  const tbody = table.querySelector("tbody");
  tbody?.classList.add("exterstellar-better-goi-replay-active");

  const rows = Array.from(tbody?.querySelectorAll("tr") ?? []) as HTMLTableRowElement[];
  const originalDevlogsText = new Map<HTMLTableRowElement, string>();
  for (const row of rows) {
    const cell = row.querySelectorAll("td")[2];
    originalDevlogsText.set(row, cell?.textContent ?? "0");
  }

  try {
    for (let day = 0; day < labels.length; day++) {
      const { ranks, totals } = computeCumulativeStateForDay(chart, day);
      reorderRowsByRank(table, ranks, totals);
      dateLabel.textContent = labels[day] ?? "";
      await sleep(400);
    }
  } finally {
    for (const [row, text] of originalDevlogsText) {
      const cell = row.querySelectorAll("td")[2];
      if (cell) cell.textContent = text;
    }
    tbody?.classList.remove("exterstellar-better-goi-replay-active");
    dateLabel.textContent = "";
    replayInProgress = false;
    finalizeLeaderboardSortRestore(cfg);
  }
}

function injectReplayButton(headingEl: Element, table: HTMLTableElement, cfg: Cfg) {
  if (document.getElementById("exterstellar-better-goi-replay-btn")) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("exterstellar-better-goi-replay-wrapper");

  const button = document.createElement("button");
  button.id = "exterstellar-better-goi-replay-btn";
  button.type = "button";
  button.textContent = "Play replay :3";
  button.classList.add("exterstellar-better-goi-chart-button");

  const dateLabel = document.createElement("span");
  dateLabel.classList.add("exterstellar-better-goi-replay-date");

  button.addEventListener("click", async () => {
    if (replayInProgress) return;
    const found = findReviewerChartElements();
    if (!found) return;
    const chart = await getChartInstance(found.canvas);
    if (!chart) return;
    playLeaderboardReplay(table, chart, dateLabel, cfg);
  });

  wrapper.appendChild(button);
  wrapper.appendChild(dateLabel);
  headingEl.insertAdjacentElement("afterend", wrapper);
}

export function handleLeaderboardReplay(cfg: Cfg) {
  if (cfg.leaderboardReplay === false || cfg.leaderboardReplay === "false")
    return;
  if (document.getElementById("exterstellar-better-goi-replay-btn")) return;

  const heading = document.querySelector(
    ".ysws-dashboard__panel--leaderboard .ysws-dashboard__heading",
  );
  const table = document.querySelector<HTMLTableElement>(
    ".ysws-dashboard__table",
  );
  if (heading && table) injectReplayButton(heading, table, cfg);
}