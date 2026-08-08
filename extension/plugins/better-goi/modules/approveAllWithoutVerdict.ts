import type { Cfg } from "./types";

// Approve all devlogs missing a verdict hyperlink
function getMissingVerdictItems(): Element[] {
  const items = Array.from(document.querySelectorAll(".devlog-item"));
  return items.filter((item) => {
    const status = item.getAttribute(
      "data-certification--ysws--devlog-review-status-value",
    );
    if (status === "rejected" || status === "approved") return false;

    const isLocked = item.querySelector(".devlog-header-row .status-frozen");
    if (isLocked) return false;

    return true;
  });
}

function approveAllMissingVerdict() {
  const items = getMissingVerdictItems();
  for (const item of items) {
    const approveBtn = item.querySelector<HTMLButtonElement>(
      '[data-certification--ysws--devlog-review-target="approveButton"]',
    );
    approveBtn?.click();
  }

  const closeBtn = document.querySelector<HTMLButtonElement>(".alert__close");
  closeBtn?.click();
}

function injectApproveAllLink(alertContent: HTMLElement) {
  if (document.getElementById("exterstellar-better-goi-approve-all-link"))
    return;

  const link = document.createElement("a");
  link.id = "exterstellar-better-goi-approve-all-link";
  link.href = "#";
  link.textContent = "Approve all devlogs missing a verdict?";
  link.classList.add("exterstellar-better-goi-approve-all-link");
  link.addEventListener("click", (e) => {
    e.preventDefault();
    approveAllMissingVerdict();
  });

  alertContent.appendChild(document.createTextNode(" "));
  alertContent.appendChild(link);
}

function checkFlashForMissingVerdict() {
  if (
    !/^\/admin\/certification\/review\/[^/]+\/?$/.test(window.location.pathname)
  )
    return;

  const flashContainer = document.querySelector(".flash-container");
  const alertContent =
    flashContainer?.querySelector<HTMLElement>(".alert__content");
  if (!alertContent) return;

  const text = alertContent.textContent ?? "";
  if (!text.includes("Review all devlogs before completing")) return;
  if (alertContent.hasAttribute("data-exterstellar-approve-all-injected"))
    return;

  alertContent.setAttribute("data-exterstellar-approve-all-injected", "1");
  injectApproveAllLink(alertContent);
}

let approveAllObserverAttached = false;

export function handleApproveAllMissingVerdict(cfg: Cfg) {
  if (
    cfg.approveAllMissingVerdict === false ||
    cfg.approveAllMissingVerdict === "false"
  )
    return;

  checkFlashForMissingVerdict();

  if (approveAllObserverAttached) return;
  approveAllObserverAttached = true;

  const observer = new MutationObserver(() => {
    checkFlashForMissingVerdict();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}