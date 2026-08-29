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

function getReviewIdFromUrl(): string | null {
  const m = window.location.pathname.match(
    /\/admin\/certification\/review\/(\d+)/,
  );
  return m ? (m[1] ?? null) : null;
}

const REVIEWED_IDS_KEY = "exterstellar-better-goi-reviewed-review-ids";
const MAX_REVIEWED_IDS = 2000;

// Returns true only the first time a given review id is seen, so re-clicking
// the same review (or re-running the listener after a re-render/navigation)
// can never inflate the counters. This is what keeps the local total in sync
// with the DB's count of distinct reviews completed that day.
function claimReviewId(reviewId: string): boolean {
  let ids: string[] = [];
  try {
    ids = JSON.parse(
      localStorage.getItem(REVIEWED_IDS_KEY) ?? "[]",
    );
  } catch {
    ids = [];
  }
  if (!Array.isArray(ids)) ids = [];
  if (ids.includes(reviewId)) return false;
  ids.push(reviewId);
  if (ids.length > MAX_REVIEWED_IDS) ids = ids.slice(-MAX_REVIEWED_IDS);
  localStorage.setItem(REVIEWED_IDS_KEY, JSON.stringify(ids));
  return true;
}

function incrementReviewCounters() {
  const reviewId = getReviewIdFromUrl();
  if (reviewId && !claimReviewId(reviewId)) return;

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
      '[data-certification--ysws--complete-review-target="button"]',
    );
    if (
      completeReviewBtn &&
      !completeReviewBtn.hasAttribute("data-exter-reviewed-bound")
    ) {
      completeReviewBtn.setAttribute("data-exter-reviewed-bound", "1");
      completeReviewBtn.addEventListener("click", incrementReviewCounters);
    }
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