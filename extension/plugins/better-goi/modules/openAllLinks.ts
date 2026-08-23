import type { Cfg } from "./types";

type PlatformMatcher = {
  match: (hostname: string) => boolean;
  buildReposUrl: (origin: string, username: string) => string;
};

// Only exclude the pages-hosting subdomains of git platforms themselves —
// these serve demo sites but aren't profile/repo pages.
const NON_PLATFORM_HOST_SUFFIXES = [".github.io", ".gitlab.io"];

function isNonPlatformHost(hostname: string): boolean {
  return NON_PLATFORM_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

// Order matters — more specific hosts first, generic Forgejo/Gitea-style
// fallback last (covers Codeberg, self-hosted Forgejo/Gitea instances, etc.)
const PLATFORM_MATCHERS: PlatformMatcher[] = [
  {
    match: (hostname) => hostname === "github.com",
    buildReposUrl: (origin, username) => `${origin}/${username}?tab=repositories`,
  },
  {
    match: (hostname) => hostname === "gitlab.com" || hostname.startsWith("gitlab."),
    buildReposUrl: (origin, username) => `${origin}/${username}`,
  },
  {
    match: (hostname) => hostname === "tangled.sh",
    buildReposUrl: (origin, username) => `${origin}/@${username}`,
  },
  {
    // Gitea/Forgejo-style (Codeberg + self-hosted instances)
    match: () => true,
    buildReposUrl: (origin, username) => `${origin}/${username}?tab=repositories`,
  },
];

function buildReposUrlForHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (isNonPlatformHost(url.hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const username = segments[0];
  if (!username) return null;
  const matcher = PLATFORM_MATCHERS.find((m) => m.match(url.hostname));
  if (!matcher) return null;
  return matcher.buildReposUrl(url.origin, username);
}

// Derives platform-profile "repositories" URLs from whatever links are
// available in the panel: explicit .platform-username anchors when present,
// falling back to the owner segment of the Repo link only — Demo links
// commonly point at project hosting (GitHub Pages, Netlify, etc.), not a
// git platform profile, so they're never used for username derivation.
function buildRepositoryUrls(detailLinks: Element, sidebar: Element): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const add = (href: string | null) => {
    const reposUrl = href ? buildReposUrlForHref(href) : null;
    if (reposUrl && !seen.has(reposUrl)) {
      seen.add(reposUrl);
      urls.push(reposUrl);
    }
  };

  const profileLinks = sidebar.querySelectorAll("a.platform-username[href]");
  for (const link of Array.from(profileLinks) as HTMLAnchorElement[]) {
    add(link.getAttribute("href"));
  }

  // Fallback: no explicit profile link, so derive from the Repo href only
  if (urls.length === 0) {
    const links = detailLinks.querySelectorAll(".detail-link-btn");
    for (const link of Array.from(links) as HTMLAnchorElement[]) {
      if (link.textContent?.trim() === "Repo") {
        add(link.getAttribute("href"));
      }
    }
  }

  return urls;
}

function getDetailLinkUrls(detailLinks: Element): string[] {
  const links = detailLinks.querySelectorAll(".detail-link-btn");
  const urls: string[] = [];
  for (const link of Array.from(links) as HTMLAnchorElement[]) {
    const label = link.textContent?.trim();
    if (label === "Repo" || label === "Demo") {
      const href = link.getAttribute("href");
      if (href) urls.push(href);
    }
  }
  return urls;
}

async function openUrlsInTabs(urls: string[]) {
  if (!urls.length) return;
  return chrome.runtime.sendMessage({
    type: "OPEN_TABS",
    urls,
  });
}

function injectOpenAllLinksButton(sidebar: Element) {
  if (sidebar.hasAttribute("data-exterstellar-open-all-links")) return;
  const detailLinks = sidebar.querySelector(".detail-links");
  if (!detailLinks) return;

  sidebar.setAttribute("data-exterstellar-open-all-links", "1");

  const button = document.createElement("a");
  button.href = "#";
  button.classList.add("detail-link-btn", "exterstellar-better-goi-open-all-btn");
  button.textContent = "Open All";

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    const urls = [
      ...getDetailLinkUrls(detailLinks),
      ...buildRepositoryUrls(detailLinks, sidebar),
    ];
    if (!urls.length) {
      console.warn("[Better GOI] No repo/demo/profile links found for this project");
      return;
    }
    await openUrlsInTabs(urls);
  });

  detailLinks.appendChild(button);
}

export function handleLinkPanels(cfg: Cfg) {
  if (cfg.openAllLinksButton === false || cfg.openAllLinksButton === "false") return;
  const sidebars = document.querySelectorAll(".review-detail-right");
  for (const sidebar of Array.from(sidebars)) {
    injectOpenAllLinksButton(sidebar);
  }
}