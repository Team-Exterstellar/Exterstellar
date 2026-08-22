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

const STARDUST_LAST_ID_KEY = "exterstellar-better-goi-stardust-last-id";
const STARDUST_ADJUSTMENT_KEY = "exterstellar-better-goi-stardust-adjustment-total";

function parseStardustDelta(item: HTMLElement): number | null {
  const icon = item.querySelector(".notifications-item__icon");
  if (icon?.classList.contains("notifications-item__icon--avatar")) return null;

  const titleEl = item.querySelector(".notifications-item__title");
  const strongText = titleEl?.querySelector("strong")?.textContent?.trim() ?? "";
  const match = strongText.match(/([+-]\d+(?:\.\d+)?)\s*stardust/i);
  if (!match) return null;
  const delta = parseFloat(match[1]!);

  // A positive "user grant" is the GOI payout itself landing in the wallet —
  // that's the same money `projected` is already forecasting, so don't net it out.
  // Everything else — shop purchases, refunds, negative/corrective grants,
  // whatever label it carries — is real wallet movement `projected` doesn't
  // know about, so always count it.
  const isPositiveUserGrant = delta > 0 && /\(user grant\)/i.test(titleEl?.textContent ?? "");
  if (isPositiveUserGrant) return null;

  return delta;
}

export function captureStardustAdjustments(): void {
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".notifications-item[data-notification-id]",
    ),
  );
  if (items.length === 0) return;

  const lastId = parseInt(localStorage.getItem(STARDUST_LAST_ID_KEY) ?? "0", 10);
  let runningTotal = parseFloat(
    localStorage.getItem(STARDUST_ADJUSTMENT_KEY) ?? "0",
  );
  let maxIdSeen = lastId;

  for (const item of items) {
    const id = parseInt(item.dataset.notificationId ?? "", 10);
    if (Number.isNaN(id) || id <= lastId) continue;

    const delta = parseStardustDelta(item);
    if (delta !== null) runningTotal += delta;
    if (id > maxIdSeen) maxIdSeen = id;
  }

  localStorage.setItem(STARDUST_ADJUSTMENT_KEY, runningTotal.toString());
  localStorage.setItem(STARDUST_LAST_ID_KEY, maxIdSeen.toString());
}

function getColumnIndex(
  table: HTMLTableElement,
  headerMatch: string,
): number {
  const headers = Array.from(table.querySelectorAll("thead th"));
  return headers.findIndex((th) =>
    th.textContent?.trim().includes(headerMatch),
  );
}

function getOwnHandle(): string | null {
  const handleEl = document.querySelector<HTMLElement>(
    ".sidebar__user-meta-handle",
  );
  const raw = handleEl?.textContent?.trim();
  if (!raw) return null;
  return raw.replace(/^@/, "");
}

function captureOwnProjectedStardust(): void {
  const table = document.querySelector<HTMLTableElement>(
    ".ysws-dashboard__table",
  );
  if (!table) return;

  const handle = getOwnHandle();
  if (!handle) return;

  const sdColIdx = getColumnIndex(table, "Stardust");
  if (sdColIdx === -1) return;

  const rows = Array.from(table.querySelectorAll<HTMLElement>("tbody tr"));
  const ownRow = rows.find((row) => {
    const link = row.querySelector("a");
    return link?.textContent?.trim() === handle;
  });

  if (!ownRow) return;

  const cells = ownRow.querySelectorAll("td");
  const cell = cells[sdColIdx];
  const projected = parseFloat(cell?.textContent?.trim() ?? "");
  if (Number.isNaN(projected)) return;

  localStorage.setItem("exterstellar-better-goi-projected-sd", projected.toString());
}

function getActualWalletStardust(): number | null {
  const el = document.querySelector<HTMLElement>(
    ".sidebar__user-balance-amount",
  );
  const val = parseFloat(el?.textContent?.trim() ?? "");
  return Number.isNaN(val) ? null : val;
}

function getStardustAdjustmentTotal(): number {
  return parseFloat(localStorage.getItem(STARDUST_ADJUSTMENT_KEY) ?? "0");
}

function getPendingStardust(): number {
  const projected = parseFloat(
    localStorage.getItem("exterstellar-better-goi-projected-sd") ?? "",
  );
  const actual = getActualWalletStardust();
  if (Number.isNaN(projected) || actual === null) return 0;

  const adjustments = getStardustAdjustmentTotal();
  return Math.max(0, projected - actual + adjustments);
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
      localStorage.setItem("exterstellar-better-goi-sd-rate", currentRate.toString());
    }

    captureOwnProjectedStardust();
  } else if(window.location.pathname === "/shop"){
    const storedRate = parseFloat(localStorage.getItem("exterstellar-better-goi-sd-rate") ?? "");
    if (!storedRate || Number.isNaN(storedRate)) return;
    const itemsContainer =
      document.querySelector<HTMLElement>(".shop-goals__items");
    if (!itemsContainer) return;

    const pending = getPendingStardust();

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
  } else if(window.location.pathname === "/my/notifications") {
    captureStardustAdjustments();
  }
}