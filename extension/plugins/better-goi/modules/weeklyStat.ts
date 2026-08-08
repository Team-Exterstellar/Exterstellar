import type { Cfg } from "./types";
import {
  findReviewerChartElements,
  getChartInstance,
  getMyUsername,
  extractPointValue,
} from "../utils/chartUtils";
import { getMondayKey } from "./projCounter";

function parseLabelToDate(label: string, reference: Date): Date {
  const [monthStr, dayStr] = label.split("/");
  const month = parseInt(monthStr ?? "1", 10) - 1;
  const day = parseInt(dayStr ?? "1", 10);

  let year = reference.getFullYear();
  let date = new Date(year, month, day);

  const diffDays = (date.getTime() - reference.getTime()) / 86_400_000;
  if (diffDays > 180) {
    date = new Date(year - 1, month, day);
  } else if (diffDays < -180) {
    date = new Date(year + 1, month, day);
  }

  return date;
}

function getWeekRange(reference: Date): { start: Date; end: Date } {
  const day = reference.getDay();
  const diffToMonday = (day + 6) % 7;

  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export async function computeWeeklyCountForUsername(
  chart: any,
  username: string,
  now: Date,
): Promise<number | null> {
  const labels: string[] = chart.data.labels ?? [];
  const dataset = chart.data.datasets.find(
    (d: any) => (d.label ?? "").trim().toLowerCase() === username,
  );
  if (!dataset?.data || !labels.length) return null;

  const { start, end } = getWeekRange(now);

  let sum = 0;
  for (let i = 0; i < labels.length; i++) {
    const labelDate = parseLabelToDate(labels[i] ?? "", now);
    if (labelDate >= start && labelDate <= end) {
      sum += extractPointValue(dataset.data[i]);
    }
  }

  return sum;
}

async function computeMyWeeklyDevlogCount(): Promise<number | null> {
  const found = findReviewerChartElements();
  if (!found) return null;

  const username = getMyUsername();
  if (!username) return null;

  const chart = await getChartInstance(found.canvas);
  if (!chart) return null;

  return computeWeeklyCountForUsername(chart, username, new Date());
}

function getWeeklyProjectsReviewed(): number {
  const currentMonday = getMondayKey();
  const storedMonday = localStorage.getItem(
    "exterstellar-better-goi-projects-reviewed-this-week-start",
  );
  if (storedMonday !== currentMonday) return 0;
  return (
    parseInt(
      localStorage.getItem(
        "exterstellar-better-goi-projects-reviewed-this-week",
      ) ?? "0",
      10,
    ) || 0
  );
}

async function injectWeeklyStat(goalEl: Element) {
  if (document.getElementById("exterstellar-better-goi-week-stats")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "exterstellar-better-goi-week-stats";
  wrapper.classList.add("exterstellar-better-goi-week-stats");
  wrapper.setAttribute("role", "status");
  wrapper.setAttribute("aria-live", "polite");

  const span = document.createElement("span");
  span.classList.add("ysws-queue__goal-label");
  span.textContent = "Checking your week...";
  wrapper.appendChild(span);

  goalEl.after(wrapper);

  const count = await computeMyWeeklyDevlogCount();
  if (count === null) {
    wrapper.remove();
    return;
  }

  const weeklyProjsReviewed = getWeeklyProjectsReviewed();
  const devlogText = `You've reviewed ${count} devlog${count === 1 ? "" : "s"} this week!`;
  const projsText =
    weeklyProjsReviewed > 0
      ? ` That's over ${weeklyProjsReviewed} project${weeklyProjsReviewed === 1 ? "" : "s"}!`
      : "";

     span.textContent = `${devlogText}${projsText}`;
}

export function handleWeeklyStat(cfg: Cfg) {
  if (cfg.weeklyStat === false || cfg.weeklyStat === "false") return;
  if (document.getElementById("exterstellar-better-goi-week-stats")) return;

  let attempts = 0;
  const tryInject = () => {
    const goalEl = document.querySelector(".ysws-queue__goal");
    if (goalEl) {
      injectWeeklyStat(goalEl);
      return;
    }
    attempts += 1;
    if (attempts < 20) requestAnimationFrame(tryInject);
  };

  tryInject();
}