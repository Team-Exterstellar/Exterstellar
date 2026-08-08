import type { Cfg } from "./types";

// Devlog MD
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let slackEmojiMap: Record<any, any> = {};
async function fetchSlackEmojis() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_SLACK_EMOJIS" }, (data) => {
      if (data && data.ok) {
        slackEmojiMap = data.emoji;
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

let emojiSupportEnabled = true;
let emojiMapLoaded = false;
let emojiMapLoadingPromise: Promise<void> | null = null;

async function ensureSlackEmojisLoaded(cfg: Cfg): Promise<void> {
  if (cfg.emojiSupport === false || cfg.emojiSupport === "false") return;
  if (emojiMapLoadingPromise) return emojiMapLoadingPromise;
  emojiMapLoadingPromise = fetchSlackEmojis().then(() => {
    emojiMapLoaded = true;
  });
  return emojiMapLoadingPromise;
}

function formatEmoji(escaped: string): string {
  return escaped.replace(/:([a-z0-9_+\-]+):/gi, (match, name) => {
    const url = slackEmojiMap[name.toLowerCase()];
    if (!url) return match;
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=20&h=20&fit=contain`;
    return `<img src="${proxyUrl}" alt=":${name}:" title=":${name}:" class="exterstellar-better-goi-emoji">`;
  });
}

function formatInline(escaped: string): string {
  let out = emojiSupportEnabled ? formatEmoji(escaped) : escaped;
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, href) => {
      const safeHref = escapeHtml(String(href));
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
  return out;
}

function renderDevlogMarkdown(raw: string): string {
  const normalized = raw.replace(/<br\s*\/?>/gi, "\n");
  const lines = normalized.split("\n");

  const htmlParts: string[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length) {
      htmlParts.push(`<p>${paragraphBuffer.join("<br>")}</p>`);
      paragraphBuffer = [];
    }
  };

  const flushList = () => {
    if (listBuffer.length) {
      htmlParts.push(
        `<ul>${listBuffer.map((i) => `<li>${i}</li>`).join("")}</ul>`,
      );
      listBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = (headingMatch[1] ?? "").length;
      const text = formatInline(escapeHtml((headingMatch[2] ?? "").trim()));
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listBuffer.push(formatInline(escapeHtml((listMatch[1] ?? "").trim())));
      continue;
    }

    flushList();
    paragraphBuffer.push(formatInline(escapeHtml(line)));
  }

  flushParagraph();
  flushList();

  return htmlParts.join("");
}

function formatDevlogDesc(desc: HTMLElement) {
  if (desc.getAttribute("data-goi-md-rendered") === "1") return;

  const raw = desc.innerHTML ?? "";
  if (!raw.trim()) return;

  const rendered = renderDevlogMarkdown(raw);
  const replacement = document.createElement("div");
  replacement.className = desc.className;
  replacement.classList.add("exterstellar-better-goi-devlog-md");
  replacement.setAttribute("data-goi-md-rendered", "1");
  replacement.innerHTML = rendered;

  desc.replaceWith(replacement);
}

export async function handleDevlogMarkdown(cfg: Cfg) {
  if (cfg.markdown === false || cfg.markdown === "false") return;

  emojiSupportEnabled =
    cfg.emojiSupport !== false && cfg.emojiSupport !== "false";
  if (emojiSupportEnabled) await ensureSlackEmojisLoaded(cfg);

  const items = document.querySelectorAll(".devlog-item");
  for (const item of Array.from(items)) {
    const desc = item.querySelector<HTMLElement>(".devlog-desc");
    if (desc) formatDevlogDesc(desc);
  }
}