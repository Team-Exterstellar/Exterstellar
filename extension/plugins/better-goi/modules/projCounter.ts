import type { Cfg } from "./types";

export function getWeekResetKey(d = new Date()): string {
  const utc = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ),
  );

  const day = utc.getUTCDay();
  const diffToWednesday = (day - 3 + 7) % 7;

  const boundary = new Date(utc);
  boundary.setUTCDate(utc.getUTCDate() - diffToWednesday);
  boundary.setUTCHours(20, 0, 0, 0);

  if (boundary.getTime() > utc.getTime()) {
    boundary.setUTCDate(boundary.getUTCDate() - 7);
  }

  return boundary.toISOString().slice(0, 13);
}

export function getDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  const currentWeekKey = getWeekResetKey();
  const storedWeekKey = localStorage.getItem(
    "exterstellar-better-goi-projects-reviewed-this-week-start",
  );
  let weekTotal =
    parseInt(
      localStorage.getItem(
        "exterstellar-better-goi-projects-reviewed-this-week",
      ) ?? "0",
      10,
    ) || 0;
  if (storedWeekKey !== currentWeekKey) {
    weekTotal = 0;
    localStorage.setItem(
      "exterstellar-better-goi-projects-reviewed-this-week-start",
      currentWeekKey,
    );
  }
  localStorage.setItem(
    "exterstellar-better-goi-projects-reviewed-this-week",
    String(weekTotal + 1),
  );

  // Daily (resets at local midnight)
  const currentDayKey = getDayKey();
  const storedDayKey = localStorage.getItem(
    "exterstellar-better-goi-projects-reviewed-today-date",
  );
  let dayTotal =
    parseInt(
      localStorage.getItem("exterstellar-better-goi-projects-reviewed-today") ??
        "0",
      10,
    ) || 0;
  if (storedDayKey !== currentDayKey) {
    dayTotal = 0;
    localStorage.setItem(
      "exterstellar-better-goi-projects-reviewed-today-date",
      currentDayKey,
    );
  }
  localStorage.setItem(
    "exterstellar-better-goi-projects-reviewed-today",
    String(dayTotal + 1),
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

    const weekTotalRaw =
      parseInt(
        localStorage.getItem("exterstellar-better-goi-projects-reviewed-this-week") ?? "0",
        10,
      ) || 0;
    const storedWeekKey = localStorage.getItem(
      "exterstellar-better-goi-projects-reviewed-this-week-start",
    );
    const weekTotal = storedWeekKey === getWeekResetKey() ? weekTotalRaw : 0;

    const dayTotalRaw =
      parseInt(
        localStorage.getItem("exterstellar-better-goi-projects-reviewed-today") ?? "0",
        10,
      ) || 0;
    const storedDayKey = localStorage.getItem(
      "exterstellar-better-goi-projects-reviewed-today-date",
    );
    const dayTotal = storedDayKey === getDayKey() ? dayTotalRaw : 0;

    if (allTimeTotal === 0 && weekTotal === 0 && dayTotal === 0) return;

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
      span.textContent = ` You've reviewed ${dayTotal} project${dayTotal === 1 ? "" : "s"} today, ${weekTotal} this week (${allTimeTotal} all time).`;
      noteEl.appendChild(span);
    };
    tryInject();
  }
}