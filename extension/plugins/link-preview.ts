export {};
declare const Exterstellar: import("../types").ExterstellarAPI;

interface OGData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  fetchedAt: number;
}

Exterstellar.register({
  id: "link-preview",
  name: "Link Previews (Disabled)",
  description: "Shows a link's metadata/embed thingy when you hover over a link.",
  author: "Sabio",
  config: [
    {
      key: "showImages",
      label: "Show images in preview",
      type: "checkbox",
      default: true,
    },
    {
      key: "delay",
      label: "Hover delay (ms)",
      type: "number",
      default: 0,
    },
  ],

  start() {
    // const cfg = Exterstellar.getConfig("link-preview");
    // const hoverDelay = typeof cfg.delay === "number" ? cfg.delay : 0;
    // const wantImages = cfg.showImages !== false && cfg.showImages !== "false";

    // const style = document.createElement("style");
    // style.id = "exterstellar-link-preview";
    // style.textContent = buildCSS();
    // document.head.appendChild(style);

    // const ogCache = new Map<string, OGData>();

    // const card = document.createElement("div");
    // card.id = "ext-lp-card";
    // card.setAttribute("aria-hidden", "true");
    // document.body.appendChild(card);

    // let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    // let currentHref: string | null = null;
    // let pinned = false;

    // function showCard(anchor: HTMLAnchorElement): void {
    //   const href = anchor.href;
    //   if (!href || href.startsWith("javascript:")) return;
    //   currentHref = href;

    //   hoverTimer = setTimeout(async () => {
    //     if (currentHref !== href) return;
    //     const og = await getOG(href);
    //     if (currentHref !== href) return;
    //     renderCard(href, og);
    //     positionCard(anchor);
    //     card.classList.add("ext-lp-card--visible");
    //   }, hoverDelay);
    // }

    // function hideCard(): void {
    //   if (pinned) return;
    //   if (hoverTimer !== null) {
    //     clearTimeout(hoverTimer);
    //     hoverTimer = null;
    //   }
    //   currentHref = null;
    //   card.classList.remove("ext-lp-card--visible");
    // }

    // function positionCard(anchor: HTMLAnchorElement): void {
    //   const rect = anchor.getBoundingClientRect();
    //   const scrollY = window.scrollY;
    //   const scrollX = window.scrollX;

    //   let top = rect.bottom + scrollY + 8;
    //   let left = rect.left + scrollX;

    //   if (rect.bottom + 188 > window.innerHeight) {
    //     top = rect.top + scrollY - 8 - card.offsetHeight;
    //   }
    //   left = Math.min(left, window.innerWidth + scrollX - 332);
    //   left = Math.max(left, scrollX + 8);

    //   card.style.top = `${top}px`;
    //   card.style.left = `${left}px`;
    // }

    // function renderCard(href: string, og: OGData | null): void {
    //   let domain: string;
    //   try {
    //     domain = new URL(href).hostname.replace(/^www\./, "");
    //   } catch {
    //     domain = href;
    //   }

    //   const title = og?.title?.trim();
    //   const desc = og?.description?.trim();
    //   const img = wantImages ? og?.image?.trim() : undefined;
    //   const site = og?.siteName?.trim() || domain;

    //   card.innerHTML = "";

    //   if (img) {
    //     const thumb = document.createElement("div");
    //     thumb.className = "ext-lp-thumb";
    //     const image = document.createElement("img");
    //     image.src = img;
    //     image.alt = "";
    //     image.loading = "lazy";
    //     image.onerror = () => thumb.remove();
    //     thumb.appendChild(image);
    //     card.appendChild(thumb);
    //   }

    //   const body = document.createElement("div");
    //   body.className = "ext-lp-body";

    //   const siteRow = makeSiteRow(domain, site);
    //   body.appendChild(siteRow);

    //   if (title) {
    //     const h = document.createElement("p");
    //     h.className = "ext-lp-title";
    //     h.textContent = title.length > 90 ? title.slice(0, 87) + "..." : title;
    //     body.appendChild(h);
    //   }

    //   if (desc) {
    //     const d = document.createElement("p");
    //     d.className = "ext-lp-desc";
    //     d.textContent = desc.length > 140 ? desc.slice(0, 137) + "..." : desc;
    //     body.appendChild(d);
    //   }

    //   card.appendChild(body);
    // }

    // function makeSiteRow(domain: string, siteName: string): HTMLElement {
    //   const row = document.createElement("div");
    //   row.className = "ext-lp-site";

    //   const favicon = document.createElement("img");
    //   favicon.className = "ext-lp-favicon";
    //   favicon.width = 14;
    //   favicon.height = 14;
    //   favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    //   favicon.alt = "";
    //   favicon.onerror = () => favicon.remove();

    //   const name = document.createElement("span");
    //   name.textContent = siteName;

    //   row.append(favicon, name);
    //   return row;
    // }

    // async function getOG(href: string): Promise<OGData | null> {
    //   const cached = ogCache.get(href);
    //   if (cached && Date.now() - cached.fetchedAt < 300000) return cached;

    //   try {
    //     const resp: {ok: boolean; html?: string; error?: string} = await chrome.runtime.sendMessage({type: "ext_lp_fetch", url: href});

    //     if (!resp.ok || !resp.html) return null;

    //     const doc = new DOMParser().parseFromString(resp.html, "text/html");
    //     const meta = (name: string): string | null => (doc.querySelector(`meta[property='og:${name}']`) as HTMLMetaElement | null)?.content || (doc.querySelector(`meta[name='${name}']`) as HTMLMetaElement | null)?.content || (doc.querySelector(`meta[name='twitter:${name}']`) as HTMLMetaElement | null)?.content || null;

    //     const raw: Record<string, string | number> = {fetchedAt: Date.now()};
    //     const t = meta("title") || doc.title;
    //     const d = meta("description");
    //     const im = meta("image");
    //     const sn = meta("site_name");
    //     if (t) raw.title = t;
    //     if (d) raw.description = d;
    //     if (im) raw.image = im;
    //     if (sn) raw.siteName = sn;

    //     const og = raw as unknown as OGData;
    //     ogCache.set(href, og);
    //     return og;
    //   } catch (err) {
    //     console.warn("[Exterstellar | link-preview] OG fetch failed:", err)
    //     return null;
    //   }
    // }

    // function onMouseOver(e: MouseEvent): void {
    //   const a = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
    //   if (!a || a.href === currentHref) return;
    //   hideCard();
    //   showCard(a);
    // }

    // function onMouseOut(e: MouseEvent): void {
    //   const a = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
    //   if (!a || a.href === currentHref) return;
    //   hideCard();
    //   showCard(a);
    // }

    // card.addEventListener("mouseenter", () => {pinned = true;});
    // card.addEventListener("mouseleave", () => {
    //   pinned = false;
    //   hideCard();
    // });

    // document.addEventListener("mouseover", onMouseOver, true);
    // document.addEventListener("mouseout", onMouseOut, true);

    // return function cleanup() {
    //   document.removeEventListener("mouseover", onMouseOver, true);
    //   document.removeEventListener("mouseout", onMouseOut, true);
    //   card.remove();
    //   style.remove();
    //   if (hoverTimer !== null) clearTimeout(hoverTimer);
    // };
  },
});

// function buildCSS(): string {
//   return `
//     #ext-lp-card {
//       position: absolute;
//       top: 0;
//       left: 0;
//       z-index: 999999;
//       width: 320px;
//       max-width: calc(100vw - 24px);
//       background: var(--color-space-bg-2);
//       border: 1px solid var(--color-space-surface-faint);
//       border-radius: 11px;
//       overflow: hidden;
//       pointer-events: auto;
//       opacity: 0;
//       transform: translateY(4px);
//       transition: all 200ms ease;
//       font-family: var(--font-family-text, sans-serif);
//     }

//     #ext-lp-card.ext-lp-card--visible {
//       opacity: 1;
//       transform: translateY(0);
//     }

//     .ext-lp-thumb {
//       width: 100%;
//       aspect-ratio: 2 / 1;
//       overflow: hidden;
//       background: var(--color-space-bg);
//     }

//     .ext-lp-thumb img {
//       width: 100%;
//       height: 100%;
//       object-fit: cover;
//       display: block;
//     }

//     .ext-lp-body {
//       padding: 11px 13px 12px;
//       display: flex;
//       flex-direction: column;
//       gap: 4px;
//     }

//     .ext-lp-site {
//       display: flex;
//       align-items: center;
//       gap: 5px;
//       font-size: 11px;
//       color: var(--color-space-text-muted);
//       text-transform: uppercase;
//       letter-spacing: 0.05em;
//       font-weight: 600;
//     }

//     .ext-lp-favicon {
//       width: 14px;
//       height: 14px;
//       object-fit: contain;
//       flex-shrink: 0;
//       border-radius: 2px;
//     }

//     .ext-lp-title {
//       margin: 0;
//       font-size: 13px;
//       font-weight: 700;
//       color: var(--color-space-text);
//       line-height: 1.35;
//     }

//     .ext-lp-desc {
//       margin: 0;
//       font-size: 12px;
//       color: var(--color-space-text-muted);
//       line-height: 1.45;
//     }
//   `;
// }
