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

function getReviewIdFromRow(row: HTMLTableRowElement): string | null {
  const actionHref = getActionLink(row)?.getAttribute("href") ?? "";
  const fromAction = actionHref.match(/\/certification\/review\/(\d+)/)?.[1];
  if (fromAction) return fromAction;

  const idCell = row.querySelector<HTMLTableCellElement>('td[data-label="ID"]');
  return idCell?.textContent?.trim().match(/#?(\d+)/)?.[1] ?? null;
}

function isRowMarkedBroken(row: HTMLTableRowElement): boolean {
  if (row.hasAttribute("data-exterstellar-count-subtracted")) return true;
  return !!getActionLink(row)?.classList.contains(
    "exterstellar-better-goi-broken-link",
  );
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

export function isLinkHealthEnabled(cfg: Cfg): boolean {
  return cfg.linkHealthCheck !== false && cfg.linkHealthCheck !== "false";
}

export function shouldSkipBrokenInFlow(cfg: Cfg): boolean {
  if (!isLinkHealthEnabled(cfg)) return false;
  return (
    cfg.linkHealthFlowSkip !== false && cfg.linkHealthFlowSkip !== "false"
  );
}

export function handleLinkHealthCheck(cfg: Cfg) {
  if (!isLinkHealthEnabled(cfg)) {
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

const FLOW_PRECHECK_ROW_LIMIT = 30;
const FLOW_PRECHECK_WAIT_MS = 6000;
const AUTO_SKIP_LOG_KEY = "exterstellar-better-goi-flow-auto-skips";
const AUTO_SKIP_WINDOW_MS = 10 * 60 * 1000;
const AUTO_SKIP_LIMIT = 20;

let flowStartForm: HTMLFormElement | null = null;
let flowStartAbort: AbortController | null = null;
let flowStartCfg: Cfg | null = null;

function getQueueRows(): HTMLTableRowElement[] {
  const table = document.querySelector(".ysws-queue__table-container table");
  if (!table) return [];
  return Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];
}

function setFormSkipIds(form: HTMLFormElement, ids: string[]) {
  if (!ids.length) return;

  const existing = form.querySelector<HTMLInputElement>('input[name="skip"]');
  const merged = Array.from(
    new Set([...(existing?.value ?? "").split(",").filter(Boolean), ...ids]),
  ).slice(-100);

  if (existing) {
    existing.value = merged.join(",");
    return;
  }

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "skip";
  input.value = merged.join(",");
  form.appendChild(input);
}

export function teardownFlowStartLinkCheck(): void {
  flowStartAbort?.abort();
  flowStartAbort = null;
  flowStartForm = null;
  flowStartCfg = null;
}

export function handleFlowStartLinkCheck(cfg: Cfg) {
  flowStartCfg = cfg;

  if (!shouldSkipBrokenInFlow(cfg)) {
    teardownFlowStartLinkCheck();
    return;
  }

  const form = document.querySelector<HTMLFormElement>(
    "form.ysws-queue__flow-form",
  );
  if (!form) return;
  if (flowStartForm === form && flowStartAbort) return;

  teardownFlowStartLinkCheck();
  flowStartCfg = cfg;

  const controller = new AbortController();
  flowStartForm = form;
  flowStartAbort = controller;

  form.addEventListener(
    "submit",
    (event) => {
      const activeCfg = flowStartCfg;
      if (!activeCfg || !shouldSkipBrokenInFlow(activeCfg)) return;
      if (form.dataset.exterstellarFlowSubmitting === "1") return;
      form.dataset.exterstellarFlowSubmitting = "1";

      event.preventDefault();

      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      const originalText = button?.textContent ?? "";
      if (button) {
        button.disabled = true;
        button.textContent = "Checking links…";
      }

      void (async () => {
        try {
          const rows = getQueueRows().slice(0, FLOW_PRECHECK_ROW_LIMIT);
          const pending = rows.filter(
            (row) =>
              !row.hasAttribute("data-exterstellar-link-health-checked"),
          );

          if (pending.length) {
            await Promise.race([
              runWithConcurrency(pending, 2, checkRowLinkHealth),
              sleep(FLOW_PRECHECK_WAIT_MS),
            ]);
          }

          const brokenIds = rows
            .filter(isRowMarkedBroken)
            .map(getReviewIdFromRow)
            .filter((id): id is string => !!id);

          setFormSkipIds(form, brokenIds);
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = originalText;
          }
          form.submit();
        }
      })();
    },
    { signal: controller.signal },
  );
}

function isReviewFlowErrorPage(): boolean {
  const code = document.querySelector(".error-page__code")?.textContent?.trim();
  if (code === "500") return true;

  const title = document.title.toLowerCase();
  if (title.includes("something went wrong")) return true;
  if (title.includes("exception caught")) return true;
  return /\bin\s+\w+controller#/.test(title);
}

function getCurrentReviewId(): string | null {
  return (
    window.location.pathname.match(
      /^\/admin\/certification\/review\/(\d+)\/?$/,
    )?.[1] ?? null
  );
}

function noteAutoSkip(reviewId: string): boolean {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(AUTO_SKIP_LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const recent: Array<{ id: string; at: number }> = Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is { id: string; at: number } =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { at?: unknown }).at === "number" &&
            now - (entry as { at: number }).at < AUTO_SKIP_WINDOW_MS,
        )
      : [];

    if (recent.some((entry) => entry.id === reviewId)) return false;
    if (recent.length >= AUTO_SKIP_LIMIT) return false;

    recent.push({ id: reviewId, at: now });
    sessionStorage.setItem(AUTO_SKIP_LOG_KEY, JSON.stringify(recent));
    return true;
  } catch {
    return true;
  }
}

function showFlowNotice(message: string) {
  if (document.getElementById("exterstellar-better-goi-flow-skip-notice")) {
    return;
  }

  const notice = document.createElement("div");
  notice.id = "exterstellar-better-goi-flow-skip-notice";
  notice.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:20px",
    "z-index:2147483647",
    "max-width:320px",
    "padding:12px 14px",
    "border:1px solid #a3a3a3",
    "border-radius:10px",
    "background:#18181b",
    "color:#f4f4f5",
    "font:13px/1.45 system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.35)",
  ].join(";");
  notice.textContent = message;
  document.body.appendChild(notice);
}

function appendHidden(form: HTMLFormElement, name: string, value: string) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

async function unclaimReview(reviewId: string, token: string): Promise<void> {
  try {
    await fetch(`/admin/certification/review/${reviewId}/claim`, {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      keepalive: true,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        _method: "delete",
        authenticity_token: token,
      }).toString(),
    });
  } catch {}
}

export function handleFlowErrorRecovery(cfg: Cfg) {
  if (!shouldSkipBrokenInFlow(cfg)) return;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => handleFlowErrorRecovery(cfg),
      { once: true },
    );
    return;
  }

  if (
    document.documentElement.hasAttribute(
      "data-exterstellar-flow-error-handled",
    )
  ) {
    return;
  }
  if (!isReviewFlowErrorPage()) return;
  if (new URLSearchParams(window.location.search).get("flow") !== "1") return;

  const reviewId = getCurrentReviewId();
  if (!reviewId) return;

  if (!noteAutoSkip(reviewId)) {
    document.documentElement.setAttribute(
      "data-exterstellar-flow-error-handled",
      "1",
    );
    showFlowNotice(
      `Review #${reviewId} keeps failing to load. Auto-skip stopped to avoid a loop.`,
    );
    return;
  }

  const token = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"]',
  )?.content;
  if (!token) return;

  document.documentElement.setAttribute(
    "data-exterstellar-flow-error-handled",
    "1",
  );
  showFlowNotice(
    `Review #${reviewId} failed to load. Unclaiming and skipping to the next review…`,
  );

  const params = new URLSearchParams(window.location.search);
  const form = document.createElement("form");
  form.method = "post";
  form.action = `/admin/certification/review/${reviewId}/skip`;
  form.style.display = "none";
  appendHidden(form, "authenticity_token", token);
  appendHidden(form, "flow", "1");
  appendHidden(form, "step", params.get("step") ?? "1");
  const skip = params.get("skip");
  if (skip) appendHidden(form, "skip", skip);
  document.body.appendChild(form);

  window.setTimeout(() => {
    void (async () => {
      await Promise.race([unclaimReview(reviewId, token), sleep(2500)]);
      form.submit();
    })();
  }, 500);
}
