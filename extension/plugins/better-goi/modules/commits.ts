import type { Cfg } from "./types";

type Commit = {
  hash: string;
  message: string;
  author: string;
  date: string;
  url: string;
};

function getCurrentShipDateRange(): { since: Date | null; until: Date | null } {
  const dateEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".devlog-item:not(.devlog-review-group--frozen .devlog-item) .devlog-date",
    ),
  );

  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const el of dateEls) {
    const parsed = new Date(el.textContent?.trim() ?? "");
    if (isNaN(parsed.getTime())) continue;
    if (!earliest || parsed < earliest) earliest = parsed;
    if (!latest || parsed > latest) latest = parsed;
  }

  let since: Date | null = null;
  if (earliest && latest && earliest.getTime() !== latest.getTime()) {
    since = new Date(earliest);
    since.setDate(since.getDate() - 1);
  }

  let until: Date | null = null;
  if (latest) {
    until = new Date(latest);
    until.setDate(until.getDate() + 1);
    until.setHours(23, 59, 59, 999);
  }

  return { since, until };
}

async function getGithubCommits(
  repoUrl: string,
  since?: Date,
): Promise<Commit[]> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#.]+)/);
  if (!match) return [];

  const [, owner, repo] = match;
  if (!owner || !repo) return [];

  const commits: any[] = [];
  const sinceParam = since ? `&since=${since.toISOString()}` : "";
  let url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100${sinceParam}`;

  const MAX_PAGES = since ? Infinity : 50;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[exterstellar] github commits fetch failed (${res.status}) for ${owner}/${repo}`,
        await res.text().catch(() => "<no body>"),
      );
      break;
    }

    commits.push(...(await res.json()));

    const link = res.headers.get("Link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next?.[1] ?? "";
  }

  return commits.map((c: any) => ({
    hash: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? "Unknown",
    date: c.commit.author?.date ?? "",
    url: `https://github.com/${owner}/${repo}/commit/${c.sha}`,
  }));
}

async function getGitlabCommits(
  repoUrl: string,
  since?: Date,
): Promise<Commit[]> {
  const match = repoUrl.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
  if (!match) return [];

  const projectPath = match[1];
  if (!projectPath) return [];
  const project = encodeURIComponent(projectPath);
  const sinceParam = since ? `&since=${since.toISOString()}` : "";

  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${project}/repository/commits?per_page=100${sinceParam}`,
  );

  if (!res.ok) {
    console.warn(
      `[exterstellar] gitlab commits fetch failed (${res.status}) for ${projectPath}`,
      await res.text().catch(() => "<no body>"),
    );
    return [];
  }

  const commits = await res.json();

  return commits.map((c: any) => ({
    hash: c.id,
    message: c.message,
    author: c.author_name,
    date: c.created_at,
    url: `https://gitlab.com/${projectPath}/-/commit/${c.id}`,
  }));
}

async function getGiteaLikeCommits(
  origin: string,
  owner: string,
  repo: string,
  since?: Date,
): Promise<Commit[]> {
  const sinceParam = since ? `&since=${since.toISOString()}` : "";
  const res = await fetch(
    `${origin}/api/v1/repos/${owner}/${repo}/commits?limit=100${sinceParam}`,
  );

  if (!res.ok) {
    console.warn(
      `[exterstellar] gitea-like commits fetch failed (${res.status}) for ${origin}/${owner}/${repo}`,
      await res.text().catch(() => "<no body>"),
    );
    return [];
  }

  const commits = await res.json();

  return commits.map((c: any) => ({
    hash: c.sha,
    message: c.commit?.message ?? "",
    author: c.commit?.author?.name ?? c.author?.login ?? "Unknown",
    date: c.commit?.author?.date ?? "",
    url: c.html_url ?? `${origin}/${owner}/${repo}/commit/${c.sha}`,
  }));
}

async function getCodebergCommits(
  repoUrl: string,
  since?: Date,
): Promise<Commit[]> {
  const match = repoUrl.match(/codeberg\.org\/([^/]+)\/([^/#.]+)/);
  if (!match) return [];

  const [, owner, repo] = match;
  if (!owner || !repo) return [];

  return getGiteaLikeCommits("https://codeberg.org", owner, repo, since);
}

async function getTangledCommits(
  repoUrl: string,
  since?: Date,
): Promise<Commit[]> {
  const match = repoUrl.match(/tangled\.(?:sh|org)\/([^/]+)\/([^/#.]+)/);
  if (!match) return [];

  const [, owner, repo] = match;
  if (!owner || !repo) return [];

  const origin = new URL(repoUrl).origin;

  const res = await fetch(`${origin}/${owner}/${repo}/commits`);
  if (!res.ok) {
    console.warn(
      `[exterstellar] tangled commits fetch failed (${res.status}) for ${owner}/${repo}`,
      await res.text().catch(() => "<no body>"),
    );
    return [];
  }

  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const commitLinks = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>('a[href*="/commit/"]'),
  ).filter((a) =>
    /\/commit\/[0-9a-f]{40}$/.test(a.getAttribute("href") ?? ""),
  );

  const commits = new Map<string, Commit>();

  for (const link of commitLinks) {
    const href = link.getAttribute("href")!;
    const hash = href.split("/commit/")[1];
    if (!hash || commits.has(hash)) continue;

    const text = link.textContent?.trim() ?? "";
    if (text.length <= 10) continue;

    const container = link.closest("li, tr, article, div") ?? link.parentElement;

    let author = "Unknown";
    let date = "";

    if (container) {
      const authorLink = Array.from(
        container.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ).find((a) => {
        const h = a.getAttribute("href") ?? "";
        return (
          (h.startsWith("/did:") || /^\/[^/]+$/.test(h)) &&
          !h.includes("/commit/") &&
          !h.includes("/tree/")
        );
      });
      if (authorLink) author = authorLink.textContent?.trim() || author;

      const timeEl = container.querySelector("time");
      if (timeEl) {
        date =
          timeEl.getAttribute("datetime") ??
          timeEl.getAttribute("title") ??
          timeEl.textContent?.trim() ??
          "";
      } else {
        const agoMatch = container.textContent?.match(
          /\b\d+\s*(?:s|m|h|d|w|mo|y)\s*ago\b/,
        );
        if (agoMatch) date = agoMatch[0];
      }
    }

    commits.set(hash, {
      hash,
      message: text,
      author,
      date,
      url: `${origin}${href}`,
    });
  }

  let result = Array.from(commits.values());

  if (since) {
    result = result.filter((c) => {
      const parsed = new Date(c.date);
      return isNaN(parsed.getTime()) || parsed >= since;
    });
  }

  return result;
}

async function detectGiteaLikeOrigin(repoUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(repoUrl).origin;
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${origin}/api/v1/version`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.version === "string") return origin;
  } catch {
  }
  return null;
}

async function getSelfHostedGiteaLikeCommits(
  repoUrl: string,
  since?: Date,
): Promise<Commit[]> {
  const origin = await detectGiteaLikeOrigin(repoUrl);
  if (!origin) return [];

  const match = repoUrl.match(/\/([^/]+)\/([^/#.]+?)(?:\.git)?\/?$/);
  if (!match) return [];

  const [, owner, repo] = match;
  if (!owner || !repo) return [];

  return getGiteaLikeCommits(origin, owner, repo, since);
}

async function getCommits(repoUrl: string): Promise<Commit[] | 0> {
  const { since, until } = getCurrentShipDateRange();
  console.debug("[exterstellar] ship date range", { repoUrl, since, until });

  let commits: Commit[];
  if (repoUrl.includes("github.com")) {
    commits = await getGithubCommits(repoUrl, since ?? undefined);
  } else if (repoUrl.includes("gitlab.com")) {
    commits = await getGitlabCommits(repoUrl, since ?? undefined);
  } else if (repoUrl.includes("codeberg.org")) {
    commits = await getCodebergCommits(repoUrl, since ?? undefined);
  } else if (repoUrl.includes("tangled.sh") || repoUrl.includes("tangled.org")) {
    commits = await getTangledCommits(repoUrl, since ?? undefined);
  } else {
    commits = await getSelfHostedGiteaLikeCommits(repoUrl, since ?? undefined);
    if (commits.length === 0) return 0;
  }

  console.debug(
    `[exterstellar] fetched ${commits.length} commit(s) before until-filter`,
  );

  if (until) {
    commits = commits.filter((c) => {
      const parsed = new Date(c.date);
      return isNaN(parsed.getTime()) || parsed <= until;
    });
  }

  console.debug(
    `[exterstellar] ${commits.length} commit(s) remain after until-filter`,
  );

  return commits;
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function openAllCommitTabs(commits: Commit[]) {
  chrome.runtime.sendMessage({
    type: "OPEN_TABS",
    urls: commits.map((c) => c.url),
  });
}

async function injectAllProjectsCommits(div: Element) {
  if (div.hasAttribute("data-exterstellar-all-project-commits")) return;
  const sectionDetails = document.createElement("section");
  div.setAttribute("data-exterstellar-all-project-commits", "1");
  sectionDetails.classList.add("review-card", "details-card");

  const header = document.createElement("h3");
  header.textContent = "Git Activity";
  sectionDetails.appendChild(header);

  const commitArea = document.createElement("div");
  commitArea.classList.add(
    "details-list",
    "exterstellar-better-goi-commits-list",
  );
  const repoLink = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a.detail-link-btn"),
  ).find((a) => a.textContent?.trim() === "Repo");

  if (!repoLink?.href) {
    const pre = document.createElement("pre");
    pre.textContent = "No repo url provided";
    commitArea.appendChild(pre);
    sectionDetails.appendChild(commitArea);
    div.appendChild(sectionDetails);
    return;
  }

  const commitsData = await getCommits(repoLink.href);

  if (commitsData === 0) {
    const pre = document.createElement("pre");
    pre.textContent = "Git Provider is unsupported";
    commitArea.appendChild(pre);
    sectionDetails.appendChild(commitArea);
    div.appendChild(sectionDetails);
    return;
  }

  if (commitsData.length === 0) {
    const pre = document.createElement("pre");
    pre.textContent = "No commits found in the current ship date range";
    commitArea.appendChild(pre);
    sectionDetails.appendChild(commitArea);
    div.appendChild(sectionDetails);
    return;
  }

  header.textContent = "Git Activity - ";
  const openAllLink = document.createElement("a");
  openAllLink.href = "#";
  openAllLink.textContent = "Open All";
  openAllLink.addEventListener("click", (e) => {
    e.preventDefault();
    openAllCommitTabs(commitsData);
  });
  header.appendChild(openAllLink);

  for (const commit of commitsData.reverse()) {
    const commitDiv = document.createElement("div");
    commitDiv.classList.add("detail-item");
    const commitKeyMSG = document.createElement("span");
    commitKeyMSG.textContent = commit.message;

    const commitHash = document.createElement("a");
    commitHash.style.float = "right";
    commitHash.style.marginRight = "10px";
    commitHash.textContent = commit.hash.slice(0, 7);
    commitHash.href = commit.url;
    commitHash.target = "_blank";
    commitHash.rel = "noopener noreferrer";
    commitKeyMSG.appendChild(commitHash);
    commitDiv.appendChild(commitKeyMSG);

    const commitKeyDetails = document.createElement("span");
    commitKeyDetails.textContent = `By ${commit.author} · ${formatDate(commit.date)}`;
    commitKeyDetails.classList.add(
      "exterstellar-better-goi-review-commit-details",
    );
    commitDiv.appendChild(commitKeyDetails);
    commitArea.appendChild(commitDiv);
  }
  sectionDetails.appendChild(commitArea);
  div.appendChild(sectionDetails);
}

export function handleReviewDetailPage(cfg: Cfg) {
  if (cfg.git === false || cfg.git === "false") return;
  const sidebar = document.querySelector("div.review-detail-right");
  if (sidebar) injectAllProjectsCommits(sidebar);
}
