import type { Cfg } from "./types";
import { openCommitViewer } from "./commitViewer";

function getCommitUrlsFromItem(item: Element): string[] {
  const svg = item.querySelector("svg.commit-graph");
  if (!svg) return [];

  const anchors = Array.from(svg.querySelectorAll("a[href]")) as SVGAElement[];

  return anchors
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href);
}

async function openCommitUrlsInTabs(urls: string[]) {
  if (!urls.length) return;
  return chrome.runtime.sendMessage({
    type: "OPEN_TABS",
    urls,
  });
}

function getRepoUrlForItem(item: Element): string | null {
  // Try to find repo URL from surrounding page (same as commits.ts sidebar uses)
  const repoLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.detail-link-btn")).find(a => a.textContent?.trim() === "Repo");
  if (repoLink?.href) return repoLink.href;
  // Fallback: derive from first commit URL origin+path
  const urls = getCommitUrlsFromItem(item);
  if (!urls.length) return null;
  try {
    const u = new URL(urls[0]!, window.location.origin);
    // e.g. https://github.com/owner/repo/commit/abc -> https://github.com/owner/repo
    const m = u.pathname.match(/^\/([^/]+\/[^/]+)\/commit\//);
    if (m) return `${u.origin}/${m[1]}`;
    // gitlab: /owner/repo/-/commit/...
    const m2 = u.pathname.match(/^\/([^/]+\/[^/]+)\/-\/commit\//);
    if (m2) return `${u.origin}/${m2[1]}`;
    // fallback origin/path
    return `${u.origin}${u.pathname.split("/commit/")[0]}`;
  } catch { return null; }
}

function parseCommitUrlToCommit(url: string): { hash: string; message: string; author: string; date: string; url: string } | null {
  try {
    const u = new URL(url, window.location.origin);
    const parts = u.pathname.split("/commit/");
    const hash = parts[1]?.split("/")[0]?.split("?")[0] ?? "";
    if (!/^[0-9a-f]{7,40}$/i.test(hash)) return null;
    return { hash, message: hash.slice(0,7), author: "", date: "", url };
  } catch { return null; }
}

function injectOpenAllCommitsButton(item: Element, cfg: Cfg) {
  if (item.hasAttribute("data-exterstellar-open-all-commits")) return;

  const panel = item.querySelector(".devlog-review-panel");
  const panelTitle = panel?.querySelector(".panel-title");
  if (!panelTitle?.parentElement) return;

  const urls = getCommitUrlsFromItem(item);
  const disabled = urls.length === 0;

  const wrap = document.createElement("div");
  wrap.className = "exterstellar-cv-wrap";

  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.classList.add("status-btn", "exterstellar-better-goi-commits-window-btn");
  viewBtn.textContent = disabled ? "No commits" : `View all commits (${urls.length})`;
  viewBtn.title = "Open in-platform viewer — all files, each commit diff";
  viewBtn.disabled = disabled;
  viewBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const liveUrls = getCommitUrlsFromItem(item);
    if (!liveUrls.length) return;
    const repoUrl = getRepoUrlForItem(item);
    if (!repoUrl) {
      const commits = liveUrls.map(u => parseCommitUrlToCommit(u)).filter(Boolean) as { hash:string; message:string; author:string; date:string; url:string }[];
      if (!commits.length) return;
      void openCommitViewer(commits, liveUrls[0]!, cfg, 0);
      return;
    }
    const commits = liveUrls.map(u => parseCommitUrlToCommit(u)).filter(Boolean) as { hash:string; message:string; author:string; date:string; url:string }[];
    void openCommitViewer(commits, repoUrl, cfg, 0);
  });

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.classList.add("status-btn", "exterstellar-better-goi-commits-window-btn", "exterstellar-better-goi-commits-window-btn--secondary");
  openBtn.title = "Open all commits in new tabs (legacy, may crash on many)";
  openBtn.textContent = "Open tabs";
  openBtn.disabled = disabled;
  openBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const liveUrls = getCommitUrlsFromItem(item);
    if (!liveUrls.length) {
      console.warn("[Better GOI] No commits found in this panel");
      return;
    }
    await openCommitUrlsInTabs(liveUrls);
  });

  wrap.append(viewBtn, openBtn);
  item.setAttribute("data-exterstellar-open-all-commits", "1");
  panelTitle.parentElement.insertBefore(wrap, panelTitle);
}

export function handleDevlogReviewPanels(cfg: Cfg) {
  if (cfg.commitsButton === false || cfg.commitsButton === "false") return;

  const items = document.querySelectorAll(".devlog-item");
  for (const item of Array.from(items)) {
    injectOpenAllCommitsButton(item, cfg);
  }
}