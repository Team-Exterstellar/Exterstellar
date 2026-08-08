import type { Cfg } from "./types";

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

function injectOpenAllCommitsButton(item: Element) {
  if (item.hasAttribute("data-exterstellar-open-all-commits")) return;

  const panel = item.querySelector(".devlog-review-panel");
  const panelTitle = panel?.querySelector(".panel-title");
  if (!panelTitle?.parentElement) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(
    "status-btn",
    "exterstellar-better-goi-commits-window-btn",
  );
  item.setAttribute("data-exterstellar-open-all-commits", "1");
  button.textContent = "Open all commits in window";
  const urls = getCommitUrlsFromItem(item);
  if (urls.length === 0) {
    button.disabled = true;
  }

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    const urls = getCommitUrlsFromItem(item);

    if (!urls.length) {
      console.warn("[Better GOI] No commits found in this panel");
      return;
    }
    await openCommitUrlsInTabs(urls);
  });

  panelTitle.parentElement.insertBefore(button, panelTitle);
}

export function handleDevlogReviewPanels(cfg: Cfg) {
  if (cfg.commitsButton === false || cfg.commitsButton === "false") return;

  const items = document.querySelectorAll(".devlog-item");
  for (const item of Array.from(items)) {
    injectOpenAllCommitsButton(item);
  }
}