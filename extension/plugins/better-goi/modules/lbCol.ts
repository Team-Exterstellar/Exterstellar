import type { Cfg } from "./types";
import { extractPointValue, findReviewerChartElements, getChartInstance } from "../utils/chartUtils";
import { computeWeeklyCountForUsername } from "./weeklyStat";
import {
  computeRanksAtCutoff,
  formatRankChange,
  computeDaysOnTop,
} from "../utils/rankUtils";
import { highlightLeaderboardColumns } from "./lbHighlights";

export function getUsernameFromLeaderboardRow(
  row: HTMLTableRowElement,
): string | null {
  const link = row.querySelector<HTMLAnchorElement>("a[href^='/admin/users/']");
  const text = link?.textContent?.trim() ?? "";
  return text ? text.toLowerCase() : null;
}

export async function computeTotalCountForUsername(
  chart: any,
  username: string,
): Promise<number | null> {
  const datasets = chart.data.datasets ?? [];
  const dataset = datasets.find(
    (d: any) => (d.label ?? "").toLowerCase() === username,
  );
  if (!dataset) return null;

  const points: any[] = dataset.data ?? [];
  return points.reduce((sum, point) => sum + extractPointValue(point), 0);
}

async function injectWeeklyLeaderboardColumn(
  table: HTMLTableElement,
  cfg: Cfg,
) {
  if (table.hasAttribute("data-exterstellar-weekly-col")) return;
  table.setAttribute("data-exterstellar-weekly-col", "1");
  const found = findReviewerChartElements();
  if (!found) return;
  const chart = await getChartInstance(found.canvas);
  if (!chart) return;

  const showRankChange = cfg.rankChange !== false && cfg.rankChange !== "false";
  const showDaysOnTop = cfg.daysOnTop !== false && cfg.daysOnTop !== "false";
  const showHighlights = cfg.leaderboardHighlights !== false && cfg.leaderboardHighlights !== "false";
  const showTotal = cfg.totalDevlogs !== false && cfg.totalDevlogs !== "false";

  const headRow = table.querySelector("thead tr");
  if (headRow) {
    const th = document.createElement("th");
    th.classList.add("ysws-dashboard__col-num");
    th.textContent = "This week";
    headRow.appendChild(th);
    if (showRankChange) {
      const rankTh = document.createElement("th");
      rankTh.classList.add("ysws-dashboard__col-num");
      rankTh.textContent = "Past 7 days";
      headRow.appendChild(rankTh);
    }
    if (showDaysOnTop) {
      const daysOnTopTh = document.createElement("th");
      daysOnTopTh.classList.add("ysws-dashboard__col-num");
      daysOnTopTh.textContent = "Days on top";
      headRow.appendChild(daysOnTopTh);
    }
    if (showTotal) {
      const totalTh = document.createElement("th");
      totalTh.classList.add("ysws-dashboard__col-num");
      totalTh.textContent = "Total devlogs";
      headRow.appendChild(totalTh);
    }
  }

  const now = new Date();
  const labels: string[] = chart.data.labels ?? [];
  const cutoffIndex = Math.max(0, labels.length - 7);
  const priorRanks = showRankChange
    ? computeRanksAtCutoff(chart, cutoffIndex)
    : null;
  const daysOnTop = showDaysOnTop ? computeDaysOnTop(chart) : null;

  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const username = getUsernameFromLeaderboardRow(row);
    const count = username
      ? await computeWeeklyCountForUsername(chart, username, now)
      : null;
    const td = document.createElement("td");
    td.classList.add("ysws-dashboard__col-num");
    td.textContent = count === null ? "0" : String(count);
    row.appendChild(td);

    if (showRankChange && priorRanks) {
      const currentRank = i + 1;
      const previousRank = username ? priorRanks.get(username) : undefined;
      const rankTd = document.createElement("td");
      rankTd.classList.add("ysws-dashboard__col-num");
      rankTd.textContent = formatRankChange(currentRank, previousRank);
      row.appendChild(rankTd);
    }

    if (showDaysOnTop && daysOnTop) {
      const daysOnTopTd = document.createElement("td");
      daysOnTopTd.classList.add("ysws-dashboard__col-num");
      daysOnTopTd.textContent = String(
        username ? (daysOnTop.get(username) ?? 0) : 0,
      );
      row.appendChild(daysOnTopTd);
    }

    if (showTotal) {
      const total = username
        ? await computeTotalCountForUsername(chart, username)
        : null;
      const totalTd = document.createElement("td");
      totalTd.classList.add("ysws-dashboard__col-num");
      totalTd.textContent = total === null ? "0" : String(total);
      row.appendChild(totalTd);
    }
  }

  if (showHighlights) highlightLeaderboardColumns(table);
}

export function handleWeeklyLeaderboardColumn(cfg: Cfg): Promise<void> {
  if (
    cfg.weeklyLeaderboardColumn === false ||
    cfg.weeklyLeaderboardColumn === "false"
  )
    return Promise.resolve();
  const table = document.querySelector<HTMLTableElement>(
    ".ysws-dashboard__table",
  );
  if (!table) return Promise.resolve();
  return injectWeeklyLeaderboardColumn(table, cfg);
}