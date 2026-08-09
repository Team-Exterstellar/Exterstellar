import type { Cfg } from "./types";

interface RowSearchData {
  reviewId: string;
  projectName: string;
  projectId: string;
  userName: string;
  userId: string;
  lengthHours: string;
  age: string;
}

function getRowSearchData(row: HTMLTableRowElement): RowSearchData {
  const cells = row.querySelectorAll("td");
  const reviewId = cells[0]?.textContent?.trim().toLowerCase() ?? "";

  const projectCell = cells[2];
  const projectLink = projectCell?.querySelector(
    "a",
  ) as HTMLAnchorElement | null;
  const projectName = projectLink?.textContent?.trim().toLowerCase() ?? "";
  let projectId = "";
  if (projectLink?.href) {
    const match = projectLink.href.match(/\/admin\/projects\/(\d+)/);
    projectId = match?.[1] ?? "";
  }

  const lengthHours = cells[4]?.textContent?.trim().toLowerCase() ?? "";
  const userCell = cells[3];
  const age =
    (
      cells[6]?.querySelector("span") as HTMLSpanElement | null
    )?.textContent?.trim() ?? "";
  const userLink = userCell?.querySelector("a") as HTMLAnchorElement | null;
  const userName = userLink?.textContent?.trim().toLowerCase() ?? "";
  let userId = "";
  if (userLink?.href) {
    const match = userLink.href.match(/\/admin\/users\/(\d+)/);
    userId = match?.[1] ?? "";
  }

  return {
    reviewId,
    projectName,
    projectId,
    userName,
    userId,
    lengthHours,
    age,
  };
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

function parseRelativeAgeToHours(raw: string): number {
  const s = raw.trim().toLowerCase();
  if (!s) return NaN;
  if (s.includes("just now") || s === "now") return 0;

  const match = s.match(
    /(a|an|\d+(?:\.\d+)?)\s*(second|minute|hour|day|week|month|year)s?/,
  );
  if (!match) return NaN;

  const rawNum = match[1] ?? "1";
  const num = rawNum === "a" || rawNum === "an" ? 1 : parseFloat(rawNum);
  const unit = match[2] ?? "";

  const unitToHours: Record<string, number> = {
    second: 1 / 3600,
    minute: 1 / 60,
    hour: 1,
    day: 24,
    week: 24 * 7,
    month: 24 * 30,
    year: 24 * 365,
  };

  const hoursPerUnit = unitToHours[unit];
  return hoursPerUnit === undefined ? NaN : num * hoursPerUnit;
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
  projectName: 0.4,
  devTime: 0.25,
  age: 0.15,
  username: 0.2,
};

function scoreRowAgainstSWProject(
  row: HTMLTableRowElement,
  sw: {
    projectName: string;
    devTimeHours: number;
    ageHours: number;
    username: string;
  },
): SWMatchScore {
  const { projectName, userName, lengthHours, age } = getRowSearchData(row);

  const projectSim = stringSimilarity(projectName, sw.projectName);
  const usernameSim = stringSimilarity(userName, sw.username);

  const devTimeDiff = Math.abs(
    parseDevTimeToHours(lengthHours) - sw.devTimeHours,
  );
  const devTimeCloseness = closenessFromDiff(devTimeDiff, 0.5);

  const rowAgeHours = parseRelativeAgeToHours(age);
  const ageDiff = Math.abs(rowAgeHours - sw.ageHours);
  const ageCloseness = closenessFromDiff(ageDiff, 20);

  const score =
    SW_MATCH_WEIGHTS.projectName * projectSim +
    SW_MATCH_WEIGHTS.devTime * devTimeCloseness +
    SW_MATCH_WEIGHTS.age * ageCloseness +
    SW_MATCH_WEIGHTS.username * usernameSim;

  return { row, score };
}

async function handleSWDashLinks(id: string, cfg: Cfg) {
  return await chrome.runtime.sendMessage({
    type: "FETCH_SW_CERT",
    id,
    swCookie: "session=" + cfg.swCookie,
  });
}

async function filterTable(query: string, cfg: Cfg) {
  const q = query.trim().toLowerCase();

  const swMatch = query
    .trim()
    .match(/ds\.shipwrights\.dev\/stardance\/certifications\/([0-9a-f-]{36})/i);

  const table = document.querySelector(".ysws-queue__table-container table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  const rows = Array.from(
    table.querySelectorAll("tbody tr"),
  ) as HTMLTableRowElement[];

  if (swMatch && cfg.swCookie) {
    const project = await handleSWDashLinks(swMatch[1] ?? "", cfg);

    if (project?.projectName && project?.createdAt) {
      const swProjectName = String(project.projectName).trim().toLowerCase();
      const swDevTimeHours = parseDevTimeToHours(String(project.devTime ?? ""));
      const swAgeHours =
        (Date.now() - new Date(project.createdAt).getTime()) / (1000 * 60 * 60);
      const swUsername = String(project.submitterUsername ?? "")
        .trim()
        .toLowerCase();

      const ranked = rows
        .map((row) =>
          scoreRowAgainstSWProject(row, {
            projectName: swProjectName,
            devTimeHours: swDevTimeHours,
            ageHours: swAgeHours,
            username: swUsername,
          }),
        )
        .sort((a, b) => b.score - a.score);

      for (const { row, score } of ranked) {
        row.style.display = "";
        row.dataset.swMatchScore = score.toFixed(3);
        tbody?.appendChild(row);
      }
      return;
    }
  }

  for (const row of rows) {
    delete row.dataset.swMatchScore;
    if (!q) {
      row.style.display = "";
      continue;
    }
    const { reviewId, projectName, projectId, userName, userId } =
      getRowSearchData(row);

    const matches =
      reviewId.includes(q) ||
      projectName.includes(q) ||
      projectId.includes(q) ||
      userName.includes(q) ||
      userId.includes(q) ||
      reviewId.replace("#", "").includes(q.replace("#", ""));

    row.style.display = matches ? "" : "none";
  }
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
    "Search by Review ID, Project Name, Project ID, Username or User ID...";
  search.addEventListener("input", () => filterTable(search.value, cfg));

  wrapper.appendChild(search);
  wrapper.appendChild(iconSpan);

  form.parentElement?.insertBefore(wrapper, form);
}

export function handleQueuePage(cfg: Cfg) {
  if (cfg.search == false || cfg.search === "false") return;
  const form = document.querySelector("form.ysws-queue__filters");
  if (form) injectSearchBar(form, cfg);

  const search = document.getElementById(
    "exterstellar-better-goi-search-input",
  ) as HTMLInputElement | null;
  if (search?.value) filterTable(search.value, cfg);
}