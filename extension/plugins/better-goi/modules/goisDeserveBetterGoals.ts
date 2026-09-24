import { Cfg } from "./types";
import { trackObserver } from "./cleanupRegistry";

function waitForElement<T extends Element>(
  selector: string,
  root: ParentNode | null = document.body,
  timeoutMs = 10_000,
): Promise<T | null> {
  const effectiveRoot = (root as ParentNode | null) ?? document.body ?? document.documentElement;
  if (!effectiveRoot || typeof (effectiveRoot as any).querySelector !== "function") return Promise.resolve(null);
  const existing = effectiveRoot.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const el = effectiveRoot.querySelector<T>(selector);
      if (el) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(el);
      }
    });
    try {
      observer.observe(effectiveRoot, { childList: true, subtree: true });
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

const PAYOUT_KEY = "exterstellar-better-goi-pending-payout";

function capturePendingPayout(): number | null {
  const el = document.querySelector<HTMLElement>(".ysws-dashboard__progress-payout-amount");
  if (!el) return null;
  const raw = el.textContent?.trim() ?? "";
  const m = raw.match(/([\d.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  if (Number.isNaN(v)) return null;
  localStorage.setItem(PAYOUT_KEY, v.toString());
  return v;
}

function getPendingPayout(): number {
  const v = parseFloat(localStorage.getItem(PAYOUT_KEY) ?? "0");
  return Number.isNaN(v) ? 0 : v;
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
    if (note) {
      const match = note.textContent?.match(/up from\s+([\d.]+)\s*✦/);
      if (match) {
        const currentRate = parseFloat(match[1] ?? "");
        const storedRate = localStorage.getItem("exterstellar-better-goi-sd-rate");
        if (currentRate !== parseFloat(storedRate ?? "")) {
          localStorage.setItem("exterstellar-better-goi-sd-rate", currentRate.toString());
        }
      }
    }

    // Payout amount is inside the dashboard turbo frame which lazy-loads; capture immediately if present, otherwise wait and observe.
    if (capturePendingPayout() === null) {
      void waitForElement<HTMLElement>(".ysws-dashboard__progress-payout-amount").then((el) => {
        if (el) capturePendingPayout();
      });
    }
    // Keep stored payout in sync if the dashboard updates live (e.g. after reviewing)
    const payoutObserver = trackObserver(
      new MutationObserver(() => {
        capturePendingPayout();
      }),
    );
    // Observe the dashboard container if present, otherwise whole body
    const dashRoot =
      (document.querySelector(".ysws-dashboard__progress") as ParentNode | null) ??
      (document.querySelector(".ysws-dashboard") as ParentNode | null) ??
      (document.body as ParentNode | null) ??
      document.documentElement;
    if (dashRoot) {
      try {
        payoutObserver.observe(dashRoot, { childList: true, subtree: true, characterData: true });
      } catch {}
    }
  } else if (window.location.pathname === "/shop") {
    const storedRate = parseFloat(localStorage.getItem("exterstellar-better-goi-sd-rate") ?? "");
    if (!storedRate || Number.isNaN(storedRate)) return;
    const itemsContainer =
      document.querySelector<HTMLElement>(".shop-goals__items");
    if (!itemsContainer) return;

    const pending = getPendingPayout();

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

      const effectiveDustNeeded = Math.max(0, dustNeeded - pending);
      const devlogsLeft = Math.ceil(effectiveDustNeeded / storedRate);
      devlogsLeftByName.set(name, devlogsLeft);

      const pendingSuffix =
        pending > 0.001 ? `, ${pending.toFixed(1)} pending payout` : "";
      const label = ` (~${devlogsLeft} devlog${devlogsLeft === 1 ? "" : "s"}${pendingSuffix})`;

      const ensureSpan = () => {
        const existingSpan = progressText.querySelector<HTMLElement>(
          ".sge-devlogs-left",
        );
        if (existingSpan) {
          if (existingSpan.textContent !== label) {
            existingSpan.textContent = label;
          }
          return;
        }
        const span = document.createElement("span");
        span.className = "sge-devlogs-left";
        span.textContent = label;
        progressText.appendChild(span);
      };
      ensureSpan();
      trackObserver(new MutationObserver(() => ensureSpan())).observe(progressText, {
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
    trackObserver(new MutationObserver(() => applyRecSuffix())).observe(recRoot, {
      childList: true,
      subtree: true,
    });
  }
}
