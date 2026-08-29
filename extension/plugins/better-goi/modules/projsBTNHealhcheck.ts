import type { Cfg } from "./types";
import { probeLinkStatus, formatStatusTooltip } from "./linkHealth";
import { trackObserver } from "./cleanupRegistry";

const CHECKED_ATTR = "data-exterstellar-btn-health-checked";
const BROKEN_CLASS = "exterstellar-better-goi-btn-broken";

function getRepoDemoReadmeButtons(container: Element): HTMLAnchorElement[] {
  return Array.from(
    container.querySelectorAll<HTMLAnchorElement>("a.detail-link-btn"),
  ).filter((a) => {
    const href = a.getAttribute("href");
    return !!href && href !== "#";
  });
}

async function checkButton(btn: HTMLAnchorElement): Promise<void> {
  if (btn.hasAttribute(CHECKED_ATTR)) return;
  btn.setAttribute(CHECKED_ATTR, "1");

  const href = btn.href;
  if (!href) return;

  const result = await probeLinkStatus(href);
  if (!result) return;

  if (result.status >= 400) {
    btn.classList.add(BROKEN_CLASS);
    btn.title = formatStatusTooltip(result.status, result.statusText);
  }
}

async function checkDetailLinks(root: ParentNode = document): Promise<void> {
  const containers = root.querySelectorAll<Element>(".detail-links");
  for (const container of Array.from(containers)) {
    for (const btn of getRepoDemoReadmeButtons(container)) {
      void checkButton(btn);
    }
  }
}

export function handleProjBtnHealthCheck(cfg: Cfg): void {
  if (cfg.projBtnHealthCheck === false || cfg.projBtnHealthCheck === "false")
    return;

  void checkDetailLinks(document);

  const observer = trackObserver(
    new MutationObserver((mutations) => {
      let added = false;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (
            node.classList.contains("detail-links") ||
            node.querySelector(".detail-links")
          ) {
            added = true;
            break;
          }
        }
        if (added) break;
      }
      if (added) void checkDetailLinks(document);
    }),
  );
  observer.observe(document.body ?? document.documentElement ?? document, { childList: true, subtree: true });
}
