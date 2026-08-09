import type { Cfg } from "./types";
export function getMondayKey(d = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
function incrementReviewCounters() {
  const total =
    parseInt(
      localStorage.getItem("exterstellar-better-goi-projects-reviewed") ?? "0",
      10,
    ) || 0;
  localStorage.setItem(
    "exterstellar-better-goi-projects-reviewed",
    String(total + 1),
  );
  const currentMonday = getMondayKey();
  const storedMonday = localStorage.getItem(
    "exterstellar-better-goi-projects-reviewed-this-week-start",
  );
  let weekTotal =
    parseInt(
      localStorage.getItem(
        "exterstellar-better-goi-projects-reviewed-this-week",
      ) ?? "0",
      10,
    ) || 0;
  if (storedMonday !== currentMonday) {
    weekTotal = 0;
    localStorage.setItem(
      "exterstellar-better-goi-projects-reviewed-this-week-start",
      currentMonday,
    );
  }
  localStorage.setItem(
    "exterstellar-better-goi-projects-reviewed-this-week",
    String(weekTotal + 1),
  );
}
export async function handleIncremationProjectReviewed(
  cfg: Cfg,
  isReviewPage: boolean,
  isQueuePage: boolean,
) {
  if (cfg.projectsReviewedCounter === false || cfg.projectsReviewedCounter === "false")
    return;
  if (isReviewPage) {
    const completeReviewBtn = document.querySelector(
      '[data-certification--ysws--complete-review-target="button"]'
    );
    completeReviewBtn?.addEventListener("click", incrementReviewCounters);
  } else if (isQueuePage) {
    if (document.getElementById("exterstellar-better-goi-projects-reviewed"))
      return;

    const allTimeTotal =
      parseInt(
        localStorage.getItem("exterstellar-better-goi-projects-reviewed") ?? "0",
        10,
      ) || 0;
    const weekTotal =
      parseInt(
        localStorage.getItem("exterstellar-better-goi-projects-reviewed-this-week") ?? "0",
        10,
      ) || 0;

    if (allTimeTotal === 0 && weekTotal === 0) return;

    let attempts = 0;
    const tryInject = () => {
      if (document.getElementById("exterstellar-better-goi-projects-reviewed"))
        return;
      const noteEl = document.querySelector(
        ".ysws-dashboard__progress-note",
      );
      if (!noteEl) {
        attempts += 1;
        if (attempts < 20) requestAnimationFrame(tryInject);
        return;
      }
      const span = document.createElement("span");
      span.id = "exterstellar-better-goi-projects-reviewed";
      span.textContent = ` You've reviewed ${weekTotal} project${weekTotal === 1 ? "" : "s"} this week (${allTimeTotal} all time).`;
      noteEl.appendChild(span);
    };
    tryInject();
  }
}