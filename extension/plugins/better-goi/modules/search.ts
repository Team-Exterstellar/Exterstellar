import type { Cfg } from "./types";

interface RowSearchData {
  reviewId: string;
  projectName: string;
  projectId: string;
  userName: string;
  userId: string;
  lengthHours: string;
}

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

  return { reviewId, projectName, projectId, userName, userId, lengthHours };
}

const originalRowOrder = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();

function captureOriginalOrder(table: HTMLTableElement, rows: HTMLTableRowElement[]) {
  if (!originalRowOrder.has(table)) {
    originalRowOrder.set(table, [...rows]);
  }
}

function restoreOriginalOrder(table: HTMLTableElement, tbody: HTMLTableSectionElement) {
  const original = originalRowOrder.get(table);
  if (!original) return;
  for (const row of original) {
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

type SearchField = "id" | "name" | "user" | "hours";

const FIELD_ALIASES: Record<string, SearchField> = {
  id: "id",
  review: "id",
  reviewid: "id",
  name: "name",
  project: "name",
  projectname: "name",
  user: "user",
  username: "user",
  hours: "hours",
  time: "hours",
  devtime: "hours",
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
      return row.reviewId.replace("#", "");
    case "name":
      return row.projectName;
    case "user":
      return row.userName;
    case "hours":
      return row.lengthHours;
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
    termMatches(row.lengthHours, term)
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
  ];
  for (const t of freeText) {
    let best = 0;
    for (const c of candidates) best = Math.max(best, termScore(c, t));
    score += best;
  }
  return score;
}

async function filterTable(query: string, cfg: Cfg) {
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
    restoreOriginalOrder(table, tbody);
    return;
  }

  const { filters, freeText } = parseSearchQuery(q);

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
}

function flashSearchNotApproved(verdict: string) {
  const search = document.getElementById(
    "exterstellar-better-goi-search-input",
  ) as HTMLInputElement | null;
  if (!search) return;

  const originalPlaceholder = search.placeholder;
  search.classList.add("exterstellar-better-goi-search--not-approved");
  search.placeholder = `Certification is "${verdict}", not approved yet — nothing to match`;

  window.setTimeout(() => {
    search.classList.remove("exterstellar-better-goi-search--not-approved");
    search.placeholder = originalPlaceholder;
  }, 5000);
}

function injectSearchBar(form: Element, cfg: Cfg) {
  if (form.previousElementSibling?.id === "exterstellar-better-goi-search")
    return;

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
    "Search, paste sw dash link, or use (name=)/(user=)/(id=)/(hours=) e.g. (name=lennytheblahaj)";
  search.addEventListener("input", () => filterTable(search.value, cfg));

  wrapper.appendChild(search);
  wrapper.appendChild(iconSpan);

  form.parentElement?.insertBefore(wrapper, form);
}

export function handleQueuePage(cfg: Cfg) {
  if (cfg.search == false || cfg.search === "false") return;
  const form = document.querySelector("form.ysws-queue__filters");
  if (form) injectSearchBar(form, cfg);

  const table = document.querySelector(
    ".ysws-queue__table-container table",
  ) as HTMLTableElement | null;
  if (table) {
    const rows = Array.from(
      table.querySelectorAll("tbody tr"),
    ) as HTMLTableRowElement[];
    captureOriginalOrder(table, rows);
  }

  const search = document.getElementById(
    "exterstellar-better-goi-search-input",
  ) as HTMLInputElement | null;
  if (search?.value) filterTable(search.value, cfg);
}