import type { Cfg } from "./types";

type Commit = {
  hash: string;
  message: string;
  author: string;
  date: string;
  url: string;
};

async function getGithubCommits(repoUrl: string): Promise<Commit[]> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/#.]+)/);
  if (!match) return [];

  const [, owner, repo] = match;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits`,
  );

  if (!res.ok) return [];

  const commits = await res.json();

  return commits.map((c: any) => ({
    hash: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? "Unknown",
    date: c.commit.author?.date ?? "",
    url: `https://github.com/${owner}/${repo}/commit/${c.sha}`,
  }));
}

async function getGitlabCommits(repoUrl: string): Promise<Commit[]> {
  const match = repoUrl.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
  if (!match) return [];

  const projectPath = match[1];
  const project = encodeURIComponent(projectPath ?? "");

  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${project}/repository/commits`,
  );

  if (!res.ok) return [];

  const commits = await res.json();

  return commits.map((c: any) => ({
    hash: c.id,
    message: c.message,
    author: c.author_name,
    date: c.created_at,
    url: `https://gitlab.com/${projectPath}/-/commit/${c.id}`,
  }));
}

async function getCodebergCommits(repoUrl: string): Promise<Commit[]> {
  const match = repoUrl.match(/codeberg\.org\/([^/]+)\/([^/#.]+)/);
  if (!match) return [];

  const [, owner, repo] = match;

  const res = await fetch(
    `https://codeberg.org/api/v1/repos/${owner}/${repo}/commits`,
  );

  if (!res.ok) return [];

  const commits = await res.json();

  return commits.map((c: any) => ({
    hash: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? "Unknown",
    date: c.commit.author?.date ?? "",
    url: `https://codeberg.org/${owner}/${repo}/commit/${c.sha}`,
  }));
}

async function getCommits(repoUrl: string): Promise<Commit[] | 0> {
  if (repoUrl.includes("github.com")) {
    return getGithubCommits(repoUrl);
  }

  if (repoUrl.includes("gitlab.com")) {
    return getGitlabCommits(repoUrl);
  }

  if (repoUrl.includes("codeberg.org")) {
    return getCodebergCommits(repoUrl);
  }

  return 0;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
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
  } else {
    const commitsData = await getCommits(repoLink.href);
    if (commitsData === 0) {
      const pre = document.createElement("pre");
      pre.textContent = "Git Provider is unsupported";
      commitArea.appendChild(pre);
      sectionDetails.appendChild(commitArea);
      div.appendChild(sectionDetails);
      return;
    } else {
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
    }
  }
  div.appendChild(sectionDetails);
}

export function handleReviewDetailPage(cfg: Cfg) {
  if (cfg.git === false || cfg.git === "false") return;
  const sidebar = document.querySelector("div.review-detail-right");
  if (sidebar) injectAllProjectsCommits(sidebar);
}