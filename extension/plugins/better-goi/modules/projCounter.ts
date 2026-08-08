import type { Cfg } from "./types";

// Count projects reviewed
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

    const projsReviewed = Number(
      localStorage.getItem("exterstellar-better-goi-projects-reviewed")
    ) || 0;
    if (projsReviewed === 0) return;

    let attempts = 0;
    const tryInject = () => {
      if (document.getElementById("exterstellar-better-goi-projects-reviewed"))
        return;

      const goalEl = document.querySelector(".ysws-queue__goal");
      if (!goalEl) {
        attempts += 1;
        if (attempts < 20) requestAnimationFrame(tryInject);
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.id = "exterstellar-better-goi-projects-reviewed";
      wrapper.classList.add("exterstellar-better-goi-week-stats");
      wrapper.setAttribute("role", "status");
      wrapper.setAttribute("aria-live", "polite");

      const span = document.createElement("span");
      span.classList.add("ysws-queue__goal-label");
      span.textContent = `You've reviewed ${projsReviewed} project${projsReviewed === 1 ? "" : "s"}!`;
      wrapper.appendChild(span);

      goalEl.after(wrapper);
    };

    tryInject();
  }
}