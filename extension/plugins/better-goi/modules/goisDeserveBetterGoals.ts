import { Cfg } from "./types";

function waitForElement<T extends Element>(
  selector: string,
  root: ParentNode = document.body,
  timeoutMs = 10_000,
): Promise<T | null> {
  const existing = root.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const el = root.querySelector<T>(selector);
      if (el) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  });
}

export async function handleGoisDeserveBetterGoals(
  cfg: Cfg,
  isQueuePage: boolean,
) {
  if (
    cfg.goisDeserveBetterGoals === false ||
    cfg.goisDeserveBetterGoals === "false"
  )
    return;
  if (isQueuePage) {
    const note = document.querySelector<HTMLElement>(
      ".ysws-dashboard__progress-tier-note",
    );
    if (!note) return;
    const match = note.textContent?.match(/up from\s+([\d.]+)\s*✦/);
    if (!match) return;
    const currentRate = parseFloat(match[1] ?? "");
    const storedRate = localStorage.getItem("exterstellar-better-goi-sd-rate");
    if (currentRate !== parseFloat(storedRate ?? "")) {
      localStorage.setItem(
        "exterstellar-better-goi-sd-rate",
        currentRate.toString(),
      );
    }
  } else {
    if (window.location.pathname !== "/shop") return;
    const storedRate = parseFloat(
      localStorage.getItem("exterstellar-better-goi-sd-rate") ?? "",
    );
    if (!storedRate || Number.isNaN(storedRate)) return;

    const itemsContainer =
      document.querySelector<HTMLElement>(".shop-goals__items");
    if (!itemsContainer) return;

    const items = Array.from(
      itemsContainer.querySelectorAll<HTMLElement>(".shop-goals__item"),
    );

    const devlogsLeftByName = new Map<string, number>();

    for (const item of items) {
      const name = item.querySelector(".shop-goals__name")?.textContent?.trim();
      const progressText = item.querySelector<HTMLElement>(
        ".shop-goals__progress-text",
      );
      if (!name || !progressText) continue;

      const match = progressText.textContent?.match(/([\d.]+)\s*more needed/);
      if (!match) continue;

      const dustNeeded = parseFloat(match[1] ?? "");
      if (Number.isNaN(dustNeeded)) continue;

      const devlogsLeft = Math.ceil(dustNeeded / storedRate);
      devlogsLeftByName.set(name, devlogsLeft);

      const label = ` (~${devlogsLeft} devlog${devlogsLeft === 1 ? "" : "s"})`;
      const ensureSpan = () => {
        if (progressText.querySelector(".sge-devlogs-left")) return;
        const span = document.createElement("span");
        span.className = "sge-devlogs-left";
        span.textContent = label;
        progressText.appendChild(span);
      };

      ensureSpan();
      new MutationObserver(() => ensureSpan()).observe(progressText, {
        childList: true,
      });
    }

    const recRoot =
      itemsContainer.closest<HTMLElement>("section") ??
      itemsContainer.parentElement?.parentElement ??
      document.body;

    const applyRecSuffix = () => {
      const rec = recRoot.querySelector<HTMLElement>(".sge-rec");
      if (!rec) return;
      if (rec.querySelector(".sge-rec-devlogs-left")) return;

      const recName = rec.querySelector("strong")?.textContent?.trim();
      if (!recName) return;

      const devlogsLeft = devlogsLeftByName.get(recName);
      if (devlogsLeft === undefined) return;

      const suffix = document.createElement("span");
      suffix.className = "sge-rec-devlogs-left";
      suffix.textContent = ` (~${devlogsLeft} devlog${devlogsLeft === 1 ? "" : "s"} left)`;
      rec.appendChild(suffix);
    };

    applyRecSuffix();
    new MutationObserver(() => applyRecSuffix()).observe(recRoot, {
      childList: true,
      subtree: true,
    });
  }
}
