import { EtaMode, GoalItem, SortKey } from "../types";
export {};
declare const Exterstellar: import("../types").ExterstellarAPI;

Exterstellar.register({
  id: "shop-goals-enhanced",
  name: "Shop Goals Enhanced",
  description: "Enhances the wishlist system.",
  author: "Sabio",
  config: [
    {
      key: "multiplier",
      label: "Stardust per hour rate",
      type: "number",
      default: "10"
    },
    {
      key: "showETA",
      label: "Show ETA",
      type: "checkbox",
      default: true
    },
    {
      key: "showSummary",
      label: "Show summarized stats above wishlist",
      type: "checkbox",
      default: true
    },
    {
      key: "showRecommender",
      label: "Show next-goal tip",
      type: "checkbox",
      default: true
    },
    {
      key: "showSort",
      label: "Show sort controls",
      type: "checkbox",
      default: true
    },
    {
      key: "highlightNearest",
      label: "Highlight closest goal",
      type: "checkbox",
      default: true
    },
    {
      key: "defaultSort",
      label: "Default sort",
      type: "select",
      options: [
        {value: "manual", label: "Manual"},
        {value: "closest", label: "Closest to complete"},
        {value: "cheapest", label: "Cheapest First"},
        {value: "expensive", label: "Expensive First"}
      ],
      default: "manual"
    },
    {
      key: "defaultMode",
      label: "Default ETA mode",
      type: "select",
      options: [
        {value: "individual", label: "Individual"},
        {value: "cumulative", label: "Cumul."}
      ],
      default: "cumulative"
    }
  ],

  start() {
    const cfg = Exterstellar.getConfig("shop-goals-enhanced");

    const cfgBool = (v: string | boolean | number): boolean => v !== false && v !== "false";
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, txt?: string): HTMLElementTagNameMap[K] => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    const sync = (obj: Record<string, unknown>): void => {try {chrome.storage.sync.set(obj);} catch (_) {}};
    const qs = (s: string): Element | null => document.querySelector(s);
    const qsa = (s: string): NodeListOf<Element> => document.querySelectorAll(s);

    const showETA = cfgBool(cfg.showETA ?? true);
    const showSummary = cfgBool(cfg.showSummary ?? true);
    const showRec = cfgBool(cfg.showRecommender ?? true);
    const showSort = cfgBool(cfg.showSort ?? true);
    const highlight = cfgBool(cfg.highlightNearest ?? true);
    let currentSort: SortKey = (cfg.defaultSort as SortKey) || "manual";
    let currentMode: EtaMode = (cfg.defaultMode as EtaMode) || "cumulative";
    let ratePerHour = Math.max(1, parseFloat(String(cfg.multiplier)) || 10);
    let quantities: Record<string, number> = {};
    let manualOrder: string[] = [];
    let dragSrcName: string | null = null;
    let mountTimer: ReturnType<typeof setTimeout> | undefined;
    let etaTimer: ReturnType<typeof setTimeout> | undefined;

    let wishlistOriginalParent: Element | null = null;
    let wishlistOriginalNextSibling: Element | null = null;

    const getQty = (name: string): number => Math.max(1, quantities[name] ?? 1);

    try {
      chrome.storage.sync.get(["sgeQuantities", "sgeManualOrder"], d => {
        quantities = d.sgeQuantities || {};
        manualOrder = d.sgeManualOrder || [];
        refresh();
      });
    } catch (_) {}

    const style = el("style");
    style.id = "exterstellar-shop-goals-enhanced";
    style.textContent = `
      .shop-goals__item {
        position: relative !important;
        overflow: visible !important;
      }

      .shop-goals__item > .button_to {
        position: absolute;
        top: 7px;
        right: 7px;
        z-index: 10;
        margin: 0;
        padding: 0;
        line-height: 1;
        display: block;
      }

      .shop-goals__remove {
        width: 22px !important;
        height: 22px !important;
        padding: 0 !important;
        border-radius: 50% !important;
        border: 1.5px solid transparent !important;
        background: rgba(0, 0, 0, 0.35) !important;
        color: rgba(255, 255, 255, 0.7) !important;
        font-size: 15px !important;
        line-height: 1 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0;
        transition: opacity 150ms, background 150ms, border-color 150ms, color 150ms;
        font-family: inherit;
        font-weight: 400 !important;
        backdrop-filter: blur(3px);
      }

      .shop-goals__item:hover .shop-goals__remove,
      .shop-goals__item:focus-within .shop-goals__remove {
        opacity: 1;
      }

      .shop-goals__remove:hover {
        background: rgba(239, 68, 68, 0.85) !important;
        border-color: rgba(239, 68, 68, 0.5) !important;
        color: #fff !important;
      }

      .shop-goals__item[draggable="true"] {
        cursor: grab;
        user-select: none;
      }

      .shop-goals__item[draggable="true"]:active {
        cursor: grabbing;
      }

      .shop-goals__item.sge-dragging {
        opacity: 0.35;
        cursor: grabbing !important;
      }

      .shop-goals__item.sge-drag-over {
        outline: 2px dashed var(--color-space-accent, #cba6f7) !important;
        border-radius: 10px;
        outline-offset: 3px;
        background: var(--color-space-accent-soft, rgba(203, 166, 247, 0.06));
      }

      .sge-summary {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      .sge-summary__stat {
        flex: 1;
        min-width: 54px;
        background: var(--color-space-surface-faint);
        border-radius: 8px;
        padding: 5px 7px;
        text-align: center;
      }

      .sge-summary__label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--color-space-text-muted);
        margin-bottom: 2px;
      }

      .sge-summary__value {
        font-size: 20px;
        font-weight: 800;
        color: var(--color-space-text);
        line-height: 1;
      }

      .sge-summary__value--green {color: #4ade80;}
      .sge-summary__value--amber {color: #fbbf24;}

      .sge-rec {
        font-size: 14px;
        color: var(--color-space-text-muted);
        line-height: 1.4;
        margin-bottom: 8px;
        padding: 6px 9px;
        background: var(--color-space-surface-faint);
        border-radius: 8px;
        border-left: 3px solid var(--color-space-accent, #cba6f7);
      }

      .sge-rec strong {
        color: var(--color-space-text);
        font-weight: 700;
      }

      .sge-sort {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      .sge-sort__label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-space-text-muted);
        margin-right: 2px;
      }

      .sge-sort__btn {
        font-size: 12px;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 6px;
        border: 1.5px solid transparent;
        background: var(--color-space-surface-faint);
        color: var(--color-space-text-muted);
        cursor: pointer;
        font-family: inherit;
        transition: all 120ms;
      }

      .sge-sort__btn:hover {
        background: var(--color-space-surface-soft);
        color: var(--color-space-text);
      }

      .sge-sort__btn.sge-active {
        background: var(--color-space-accent-soft, rgba(203, 166, 247, 0.15));
        border-color: var(--color-space-accent, #cba6f7);
        color: var(--color-space-text);
      }

      .sge-sort__divider {
        width: 1px;
        height: 14px;
        background: var(--color-space-border, rgba(255, 255, 255, 0.12));
        margin: 0 2px;
        flex-shrink: 0;
      }

      .sge-sort__drag-hint {
        margin-left: auto;
        font-size: 9px;
        color: var(--color-space-text-muted);
        opacity: 0.55;
        font-style: italic;
        user-select: none;
      }

      .sge-item-footer {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px 8px;
        box-sizing: border-box;
        border-top: 1px solid var(--color-space-surface-faint);
        margin-top: 6px;
        width: 100%;
      }

      .sge-drag-handle {
        font-size: 14px;
        color: var(--color-space-text-muted);
        opacity: 0.35;
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
        line-height: 1;
      }

      .shop-goals__item[draggable="true"]:active .sge-drag-handle {cursor: grabbing;}
      
      .sge-qty {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
      }

      .sge-qty__btn {
        width: 18px;
        height: 18px;
        padding: 0;
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
        border-radius: 5px;
        border: 1.5px solid transparent;
        background: var(--color-space-surface-faint);
        color: var(--color-space-text-muted);
        cursor: pointer;
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 100ms;
        user-select: none;
      }

      .sge-qty__btn:hover:not(:disabled) {
        background: var(--color-space-surface-soft);
        color: var(--color-space-text);
      }

      .sge-qty__btn:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .sge-qty__val {
        min-width: 20px;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        color: var(--color-space-text);
        user-select: none;
      }

      .sge-eta {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        font-size: 11px;
        color: var(--color-space-text-muted);
        flex-wrap: wrap;
      }

      .sge-eta__time {
        font-weight: 700;
        color: var(--color-space-text);
      }

      .sge-eta__mode {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-space-accent, #cba6f7);
        opacity: 0.75;
      }

      .sge-eta__pct {
        margin-left: auto;
        font-size: 10px;
        font-weight: 700;
        color: var(--color-space-accent, #cba6f7);
      }

      .sge-eta--done {
        color: #4ade80;
        font-weight: 700;
      }

      .shop-goals__item.sge-nearest {
        outline: 2px solid var(--color-space-accent, #cba6f7);
        border-radius: 10px;
        outline-offset: 2px;
      }

      .sge-rate {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--color-space-surface-faint);
      }

      .sge-rate__label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-space-text-muted);
        flex: 1;
      }

      .sge-rate__input {
        width: 70px;
        padding: 3px 6px;
        font-size: 12px;
        font-weight: 700;
        background: var(--color-space-surface-faint);
        border: 1.5px solid transparent;
        border-radius: 6px;
        color: var(--color-space-text);
        font-family: inherit;
        text-align: center;
        outline: none;
        transition: border-color 120ms;
      }

      .sge-rate__input:focus {
        border-color: var(--color-space-accent, #cba6f7);
        background: var(--color-space-surface-soft);
      }

      .sge-rate__unit {
        font-size: 10px;
        color: var(--color-space-text-muted);
        font-weight: 600;
      }

      .shop-hub__layout {
        display: grid;
        column-gap: var(--shop-hub-gutter);
        row-gap: 2rem;
        grid-template-columns: minmax(0, 1fr) 264px;
        grid-template-areas: "topbar topbar""main rail""wishlist wishlist""new new""popular popular";
      }

      .discover-rail__section--wishlist {
        grid-area: wishlist;
      }
    `;
    document.head.appendChild(style);

    function repositionWishlist() {
      const wishlist = qs(".discover-rail__section--wishlist");
      const newItems = qs(".shop-hub__items--new");
      if (!wishlist || !newItems) return;
      if (!wishlistOriginalParent) {
        wishlistOriginalParent = wishlist.parentElement;
        wishlistOriginalNextSibling = wishlist.nextElementSibling;
      }
      if (newItems.previousElementSibling !== wishlist) newItems.before(wishlist);
    }

    function fmtETA(h: number): string {
      if (!isFinite(h) || h <= 0) return "ready!";
      return h < 1 ? `~${Math.ceil(h * 60)}m` : `~${h.toFixed(1)}h`;
    }

    function parseGoals(): GoalItem[] | null {
      const section = qs(".discover-rail__section--wishlist");
      if (!section) return null;
      return Array.from(section.querySelectorAll(".shop-goals__item")).map(item => {
        const el = item as HTMLElement;
        const nameEl = el.querySelector(".shop-goals__name");
        const fill = el.querySelector<HTMLElement>(".shop-goals__progress-fill");
        const txtEl = el.querySelector<HTMLElement>(".shop-goals__progress-text");
        const name = nameEl?.textContent?.trim() || "";
        if (fill && !fill.dataset["sgeOrigPct"]) fill.dataset["sgeOrigPct"] = fill.style.width;
        if (txtEl && !txtEl.dataset["sgeOrigDust"]) {
          const m0 = txtEl.textContent?.match(/([\d,]+)\s*more needed/i);
          txtEl.dataset["sgeOrigDust"] = m0 ? m0[1]!.replace(/,/g, "") : "0";
        }
        const pct = parseFloat(fill?.dataset["sgeOrigPct"] ?? "") || 0;
        const dustNeeded = parseInt(txtEl?.dataset.sgeOrigDust || "0", 10);
        const cost = (pct > 0 && pct < 100) ? Math.round(dustNeeded / (1 - pct / 100)) : dustNeeded;
        return {name, pct: Math.min(100, pct), dustNeeded, cost, elem: el};
      });
    }

    function effectiveNeeded(g: GoalItem): number {
      const qty = getQty(g.name);
      if (qty === 1) return g.dustNeeded;
      return Math.max(0, g.cost * qty - Math.round(g.cost * g.pct / 100));
    }

    function sortGoals(goals: GoalItem[], key: SortKey): GoalItem[] {
      const arr = [...goals];
      if (key === "manual") {
        if (manualOrder.length > 0) {
          const orderMap = Object.fromEntries(manualOrder.map((n, i) => [n, i]));
          arr.sort((a, b) => (orderMap[a.name] ?? 9999) - (orderMap[b.name] ?? 9999));
        }
        return arr;
      }
      if (key === "closest") arr.sort((a, b) => b.pct - a.pct);
      if (key === "cheapest") arr.sort((a, b) => effectiveNeeded(a) - effectiveNeeded(b));
      if (key === "expensive") arr.sort((a, b) => b.cost * getQty(b.name) - a.cost * getQty(a.name));
      return arr;
    }

    function reorderDOM(sorted: GoalItem[]): void {
      const container = qs(".shop-goals__items");
      if (container) sorted.forEach(g => container.appendChild(g.elem));
    }

    function setQty(name: string, qty: number): void {
      quantities[name] = Math.max(1, qty);
      sync({sgeQuantities: quantities});
    }

    function applyDraggable(sorted: GoalItem[]): void {
      const container = qs(".shop-goals__items");
      if (!container) return;
      sorted.forEach(g => {
        g.elem.removeAttribute("draggable");
        ["ondragstart", "ondragend", "ondragover", "ondragleave", "ondrop"].forEach(h => (g.elem as unknown as Record<string, unknown>)[h] = null);
        g.elem.classList.remove("sge-dragging", "sge-drag-over");
        g.elem.querySelectorAll("a, img").forEach((e: Element) => e.removeAttribute("draggable"));
      });
      if (currentSort !== "manual") return;

      sorted.forEach(g => {
        g.elem.setAttribute("draggable", "true");
        g.elem.querySelectorAll("a, img").forEach((e: Element) => e.setAttribute("draggable", "false"));

        g.elem.ondragstart = (e: DragEvent) => {
          dragSrcName = g.name;
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", g.name);
          }
          setTimeout(() => g.elem.classList.add("sge-dragging"), 0);
        };
        g.elem.ondragend = (_e: DragEvent) => {
          g.elem.classList.remove("sge-dragging");
          container.querySelectorAll(".sge-drag-over").forEach(e => e.classList.remove("sge-drag-over"));
        };
        g.elem.ondragover = (e: DragEvent) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = "move";
          if (dragSrcName !== g.name) {
            container.querySelectorAll(".sge-drag-over").forEach(e => e.classList.remove("sge-drag-over"));
            g.elem.classList.add("sge-drag-over");
          }
        };
        g.elem.ondragleave = (e: DragEvent) => {
          if (!g.elem.contains(e.relatedTarget as Node | null)) g.elem.classList.remove("sge-drag-over");
        };
        g.elem.ondrop = (e: DragEvent) => {
          e.preventDefault();
          g.elem.classList.remove("sge-drag-over");
          if (!dragSrcName || dragSrcName === g.name) return;
          const names = Array.from(container.querySelectorAll(".shop-goals__item"))
            .map(el => el.querySelector(".shop-goals__name")?.textContent.trim())
            .filter((n): n is string => n !== undefined);
          const fi = names.indexOf(dragSrcName), ti = names.indexOf(g.name);
          if (fi === -1 || ti === -1) return;
          names.splice(fi, 1);
          names.splice(ti, 0, dragSrcName);
          manualOrder = names;
          sync({sgeManualOrder: manualOrder});
          dragSrcName = null;
          refresh();
        };
      });
    }

    function annotateItems(sorted: GoalItem[]): void {
      let cumulativeDust = 0;
      const computed: Array<{g: GoalItem; needed: number; indivH: number; cumH: number}> = sorted.map(g => {
        const needed = effectiveNeeded(g);
        cumulativeDust += needed;
        return {g, needed, indivH: needed / ratePerHour, cumH: cumulativeDust / ratePerHour};
      });

      computed.forEach(({g, needed, indivH, cumH}) => {
        g.elem.querySelector(".sge-item-footer")?.remove();

        const fill = g.elem.querySelector<HTMLElement>(".shop-goals__progress-fill");
        const txtEl = g.elem.querySelector<HTMLElement>(".shop-goals__progress-text");
        const effectivePct = Math.min(100, getQty(g.name) === 1 ? g.pct : g.pct / getQty(g.name));
        if (fill) fill.style.width = `${effectivePct}%`;
        if (txtEl) {
          const img = txtEl.querySelector("img");
          txtEl.textContent = needed === 0 ? "💯 Affordable" : ` ${needed.toLocaleString()} more needed`;
          if (img) txtEl.prepend(img);
        }

        g.elem.classList.remove("sge-nearest");
        if (!showETA) return;

        const progressContainer = g.elem.querySelector(".shop-goals__progress-container");
        if (!progressContainer) return;

        const qty = getQty(g.name);
        const isDone = needed === 0;
        const footer = el("div", "sge-item-footer");

        if (currentSort === "manual") footer.appendChild(el("span", "sge-drag-handle", "⠿")); // thank u to whoever made this symbol <3

        const qtyDiv = el("div", "sge-qty");
        const minus = el("button", "sge-qty__btn", "-");
        minus.type = "button";
        minus.disabled = qty <= 1;
        minus.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          if (qty > 1) {
            setQty(g.name, qty - 1);
            refresh();
          }
        });
        const plus = el("button", "sge-qty__btn", "+");
        plus.type = "button";
        plus.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          setQty(g.name, qty + 1);
          refresh();
        });
        qtyDiv.append(minus, el("span", "sge-qty__val", String(qty)), plus);

        const etaDiv = el("div", "sge-eta");
        if (isDone) {
          etaDiv.classList.add("sge-eta--done");
          etaDiv.textContent = "💯 Affordable";
        } else {
          const h = currentMode === "cumulative" ? cumH : indivH;
          etaDiv.append(el("span", "sge-eta__time", fmtETA(h)));
          // if (currentMode === "cumulative") etaDiv.appendChild(el("span", "sge-eta__mode", "cumul."));
          etaDiv.appendChild(el("span", "sge-eta__pct", `${g.pct.toFixed(1)}%`));
        }

        footer.append(qtyDiv, etaDiv);
        progressContainer.after(footer);
      });
    }

    function applyHighlight(sorted: GoalItem[]): void {
      sorted.forEach(g => g.elem.classList.remove("sge-nearest"));
      if (!highlight) return;
      const nearest = [...sorted].filter(g => effectiveNeeded(g) > 0).sort((a, b) => b.pct - a.pct)[0];
      if (nearest) nearest.elem.classList.add("sge-nearest");
    }

    function mkSortBtn(label: string, activeKey: string, getActive: () => string, onClick: () => void): HTMLButtonElement {
      const btn = el("button", "sge-sort__btn" + (getActive() === activeKey ? " sge-active" : ""), label);
      btn.type = "button";
      btn.addEventListener("click", onClick);
      return btn;
    }

    function injectControls(section: Element, sorted: GoalItem[]): void {
      section.querySelectorAll(".sge-summary, .sge-rec, .sge-sort, .sge-rate").forEach(e => e.remove());
      const container = section.querySelector(".shop-goals__container");
      if (!container) return;

      const totalNeeded = sorted.reduce((a, g) => a + effectiveNeeded(g), 0);
      const totalCost = sorted.reduce((a, g) => a + g.cost * getQty(g.name), 0);
      const overallPct = totalCost > 0 ? ((totalCost - totalNeeded) / totalCost * 100).toFixed(1) : "0";
      const done = sorted.filter(g => effectiveNeeded(g) === 0).length;
      const nearest = sorted.filter(g => effectiveNeeded(g) > 0).sort((a, b) => b.pct - a.pct)[0];
      const nearETA = nearest ? fmtETA(effectiveNeeded(nearest) / ratePerHour) : "-";

      if (showSummary) {
        const summary = el("div", "sge-summary");
        summary.innerHTML = `
          <div class="sge-summary__stat"><div class="sge-summary__label">Overall</div><div class="sge-summary__value">${overallPct}%</div></div>
          <div class="sge-summary__stat"><div class="sge-summary__label">Done</div><div class="sge-summary__value sge-summary__value--green">${done}/${sorted.length}</div></div>
          <div class="sge-summary__stat"><div class="sge-summary__label">All done</div><div class="sge-summary__value sge-summary__value--amber">${fmtETA(totalNeeded / ratePerHour)}</div></div>
          <div class="sge-summary__stat"><div class="sge-summary__label">Next up</div><div class="sge-summary__value">${nearETA}</div></div>
        `;
        container.before(summary);
      }

      if (showRec && nearest) {
        const rec = el("div", "sge-rec");
        rec.innerHTML = `Focus on <strong>${nearest.name}</strong> which is ${nearETA} away.`;
        container.before(rec);
      }

      if (showSort) {
        const sortRow = el("div", "sge-sort");
        sortRow.appendChild(el("span", "sge-sort__label", "Sort"));
        [
          {key: "manual", label: "Manual"},
          {key: "closest", label: "Closest"},
          {key: "cheapest", label: "Cheapest"},
          {key: "expensive", label: "Expensive First"},
        ].forEach(({key, label}) => {
          sortRow.appendChild(mkSortBtn(label, key, () => currentSort, () => {currentSort = key as SortKey; refresh();}));
        });
        sortRow.appendChild(el("span", "sge-sort__divider"));
        sortRow.appendChild(el("span", "sge-sort__label", "ETA"));
        [
          {key: "individual", label: "Individual."},
          {key: "cumulative", label: "Cumulative."},
        ].forEach(({key, label}) => {
          sortRow.appendChild(mkSortBtn(label, key, () => currentMode, () => {currentMode = key as EtaMode; refresh();}));
        });
        if (currentSort === "manual") sortRow.appendChild(el("span", "sge-sort__drag-hint", "drag to reorder"));
        container.before(sortRow);
      }

      const rateDiv = el("div", "sge-rate");
      rateDiv.appendChild(el("span", "sge-rate__label", "Stardust / hr"));
      const inp = el("input", "sge-rate__input");
      Object.assign(inp, {type: "number", min: "1", max: "36", value: ratePerHour.toFixed(1), title: "Your Stardust rate"});
      inp.addEventListener("change", () => {
        ratePerHour = Math.max(1, parseFloat(inp.value) || 36);
        (inp as HTMLInputElement).value = ratePerHour.toFixed(1);
        try {
          chrome.storage.sync.get(["pluginConfig"], d => {
            const s = d.pluginConfig ?? {};
            s["shop-goals-enhanced"] = {...s["shop-goals-enhanced"], multiplier: String(ratePerHour)};
            sync({pluginConfig: s});
          });
        } catch (_) {}
        refresh();
      });
      rateDiv.appendChild(inp);
      rateDiv.appendChild(el("span", "sge-rate__unit", "/ hr"));
      container.after(rateDiv);
    }

    function refresh() {
      const section = qs(".discover-rail__section--wishlist");
      if (!section) return;
      const goals = parseGoals();
      if (!goals?.length) return;
      const sorted = sortGoals(goals, currentSort);
      reorderDOM(sorted);
      applyDraggable(sorted);
      annotateItems(sorted);
      applyHighlight(sorted);
      injectControls(section, sorted);
    }

    function tryMount() {
      if (qs(".discover-rail__section--wishlist .shop-goals__item")) {
        repositionWishlist();
        refresh();
      } else {
        mountTimer = setTimeout(tryMount, 500);
      }
    }
    tryMount();

    const observer = new MutationObserver(() => {
      const section = qs(".discover-rail__section--wishlist");
      if (!section) return;
      if (!section.querySelector(".sge-summary") && section.querySelector(".shop-goals__item")) {
        repositionWishlist();
        refresh();
      }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});

    const handleTurbo = () => {
      repositionWishlist();
      refresh();
    };
    document.addEventListener("turbo:load", handleTurbo);
    document.addEventListener("turbo:render", handleTurbo);

    if (showETA) etaTimer = setInterval(refresh, 60_000);

    return function cleanup() {
      clearTimeout(mountTimer);
      clearInterval(etaTimer);
      observer.disconnect();
      document.removeEventListener("turbo:load", handleTurbo);
      document.removeEventListener("turbo:render", handleTurbo);
      
      const wishlist = qs(".discover-rail__section--wishlist");
      if (wishlist && wishlistOriginalParent) {
        wishlistOriginalNextSibling ? wishlistOriginalParent.insertBefore(wishlist, wishlistOriginalNextSibling) : wishlistOriginalParent.appendChild(wishlist);
      }

      qsa(".shop-goals__item[draggable]").forEach(item => {
        item.removeAttribute("draggable");
        const h = item as HTMLElement;
        (["ondragstart", "ondragend", "ondragover", "ondragleave", "ondrop"] as const).forEach(ev => {h[ev] = null;});
        item.classList.remove("sge-dragging", "sge-drag-over");
        item.querySelectorAll("a, img").forEach((child: Element) => child.removeAttribute("draggable"));
      });

      qsa(".sge-summary, .sge-rec, .sge-sort, .sge-rate, .sge-item-footer").forEach(e => e.remove());
      qsa(".sge-nearest").forEach(e => e.classList.remove("sge-nearest"));
      qsa(".shop-goals__progress-fill[data-sge-orig-pct]").forEach(f => {
        const fill = f as HTMLElement;
        fill.style.width = fill.dataset["sgeOrigPct"] ?? "";
        delete fill.dataset["sgeOrigPct"];
      });
      qsa(".shop-goals__progress-fill[data-sge-orig-pct]").forEach(f => {
        const fill = f as HTMLElement;
        fill.style.width = fill.dataset["sgeOrigPct"] ?? "";
        delete fill.dataset["sgeOrigPct"];
      });
      qsa(".shop-goals__progress-text[data-sge-orig-dust]").forEach(t => {
        delete (t as HTMLElement).dataset["sgeOrigDust"];
      });
      style.remove();
    };
  }
});