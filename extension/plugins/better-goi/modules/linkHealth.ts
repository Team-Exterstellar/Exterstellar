import type { Cfg } from "./types";

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
  link.textContent = "Error"
}

function restoreBrokenLink(link: HTMLAnchorElement) {
  if (!link.classList.contains("exterstellar-better-goi-broken-link")) return;

  link.classList.remove("exterstellar-better-goi-broken-link");
  link.removeAttribute("aria-disabled");
  link.removeAttribute("role");
  link.removeAttribute("title");
  if (link.dataset.originalHref) {
    link.href = link.dataset.originalHref;
    delete link.dataset.originalHref;
  }
}

function extractReviewId(url: string): string | null {
  const match = url.match(/\/admin\/certification\/review\/(\d+)/);
  return match?.[1] ?? null;
}

function getCsrfToken(): string | null {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"]',
  );
  return meta?.content ?? null;
}

async function releaseReviewClaim(reviewId: string): Promise<boolean> {
  const csrfToken = getCsrfToken();
  const body = new URLSearchParams();
  body.set("_method", "delete");
  if (csrfToken) body.set("authenticity_token", csrfToken);

  try {
    await waitForRequestSlot();
    const res = await fetch(`/admin/certification/review/${reviewId}/claim`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: body.toString(),
    });

    if (res.status === 429) {
      registerRateLimited(res);
      return false;
    }
    registerRequestOk();

    if (res.ok) return true;
    if (res.status === 404 || res.status === 410) return true;
    return false;
  } catch (e) {
    return false;
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
  if (Date.now() - entry.checkedAt > 24 * 60 * 60 * 1000) return null;
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

function pruneLinkHealthCache(currentReviewIds: Set<string>) {
  const cache = loadLinkHealthCache();
  const now = Date.now();
  let changed = false;

  for (const key of Object.keys(cache)) {
    const entry = cache[key]!;
    const expired = now - entry.checkedAt > 24 * 60 * 60 * 1000;
    const gone = !currentReviewIds.has(key);
    if (expired || (currentReviewIds.size > 0 && gone && looksLikeReviewId(key))) {
      delete cache[key];
      changed = true;
    }
  }

  if (changed) saveLinkHealthCache(cache);
}

function looksLikeReviewId(key: string): boolean {
  return /^\d+$/.test(key);
}

const PENDING_CLAIMS_KEY = "exterstellar-better-goi-pending-claims";
const PENDING_CLAIM_MAX_AGE_MS = 48 * 60 * 60 * 1000; 

interface PendingClaimEntry {
  claimedAt: number;
}

function loadPendingClaims(): Record<string, PendingClaimEntry> {
  try {
    const raw = localStorage.getItem(PENDING_CLAIMS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePendingClaims(claims: Record<string, PendingClaimEntry>) {
  try {
    localStorage.setItem(PENDING_CLAIMS_KEY, JSON.stringify(claims));
  } catch (e) {}
}

function markPendingClaim(reviewId: string) {
  const claims = loadPendingClaims();
  if (claims[reviewId]) return;
  claims[reviewId] = { claimedAt: Date.now() };
  savePendingClaims(claims);
}

function clearPendingClaim(reviewId: string) {
  const claims = loadPendingClaims();
  if (!claims[reviewId]) return;
  delete claims[reviewId];
  savePendingClaims(claims);
}

let pendingClaimsSweepInFlight = false;

export async function sweepPendingClaims(): Promise<void> {
  if (pendingClaimsSweepInFlight) return;

  const claims = loadPendingClaims();
  const reviewIds = Object.keys(claims);
  if (!reviewIds.length) return;

  pendingClaimsSweepInFlight = true;
  try {
    const now = Date.now();
    const toRelease: string[] = [];

    for (const reviewId of reviewIds) {
      const entry = claims[reviewId]!;
      if (now - entry.claimedAt > PENDING_CLAIM_MAX_AGE_MS) {
        clearPendingClaim(reviewId);
        continue;
      }
      toRelease.push(reviewId);
    }

    if (!toRelease.length) return;

    await runWithConcurrency(toRelease, 2, async (reviewId) => {
      const handled = await releaseReviewClaim(reviewId);
      if (handled) clearPendingClaim(reviewId);
    });
  } finally {
    pendingClaimsSweepInFlight = false;
  }
}

async function checkRowLinkHealth(row: HTMLTableRowElement) {
  if (row.hasAttribute("data-exterstellar-link-health-checked")) return;
  row.setAttribute("data-exterstellar-link-health-checked", "1");

  const link = getActionLink(row);
  if (!link?.href) return;

  const reviewId = extractReviewId(link.href);
  const cacheKey = reviewId ?? link.href;

  const cached = getCachedLinkHealth(cacheKey);
  if (cached) {
    if (cached.status >= 400) disableBrokenLink(link, cached.status, cached.statusText);
    return;
  }

  if (reviewId) markPendingClaim(reviewId);

  const result = await probeLinkStatus(link.href);

  if (result?.status === 429) {
    row.removeAttribute("data-exterstellar-link-health-checked");
    return;
  }

  if (reviewId) {
    const released = await releaseReviewClaim(reviewId);
    if (released) clearPendingClaim(reviewId);
  }

  if (!result) return;

  setCachedLinkHealth(cacheKey, result.status, result.statusText);

  if (result.status >= 400) {
    disableBrokenLink(link, result.status, result.statusText);
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
  }
}

export function handleLinkHealthCheck(cfg: Cfg) {
  void sweepPendingClaims();

  if (cfg.linkHealthCheck === false || cfg.linkHealthCheck === "false") return;

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

  const allReviewIds = new Set(
    rows
      .map((row) => {
        const link = getActionLink(row);
        return link?.href ? extractReviewId(link.href) : null;
      })
      .filter((id): id is string => !!id),
  );
  pruneLinkHealthCache(allReviewIds);

  const firstN = rows.slice(0, 30);

  const pending = firstN.filter(
    (row) => !row.hasAttribute("data-exterstellar-link-health-checked"),
  );
  if (!pending.length) return;
  void runWithConcurrency(pending, 2, checkRowLinkHealth);
}