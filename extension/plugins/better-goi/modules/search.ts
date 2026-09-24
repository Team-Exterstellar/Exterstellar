import type { Cfg } from "./types";

interface RowSearchData {
  reviewId: string;
  projectName: string;
  projectId: string;
  userName: string;
  userId: string;
  lengthHours: string;
  email: string;
  slackId: string;
  repoUrl: string;
  demoUrl: string;
}

// Cache for async-fetched extra fields (repo/demo/email/slack) — not present in queue table DOM
const rowExtraCache = new WeakMap<HTMLTableRowElement, { email: string; slackId: string; repoUrl: string; demoUrl: string }>();
const rowExtraFetchPromise = new WeakMap<HTMLTableRowElement, Promise<void>>();

function getRowSearchData(row: HTMLTableRowElement): RowSearchData {
  const cells = Array.from(row.querySelectorAll("td"));
  const reviewId = cells[0]?.textContent?.trim().toLowerCase() ?? "";

  let projectName = "";
  let projectId = "";
  let userName = "";
  let userId = "";
  let lengthHours = "";

  for (const cell of cells) {
    const link = cell.querySelector("a") as HTMLAnchorElement | null;
    if (link?.href) {
      const projectMatch = link.href.match(/\/admin\/projects\/(\d+)/);
      if (projectMatch) {
        projectName = link.textContent?.trim().toLowerCase() ?? "";
        projectId = projectMatch[1] ?? "";
        continue;
      }
      const userMatch = link.href.match(/\/admin\/users\/(\d+)/);
      if (userMatch) {
        userName = link.textContent?.trim().toLowerCase() ?? "";
        userId = userMatch[1] ?? "";
        continue;
      }
    }
    const text = cell.textContent?.trim().toLowerCase() ?? "";
    if (/^\d+(\.\d+)?\s*(hrs?|h|m)\b/.test(text)) {
      lengthHours = text;
    }
  }

  const extra = rowExtraCache.get(row) ?? { email: "", slackId: "", repoUrl: "", demoUrl: "" };
  return {
    reviewId,
    projectName,
    projectId,
    userName,
    userId,
    lengthHours,
    email: extra.email.toLowerCase(),
    slackId: extra.slackId.toLowerCase(),
    repoUrl: extra.repoUrl.toLowerCase(),
    demoUrl: extra.demoUrl.toLowerCase(),
  };
}

async function fetchProjectExtra(projectId: string): Promise<{ repoUrl: string; demoUrl: string } | null> {
  try {
    const res = await fetch(`/admin/projects/${projectId}`, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    let repoUrl = "";
    let demoUrl = "";
    const dts = Array.from(doc.querySelectorAll("dt"));
    for (const dt of dts) {
      const key = dt.textContent?.trim().toLowerCase() ?? "";
      const dd = dt.nextElementSibling as HTMLElement | null;
      if (!dd) continue;
      if (key === "repo") repoUrl = dd.querySelector("a")?.href ?? dd.textContent?.trim() ?? "";
      if (key === "demo") demoUrl = dd.querySelector("a")?.href ?? dd.textContent?.trim() ?? "";
    }
    return { repoUrl, demoUrl };
  } catch {
    return null;
  }
}

async function fetchUserExtra(userId: string): Promise<{ email: string; slackId: string } | null> {
  try {
    const res = await fetch(`/admin/users/${userId}`, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    let email = "";
    let slackId = "";
    const dts = Array.from(doc.querySelectorAll("dt"));
    for (const dt of dts) {
      const key = dt.textContent?.trim().toLowerCase() ?? "";
      const dd = dt.nextElementSibling as HTMLElement | null;
      if (!dd) continue;
      if (key === "email") email = dd.textContent?.trim() ?? "";
      if (key === "slack_id" || key === "slack id" || key === "slack") {
        const raw = (dd.textContent ?? "").trim();
        const m = raw.match(/U[A-Z0-9]{7,}/);
        if (m) slackId = m[0] ?? "";
        else slackId = raw.split(/\s+/)[0] ?? "";
      }
    }
    // slack_id is also rendered as text like "U0XXXX" elsewhere if dt parsing missed
    if (!slackId) {
      const bodyText = doc.body.textContent ?? "";
      const m2 = bodyText.match(/U[A-Z0-9]{7,}/);
      if (m2) slackId = m2[0] ?? "";
    }
    return { email, slackId };
  } catch {
    return null;
  }
}

function ensureRowExtraData(row: HTMLTableRowElement): Promise<void> {
  if (rowExtraCache.has(row)) return Promise.resolve();
  const existing = rowExtraFetchPromise.get(row);
  if (existing) return existing;

  // Extract IDs synchronously without needing cache
  let projectId = "";
  let userId = "";
  for (const a of Array.from(row.querySelectorAll("a")) as HTMLAnchorElement[]) {
    const pm = a.href.match(/\/admin\/projects\/(\d+)/);
    if (pm) projectId = pm[1] ?? "";
    const um = a.href.match(/\/admin\/users\/(\d+)/);
    if (um) userId = um[1] ?? "";
  }

  const p = (async () => {
    const entry: { email: string; slackId: string; repoUrl: string; demoUrl: string } = { email: "", slackId: "", repoUrl: "", demoUrl: "" };
    const [proj, user] = await Promise.all([
      projectId ? fetchProjectExtra(projectId) : Promise.resolve(null),
      userId ? fetchUserExtra(userId) : Promise.resolve(null),
    ]);
    if (proj) {
      entry.repoUrl = proj.repoUrl ?? "";
      entry.demoUrl = proj.demoUrl ?? "";
    }
    if (user) {
      entry.email = user.email ?? "";
      entry.slackId = user.slackId ?? "";
    }
    rowExtraCache.set(row, entry);
    // also store normalized lower-case for quick lookup — getRowSearchData lowercases again but ok
    // stash raw urls in dataset for debugging if needed
    if (entry.repoUrl) row.dataset.repoUrl = entry.repoUrl;
    if (entry.demoUrl) row.dataset.demoUrl = entry.demoUrl;
    if (entry.email) row.dataset.email = entry.email;
    if (entry.slackId) row.dataset.slackId = entry.slackId;
  })();
  rowExtraFetchPromise.set(row, p);
  return p;
}

async function ensureExtraDataForRows(rows: HTMLTableRowElement[], needed: Set<string>): Promise<void> {
  if (needed.size === 0) return;
  // Only fetch if we actually need email/slack/repo/demo
  const needsProject = needed.has("repo") || needed.has("demo");
  const needsUser = needed.has("email") || needed.has("slack");
  // Also free-text searches that look like email/repo/slack should trigger fetch
  // Heuristic: if needed is empty but caller wants free-text enrichment, they pass explicit set.
  const toFetch = rows.filter(r => !rowExtraCache.has(r) && !rowExtraFetchPromise.has(r));
  // Quickly skip if no IDs? but we check per row in ensureRowExtraData
  if (toFetch.length === 0 && needsProject === false && needsUser === false) return;
  // Concurrency-limited fetch (3 at a time) to avoid hammering server
  const CONCURRENCY = 3;
  let idx = 0;
  async function worker() {
    while (idx < rows.length) {
      const i = idx++;
      const row = rows[i];
      if (!row) continue;
      // skip if already cached and we only need specific fields that are already present?
      // For simplicity, ensure full extra if not cached.
      if (!rowExtraCache.has(row)) {
        await ensureRowExtraData(row);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
}

const originalRowOrder = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
let filterSeq = 0;

function captureOriginalOrder(table: HTMLTableElement, rows: HTMLTableRowElement[]) {
  if (!originalRowOrder.has(table)) {
    originalRowOrder.set(table, [...rows]);
  }
}

function restoreOriginalOrder(table: HTMLTableElement, tbody: HTMLTableSectionElement) {
  const original = originalRowOrder.get(table);
  if (!original) return;
  for (const row of original) {
    // Don't resurrect rows that were intentionally removed (e.g. banned/hardware filters via row.remove()).
    // Search-hiding uses display:none (still attached), while filter removal detaches nodes.
    if (row.parentNode == null && !tbody.contains(row) && !document.body.contains(row)) {
      // Check if it's a banned/hardware row that was removed — skip re-inserting
      const isFilteredOut = row.getAttribute("data-label") !== null; // heuristic, but we just skip any detached
      // Only skip if it looks like it was filtered by other plugins; search-hidden rows stay attached
      continue;
    }
    row.style.display = "";
    delete row.dataset.swMatchScore;
    tbody.appendChild(row);
  }
}

function parseDevTimeToHours(raw: string): number {
  const trimmed = raw.trim();

  const hMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/i);
  const mMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*m/i);

  if (hMatch || mMatch) {
    const hours = hMatch ? parseFloat(hMatch[1] ?? "0") : 0;
    const minutes = mMatch ? parseFloat(mMatch[1] ?? "0") : 0;
    return hours + minutes / 60;
  }

  const plain = parseFloat(trimmed);
  return Number.isNaN(plain) ? 0 : plain;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j] ?? 0;
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prevDiag
          : 1 + Math.min(prevDiag, dp[j] ?? 0, dp[j - 1] ?? 0);
      prevDiag = temp;
    }
  }
  return dp[n] ?? Math.max(m, n);
}

function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return Math.max(0, 1 - dist / maxLen);
}

function closenessFromDiff(diffHours: number, halfLifeHours: number): number {
  if (!Number.isFinite(diffHours)) return 0;
  return Math.exp((-Math.LN2 * diffHours) / halfLifeHours);
}

interface SWMatchScore {
  row: HTMLTableRowElement;
  score: number;
}

const SW_MATCH_WEIGHTS = {
  devTime: 0.25,
  username: 0.2,
  projectName: 0.55,
};

function scoreRowAgainstSWCert(
  row: HTMLTableRowElement,
  cert: {
    devTimeHours: number;
    username: string;
    projectName: string;
  },
): SWMatchScore {
  const { userName, lengthHours, projectName } = getRowSearchData(row);

  const usernameSim = stringSimilarity(userName, cert.username);
  const projectSim = stringSimilarity(projectName, cert.projectName);

  const devTimeDiff = Math.abs(
    parseDevTimeToHours(lengthHours) - cert.devTimeHours,
  );
  const devTimeCloseness = closenessFromDiff(devTimeDiff, 0.5);

  const score =
    SW_MATCH_WEIGHTS.devTime * devTimeCloseness +
    SW_MATCH_WEIGHTS.username * usernameSim +
    SW_MATCH_WEIGHTS.projectName * projectSim;

  return { row, score };
}

interface ParsedSWCert {
  devTimeHours: number;
  verdict: string;
  username: string;
  slackId: string;
  projectName: string;
}

const VERDICTS = new Set(["approved", "rejected", "pending"]);

function parseSWCertData(data: any): ParsedSWCert {
  console.log("[Better GOI] raw cert API response:", data);

  const devTimeRaw =
    data.devTime ?? data.dev_time ?? data.hackatimeHours ?? data.codingTime ?? 0;
  const devTimeHours =
    typeof devTimeRaw === "number" ? devTimeRaw : parseDevTimeToHours(String(devTimeRaw));

  const verdictRaw = (data.verdict ?? data.status ?? "").toString().toLowerCase();
  const verdict = VERDICTS.has(verdictRaw) ? verdictRaw : "";

  const username = (data.submitterUsername ?? "").toString().toLowerCase();
  const slackId = (data.submitterSlackId ?? "").toString();

  return { devTimeHours, verdict, username, slackId, projectName: data.projectName ?? "" };
}

async function fetchSWCert(id: string, cfg: Cfg) {
  return await chrome.runtime.sendMessage({
    type: "FETCH_SW_CERT",
    id,
    swCookie: "session=" + cfg.swCookie,
  });
}

type SearchField = "id" | "name" | "user" | "hours" | "email" | "slack" | "repo" | "demo";

const FIELD_ALIASES: Record<string, SearchField> = {
  id: "id",
  review: "id",
  reviewid: "id",
  projectid: "id",
  project_id: "id",
  name: "name",
  project: "name",
  projectname: "name",
  title: "name",
  user: "user",
  username: "user",
  submitter: "user",
  submittername: "user",
  hours: "hours",
  time: "hours",
  devtime: "hours",
  length: "hours",
  hrs: "hours",
  email: "email",
  mail: "email",
  slack: "slack",
  slackid: "slack",
  slack_id: "slack",
  repo: "repo",
  repourl: "repo",
  repo_url: "repo",
  github: "repo",
  demo: "demo",
  demourl: "demo",
  demo_url: "demo",
};

interface FieldFilter {
  field: SearchField;
  value: string;
}

function findGroupClose(raw: string, openIndex: number): number {
  let inQuote: '"' | "'" | null = null;
  for (let i = openIndex + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch as '"' | "'";
      continue;
    }
    if (ch === ")") return i;
  }
  return -1;
}

function parseFieldTokens(inner: string): FieldFilter[] {
  const filters: FieldFilter[] = [];
  const keyRe = /(\w+)=/g;
  const starts: { key: string; valueStart: number; keyStart: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = keyRe.exec(inner)) !== null) {
    starts.push({ key: m[1]!, valueStart: keyRe.lastIndex, keyStart: m.index });
  }

  for (let idx = 0; idx < starts.length; idx++) {
    const { key, valueStart } = starts[idx]!;
    const end = idx + 1 < starts.length ? starts[idx + 1]!.keyStart : inner.length;
    let raw = inner.slice(valueStart, end).trim();

    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }

    const field = FIELD_ALIASES[key.toLowerCase()];
    const value = raw.trim().toLowerCase();
    if (field && value) filters.push({ field, value });
  }

  return filters;
}

function parseSearchQuery(raw: string): { filters: FieldFilter[]; freeText: string[] } {
  const filters: FieldFilter[] = [];
  let remainder = "";
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === "(") {
      const close = findGroupClose(raw, i);
      if (close === -1) break;
      const inner = raw.slice(i + 1, close);
      filters.push(...parseFieldTokens(inner));
      i = close + 1;
    } else {
      remainder += raw[i];
      i++;
    }
  }

  const freeText = remainder
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  return { filters, freeText };
}

const SEARCH_FUZZY_THRESHOLD = 0.55;

function fieldValue(row: RowSearchData, field: SearchField): string {
  switch (field) {
    case "id":
      return row.reviewId.replace("#", "") + " " + row.projectId;
    case "name":
      return row.projectName;
    case "user":
      return row.userName + " " + row.userId;
    case "hours":
      return row.lengthHours;
    case "email":
      return row.email;
    case "slack":
      return row.slackId;
    case "repo":
      return row.repoUrl;
    case "demo":
      return row.demoUrl;
  }
}

function termScore(target: string, term: string): number {
  if (!target) return 0;
  if (target === term) return 1;
  if (target.includes(term)) return 0.9;
  return stringSimilarity(target, term);
}

function termMatches(target: string, term: string): boolean {
  return termScore(target, term) >= SEARCH_FUZZY_THRESHOLD;
}

function matchesFilter(row: RowSearchData, filter: FieldFilter): boolean {
  return termMatches(fieldValue(row, filter.field), filter.value);
}

function matchesFreeText(row: RowSearchData, term: string): boolean {
  const idTerm = term.replace("#", "");
  return (
    termMatches(row.reviewId.replace("#", ""), idTerm) ||
    termMatches(row.projectName, term) ||
    termMatches(row.projectId, term) ||
    termMatches(row.userName, term) ||
    termMatches(row.userId, term) ||
    termMatches(row.lengthHours, term) ||
    termMatches(row.email, term) ||
    termMatches(row.slackId, term) ||
    termMatches(row.repoUrl, term) ||
    termMatches(row.demoUrl, term)
  );
}

function scoreRowMatch(
  data: RowSearchData,
  filters: FieldFilter[],
  freeText: string[],
): number {
  let score = 0;
  for (const f of filters) {
    score += termScore(fieldValue(data, f.field), f.value);
  }
  const candidates = [
    data.reviewId.replace("#", ""),
    data.projectName,
    data.projectId,
    data.userName,
    data.userId,
    data.lengthHours,
    data.email,
    data.slackId,
    data.repoUrl,
    data.demoUrl,
  ];
  for (const t of freeText) {
    let best = 0;
    for (const c of candidates) best = Math.max(best, termScore(c, t));
    score += best;
  }
  return score;
}

async function filterTable(query: string, cfg: Cfg) {
  const mySeq = ++filterSeq;
  const q = query.trim().toLowerCase();

  const swMatch = query
    .trim()
    .match(/ds\.shipwrights\.dev\/stardance\/certifications\/([0-9a-f-]{36})/i);

  const table = document.querySelector(
    ".ysws-queue__table-container table",
  ) as HTMLTableElement | null;
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  captureOriginalOrder(table, rows);

  if (swMatch && cfg.swCookie) {
    const res = await fetchSWCert(swMatch[1] ?? "", cfg);
    if (mySeq !== filterSeq) return;
    if (res?.ok && res?.data) {
      const cert = parseSWCertData(res.data);
      if (cert.verdict !== "approved") {
        flashSearchNotApproved(cert.verdict || "unknown");
        return;
      }

      const SW_MATCH_MIN_SCORE = 0.35;

      const ranked = rows
        .map((row) =>
          scoreRowAgainstSWCert(row, {
            devTimeHours: cert.devTimeHours,
            username: cert.username,
            projectName: cert.projectName,
          }),
        )
        .sort((a, b) => b.score - a.score);

      for (const { row, score } of ranked) {
        row.style.display = score >= SW_MATCH_MIN_SCORE ? "" : "none";
        row.dataset.swMatchScore = score.toFixed(3);
        tbody.appendChild(row);
      }
      ranked[0]?.row.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }

  if (!q) {
    if (mySeq !== filterSeq) return;
    restoreOriginalOrder(table, tbody);
    syncNativeClearButton();
    return;
  }

  const { filters, freeText } = parseSearchQuery(q);

  // Determine which extra fields will be needed for this query
  const neededFields = new Set<string>();
  for (const f of filters) {
    if (f.field === "email" || f.field === "slack" || f.field === "repo" || f.field === "demo") neededFields.add(f.field);
  }
  // Heuristic for free-text that looks like email/repo/slack
  for (const t of freeText) {
    if (t.includes("@") || t.includes(".com") || t.includes("github") || t.includes("http") || t.startsWith("u0") || /^u[A-Z0-9]{5,}/i.test(t)) {
      // Need all extra fields to allow generic repo/email/slack matching without explicit field prefix
      neededFields.add("email");
      neededFields.add("slack");
      neededFields.add("repo");
      neededFields.add("demo");
      break;
    }
  }
  // If we still have no extra needed but user used any field filter at all, we still want to enrich for completeness
  // so future free-text repo/email searches are fast — warm in background without blocking
  if (neededFields.size > 0) {
    await ensureExtraDataForRows(rows, neededFields);
    if (mySeq !== filterSeq) return;
  } else if (filters.length === 0 && freeText.length > 0) {
    // Background warm (don't await to keep filtering snappy); results will be available next keystroke
    void ensureExtraDataForRows(rows, new Set(["email", "slack", "repo", "demo"]));
  }

  const matched: { row: HTMLTableRowElement; score: number }[] = [];
  const unmatched: HTMLTableRowElement[] = [];

  for (const row of rows) {
    delete row.dataset.swMatchScore;
    const data = getRowSearchData(row);

    const isMatch =
      filters.every((f) => matchesFilter(data, f)) &&
      freeText.every((t) => matchesFreeText(data, t));

    if (isMatch) {
      matched.push({ row, score: scoreRowMatch(data, filters, freeText) });
    } else {
      unmatched.push(row);
    }
  }

  matched.sort((a, b) => b.score - a.score);

  for (const { row } of matched) {
    row.style.display = "";
    tbody.appendChild(row);
  }
  for (const row of unmatched) {
    row.style.display = "none";
    tbody.appendChild(row);
  }
  syncNativeClearButton();
}

function flashSearchNotApproved(verdict: string) {
  const el =
    (document.getElementById("exterstellar-better-goi-search-input") as HTMLInputElement | null) ??
    (document.getElementById("filter-search") as HTMLInputElement | null);
  if (!el) return;

  const originalPlaceholder = el.placeholder;
  el.classList.add("exterstellar-better-goi-search--not-approved");
  el.placeholder = `Certification is "${verdict}", not approved yet — nothing to match`;

  window.setTimeout(() => {
    el.classList.remove("exterstellar-better-goi-search--not-approved");
    el.placeholder = originalPlaceholder;
  }, 5000);
}

function syncNativeClearButton() {
  const input = document.getElementById("filter-search") as HTMLInputElement | null;
  const clearBtn = document.querySelector("[data-certification--ysws--queue-search-target=\"clear\"]") as HTMLButtonElement | null;
  if (input && clearBtn) {
    clearBtn.hidden = input.value.trim().length === 0;
  }
}

let nativeEnhancementActive = false;
let nativeInputHandler: ((e: Event) => void) | null = null;
let nativeKeydownHandler: ((e: Event) => void) | null = null;
let nativeClearHandler: ((e: Event) => void) | null = null;

function isEnhancedQuery(raw: string): boolean {
  if (/ds\.shipwrights\.dev\/stardance\/certifications\/[0-9a-f-]{36}/i.test(raw)) return true;
  const { filters } = parseSearchQuery(raw.toLowerCase());
  return filters.length > 0;
}

function enhanceNativeSearch(cfg: Cfg): boolean {
  const nativeInput = document.getElementById("filter-search") as HTMLInputElement | null;
  if (!nativeInput) return false;
  if (nativeEnhancementActive) return true;
  nativeEnhancementActive = true;

  // Update placeholder to advertise both native + bettergoi capabilities
  const nativePlaceholder = nativeInput.placeholder || "project, id, submitter, or repo url";
  nativeInput.placeholder =
    `${nativePlaceholder} — also (name=/user=/id=/hours=/email=/slack=/repo=/demo=), shipwrights link, fuzzy`;
  nativeInput.title =
    "Enhanced by Better GOI: fuzzy search, (field=value) filters e.g. (repo=github.com/foo) (email=@example.com) (slack=U123), or paste a ds.shipwrights.dev/stardance/certifications/<uuid> link";

  // Clicking clear should restore table — intercept native clear only when we were in enhanced mode
  const controllerEl = nativeInput.closest("[data-controller*=\"queue-search\"]") as HTMLElement | null;
  // Don't remove data-action globally; we handle selectively via capture
  const clearClickHandler = (e: Event) => {
    const t = e.target as HTMLElement | null;
    const btn = t?.closest?.("[data-certification--ysws--queue-search-target=\"clear\"]") as HTMLElement | null;
    if (!btn) return;
    if (controllerEl && !controllerEl.contains(btn)) return;
    const wasEnhanced = (nativeInput as any)._exterstellarWasEnhanced === true;
    if (!wasEnhanced && nativeInput.value.trim() === "") {
      // Was generic empty or not enhanced — let native handle its own clear/reload
      return;
    }
    // If we were in enhanced mode, or the table is currently client-filtered (some rows hidden), handle ourselves
    const table = document.querySelector(".ysws-queue__table-container table") as HTMLTableElement | null;
    const anyHidden = table ? Array.from(table.querySelectorAll("tbody tr")).some(r => (r as HTMLElement).style.display === "none") : false;
    if (!wasEnhanced && !anyHidden) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    nativeInput.value = "";
    (nativeInput as any)._exterstellarWasEnhanced = false;
    syncNativeClearButton();
    void filterTable("", cfg);
    nativeInput.focus();
  };
  nativeClearHandler = clearClickHandler;
  document.addEventListener("click", clearClickHandler, true);

  // Intercept native Stimulus `search` only for enhanced queries; generic queries go to server via turbo frame
  const handler = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (target !== nativeInput) return;
    const val = nativeInput.value;
    const enhanced = isEnhancedQuery(val);
    (nativeInput as any)._exterstellarWasEnhanced = enhanced;
    if (!enhanced) {
      // Let native server search handle generic queries (projectname, id, submitter, email/slack, repo/demo via ILIKE)
      // Ensure any previous client hide is cleared if user goes back to generic empty
      if (val.trim() === "") {
        // If table was client-filtered, restore before letting native reload (native will replace frame anyway)
        void filterTable("", cfg);
      }
      return;
    }
    e.stopImmediatePropagation();
    e.stopPropagation();
    void filterTable(val, cfg);
  };
  const keydownHandler = (e: Event) => {
    if ((e.target as HTMLElement | null) !== nativeInput) return;
    if ((e as KeyboardEvent).key === "Enter") {
      const val = nativeInput.value;
      const enhanced = isEnhancedQuery(val);
      if (!enhanced) return; // let native submit handle generic
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
      void filterTable(val, cfg);
    }
  };

  document.addEventListener("input", handler, true);
  document.addEventListener("keydown", keydownHandler, true);
  nativeInputHandler = handler;
  nativeKeydownHandler = keydownHandler;

  return true;
}

function injectSearchBar(form: Element, cfg: Cfg) {
  if (form.previousElementSibling?.id === "exterstellar-better-goi-search") return;

  const wrapper = document.createElement("div");
  wrapper.id = "exterstellar-better-goi-search";
  wrapper.classList.add("exterstellar-better-goi-search-wrapper");

  const iconSpan = document.createElement("span");
  iconSpan.classList.add("exterstellar-better-goi-search-icon");
  iconSpan.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search-icon lucide-search">
      <path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>
    </svg>
  `;

  const search = document.createElement("input");
  search.id = "exterstellar-better-goi-search-input";
  search.classList.add("exterstellar-better-goi-search");
  search.placeholder =
    "Do a generic search, paste StinkWright dash link, or use (name=)/(user=)/(id=)/(email=)/(slack=)/(repo=)/(demo=)/(hours=) e.g. (name=lennytheblahaj)";
  search.addEventListener("input", () => filterTable(search.value, cfg));

  wrapper.appendChild(search);
  wrapper.appendChild(iconSpan);

  form.parentElement?.insertBefore(wrapper, form);
}

export function handleQueuePage(cfg: Cfg) {
  if (cfg.search == false || cfg.search === "false") return;

  // Prefer enhancing the native #filter-search if present (new dash). Fall back to legacy injected bar.
  const nativeEnhanced = enhanceNativeSearch(cfg);
  if (!nativeEnhanced) {
    const form = document.querySelector("form.ysws-queue__filters");
    if (form) injectSearchBar(form, cfg);
  }

  const table = document.querySelector(
    ".ysws-queue__table-container table",
  ) as HTMLTableElement | null;
  if (table) {
    const rows = Array.from(
      table.querySelectorAll("tbody tr"),
    ) as HTMLTableRowElement[];
    captureOriginalOrder(table, rows);
  }

  // Re-apply filter after turbo frame reloads (e.g. type filter changed, pagination, etc.)
  const frame = document.getElementById("ysws_queue_results") as HTMLElement | null;
  if (frame && !(frame as any)._exterstellarQueueFrameHooked) {
    (frame as any)._exterstellarQueueFrameHooked = true;
    frame.addEventListener("turbo:frame-load", () => {
      const t = document.querySelector(".ysws-queue__table-container table") as HTMLTableElement | null;
      if (t) {
        const rs = Array.from(t.querySelectorAll("tbody tr")) as HTMLTableRowElement[];
        captureOriginalOrder(t, rs);
      }
      const activeInput =
        (document.getElementById("filter-search") as HTMLInputElement | null)?.value ??
        (document.getElementById("exterstellar-better-goi-search-input") as HTMLInputElement | null)?.value ??
        "";
      if (activeInput && isEnhancedQuery(activeInput)) void filterTable(activeInput, cfg);
      syncNativeClearButton();
    });
  }

  const legacySearch = document.getElementById(
    "exterstellar-better-goi-search-input",
  ) as HTMLInputElement | null;
  if (legacySearch?.value) void filterTable(legacySearch.value, cfg);
  const nativeSearch = document.getElementById("filter-search") as HTMLInputElement | null;
  if (nativeSearch?.value && isEnhancedQuery(nativeSearch.value)) void filterTable(nativeSearch.value, cfg);
}

export function teardownQueueSearch(): void {
  if (nativeInputHandler) {
    document.removeEventListener("input", nativeInputHandler, true);
    nativeInputHandler = null;
  }
  if (nativeKeydownHandler) {
    document.removeEventListener("keydown", nativeKeydownHandler, true);
    nativeKeydownHandler = null;
  }
  if (nativeClearHandler) {
    document.removeEventListener("click", nativeClearHandler, true);
    nativeClearHandler = null;
  }
  nativeEnhancementActive = false;
}
