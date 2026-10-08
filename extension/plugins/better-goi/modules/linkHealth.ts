import type { Cfg } from "./types";
import { decrementSummaryCount, incrementSummaryCount } from "./summaryCount";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

function getActionLink(row: HTMLTableRowElement): HTMLAnchorElement | null {
  const actionsCell = row.querySelector<HTMLTableCellElement>(
    'td[data-label="Actions"]',
  );
  return (
    actionsCell?.querySelector<HTMLAnchorElement>("a.ysws-queue__view-btn") ??
    null
  );
}

function getProjectLink(row: HTMLTableRowElement): HTMLAnchorElement | null {
  const projectCell = row.querySelector<HTMLTableCellElement>(
    'td[data-label="Project"]',
  );
  return projectCell?.querySelector<HTMLAnchorElement>("a") ?? null;
}

function flagRowBroken(row: HTMLTableRowElement): void {
  if (row.hasAttribute("data-exterstellar-count-subtracted")) return;
  row.setAttribute("data-exterstellar-count-subtracted", "1");
  decrementSummaryCount(1);
}

function unflagRowBroken(row: HTMLTableRowElement): void {
  if (!row.hasAttribute("data-exterstellar-count-subtracted")) return;
  row.removeAttribute("data-exterstellar-count-subtracted");
  incrementSummaryCount(1);
}

export async function probeLinkStatus(
  url: string,
): Promise<{ status: number; statusText: string } | null> {
  try {
    await waitForRequestSlot();
    const res = await fetch(url, {
      method: "HEAD",
      credentials: "same-origin",
      redirect: "follow",
    });

    if (res.status === 429) {
      registerRateLimited(res);
      return { status: 429, statusText: res.statusText || "Too Many Requests" };
    }
    registerRequestOk();
    if (res.status === 404 || res.status === 405) {
      await waitForRequestSlot();
      const getRes = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        redirect: "follow",
      });

      if (getRes.status === 429) {
        registerRateLimited(getRes);
        return {
          status: 429,
          statusText: getRes.statusText || "Too Many Requests",
        };
      }
      registerRequestOk();

      return { status: getRes.status, statusText: getRes.statusText };
    }

    return { status: res.status, statusText: res.statusText };
  } catch (e) {
    return null;
  }
}

export function formatStatusTooltip(status: number, statusText: string): string {
  const label = statusText || HTTP_STATUS_TEXT[status] || "Error";
  return `${status} ${label}`;
}

let nextRequestSlot = 0;
let rateLimitedUntil = 0;
let currentBackoffMs = 5000;

async function waitForRequestSlot(): Promise<void> {
  const activeCooldown = rateLimitedUntil - Date.now();
  if (activeCooldown > 0) await sleep(activeCooldown);

  const slot = Math.max(nextRequestSlot, Date.now());
  nextRequestSlot = slot + 400;

  const wait = slot - Date.now();
  if (wait > 0) await sleep(wait);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return null;
}

function registerRateLimited(res: Response): void {
  const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
  const backoffMs = retryAfterMs ?? currentBackoffMs;

  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + backoffMs);
  currentBackoffMs = Math.min(currentBackoffMs * 2, 60000);

  scheduleRateLimitRetry(rateLimitedUntil - Date.now() + 50);
}

function registerRequestOk(): void {
  currentBackoffMs = 5000;
}

let lastLinkHealthCheckCfg: Cfg | null = null;
let rateLimitRetryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRateLimitRetry(delayMs: number): void {
  if (rateLimitRetryTimer !== null) return;
  rateLimitRetryTimer = setTimeout(() => {
    rateLimitRetryTimer = null;
    if (lastLinkHealthCheckCfg) handleLinkHealthCheck(lastLinkHealthCheckCfg);
  }, delayMs);
}

let brokenLinkClickHandlerAttached = false;
function handleBrokenLinkClick(e: MouseEvent) {
  const target = (e.target as HTMLElement)?.closest?.<HTMLAnchorElement>(
    `a.${"exterstellar-better-goi-broken-link"}`,
  );
  if (target) {
    e.preventDefault();
    e.stopPropagation();
  }
}
function ensureBrokenLinkClickHandler() {
  if (brokenLinkClickHandlerAttached) return;
  brokenLinkClickHandlerAttached = true;
  document.addEventListener("click", handleBrokenLinkClick, true);
}

function disableBrokenLink(
  link: HTMLAnchorElement,
  status: number,
  statusText: string,
) {
  ensureBrokenLinkClickHandler();
  if (link.classList.contains("exterstellar-better-goi-broken-link")) return;
  link.classList.add("exterstellar-better-goi-broken-link");
  link.setAttribute("role", "button");
  link.title = formatStatusTooltip(status, statusText);
  if (link.dataset.originalText === undefined) {
    link.dataset.originalText = link.textContent ?? "";
  }
  link.textContent = "Error";
}

function restoreBrokenLink(link: HTMLAnchorElement) {
  if (!link.classList.contains("exterstellar-better-goi-broken-link")) return;

  link.classList.remove("exterstellar-better-goi-broken-link");
  link.removeAttribute("aria-disabled");
  link.removeAttribute("role");
  link.removeAttribute("title");
  if (link.dataset.originalText !== undefined) {
    link.textContent = link.dataset.originalText;
    delete link.dataset.originalText;
  }
  if (link.dataset.originalHref) {
    link.href = link.dataset.originalHref;
    delete link.dataset.originalHref;
  }
}

const LINK_HEALTH_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function extractProjectId(url: string): string | null {
  const match = url.match(/\/projects\/(\d+)/);
  return match?.[1] ?? null;
}

export function stripAdminPrefix(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/admin/")) {
      parsed.pathname = parsed.pathname.replace(/^\/admin/, "");
      return parsed.toString();
    }
    return url;
  } catch {
    return url.replace("/admin/", "/");
  }
}

interface LinkHealthCacheEntry {
  status: number;
  statusText: string;
  checkedAt: number;
}

function loadLinkHealthCache(): Record<string, LinkHealthCacheEntry> {
  try {
    const raw = localStorage.getItem("exterstellar-better-goi-linkhealth-cache");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLinkHealthCache(cache: Record<string, LinkHealthCacheEntry>) {
  try {
    localStorage.setItem("exterstellar-better-goi-linkhealth-cache", JSON.stringify(cache));
  } catch (e) {}
}

function getCachedLinkHealth(key: string): LinkHealthCacheEntry | null {
  const entry = loadLinkHealthCache()[key];
  if (!entry) return null;
  if (Date.now() - entry.checkedAt > LINK_HEALTH_CACHE_TTL_MS) return null;
  return entry;
}

function setCachedLinkHealth(
  key: string,
  status: number,
  statusText: string,
) {
  const cache = loadLinkHealthCache();
  cache[key] = { status, statusText, checkedAt: Date.now() };
  saveLinkHealthCache(cache);
}

function pruneLinkHealthCache(currentKeys: Set<string>) {
  const cache = loadLinkHealthCache();
  const now = Date.now();
  let changed = false;

  for (const key of Object.keys(cache)) {
    const entry = cache[key]!;
    const expired = now - entry.checkedAt > LINK_HEALTH_CACHE_TTL_MS;
    const gone = !currentKeys.has(key);
    if (expired || (currentKeys.size > 0 && gone)) {
      delete cache[key];
      changed = true;
    }
  }

  if (changed) saveLinkHealthCache(cache);
}



async function checkRowLinkHealth(row: HTMLTableRowElement) {
  if (row.hasAttribute("data-exterstellar-link-health-checked")) return;
  row.setAttribute("data-exterstellar-link-health-checked", "1");

  const projectLink = getProjectLink(row);
  if (!projectLink?.href) return;
  const actionLink = getActionLink(row);
  if (!actionLink) return;

  const checkUrl = stripAdminPrefix(projectLink.href);
  const cacheKey = extractProjectId(checkUrl) ?? extractProjectId(projectLink.href) ?? checkUrl;

  const cached = getCachedLinkHealth(cacheKey);
  if (cached) {
    if (cached.status >= 400) {
      disableBrokenLink(actionLink, cached.status, cached.statusText);
      flagRowBroken(row);
    }
    return;
  }

  const result = await probeLinkStatus(checkUrl);

  if (result?.status === 429) {
    row.removeAttribute("data-exterstellar-link-health-checked");
    return;
  }

  if (!result) return;

  setCachedLinkHealth(cacheKey, result.status, result.statusText);

  if (result.status >= 400) {
    disableBrokenLink(actionLink, result.status, result.statusText);
    flagRowBroken(row);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    await worker(items[i]!);
    return next();
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, next),
  );
}

let lastLinkHealthCheckKey: string | null = null;
function getFilterSortKey(): string {
  return window.location.pathname + window.location.search;
}

function resetLinkHealthChecks(table: Element) {
  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  for (const row of rows) {
    row.removeAttribute("data-exterstellar-link-health-checked");
    const link = getActionLink(row);
    if (link) restoreBrokenLink(link);
    unflagRowBroken(row);
  }
}

export function handleLinkHealthCheck(cfg: Cfg) {
  if (cfg.linkHealthCheck === false || cfg.linkHealthCheck === "false") {
    if (rateLimitRetryTimer !== null) {
      clearTimeout(rateLimitRetryTimer);
      rateLimitRetryTimer = null;
    }
    lastLinkHealthCheckCfg = null;
    return;
  }

  const table = document.querySelector(".ysws-queue__table-container table");
  if (!table) return;

  lastLinkHealthCheckCfg = cfg;

  const currentKey = getFilterSortKey();
  if (currentKey !== lastLinkHealthCheckKey) {
    lastLinkHealthCheckKey = currentKey;
    resetLinkHealthChecks(table);
  }

  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  const allProjectLinks = new Set(
    rows
      .map((row) => {
        const link = getProjectLink(row);
        if (!link?.href) return null;
        const checkUrl = stripAdminPrefix(link.href);
        return extractProjectId(checkUrl) ?? extractProjectId(link.href) ?? checkUrl;
      })
      .filter((href): href is string => !!href),
  );
  pruneLinkHealthCache(allProjectLinks);

  const firstN = rows.slice(0, 30);

  const pending = firstN.filter(
    (row) => !row.hasAttribute("data-exterstellar-link-health-checked"),
  );
  if (!pending.length) return;
  void runWithConcurrency(pending, 2, checkRowLinkHealth);
}