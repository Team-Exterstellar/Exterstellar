export {};
declare const Exterstellar: import("../types").ExterstellarAPI;

Exterstellar.register({
  id: "frozen-notes-expand",
  name: "Frozen Notes Expand",
  description: "Makes internal note boxes in frozen devlogs resizable/expandable even when disabled.",
  start() {
    const style = document.createElement("style");
    style.id = "exterstellar-frozen-notes-expand";
    style.textContent = `
      /* Frozen wrappers sometimes block pointer events – re-enable for the review panel/notes */
      .devlog-item--frozen .devlog-review-panel,
      .devlog-review-group--frozen .devlog-review-panel {
        pointer-events: auto !important;
      }
      .devlog-item--frozen .devlog-review-panel .notes-textarea,
      .devlog-review-group--frozen .devlog-review-panel .notes-textarea,
      .devlog-item--frozen textarea.notes-textarea,
      .devlog-review-group--frozen textarea.notes-textarea,
      .devlog-item--frozen textarea[data-certification--ysws--devlog-review-target="notesTextarea"],
      .devlog-review-group--frozen textarea[data-certification--ysws--devlog-review-target="notesTextarea"] {
        pointer-events: auto !important;
        user-select: text !important;
      }

      /* Disabled frozen notes: allow interaction for resize/selection */
      .devlog-item--frozen textarea.notes-textarea:disabled,
      .devlog-item.devlog-item--frozen textarea.notes-textarea:disabled,
      .devlog-review-group--frozen textarea.notes-textarea:disabled,
      .devlog-item--frozen textarea[data-certification--ysws--devlog-review-target="notesTextarea"]:disabled,
      .devlog-review-group--frozen textarea[data-certification--ysws--devlog-review-target="notesTextarea"]:disabled {
        resize: vertical !important;
        overflow-y: auto !important;
        pointer-events: auto !important;
        user-select: text !important;
        cursor: text !important;
        opacity: 1 !important;
      }

      /* Converted disabled -> readonly keeps ability to resize & select but not edit */
      textarea.notes-textarea[data-exterstellar-frozen-notes="1"],
      textarea[data-certification--ysws--devlog-review-target="notesTextarea"][data-exterstellar-frozen-notes="1"] {
        resize: vertical !important;
        overflow-y: auto !important;
        pointer-events: auto !important;
        user-select: text !important;
        cursor: text !important;
        min-height: 60px !important;
        max-height: 70vh !important;
        opacity: 1 !important;
      }

      /* If a disabled fieldset is used to freeze, ensure our readout textarea still interactive */
      fieldset[data-exterstellar-frozen-fieldset="1"] {
        pointer-events: auto !important;
      }
      fieldset[data-exterstellar-frozen-fieldset="1"] textarea[data-exterstellar-frozen-notes="1"] {
        pointer-events: auto !important;
      }

      /* Frozen pseudo-element overlays often block hit-testing */
      .devlog-item--frozen::before,
      .devlog-item--frozen::after,
      .devlog-review-group--frozen::before,
      .devlog-review-group--frozen::after {
        pointer-events: none !important;
      }
      .devlog-item--frozen textarea[data-exterstellar-frozen-notes="1"],
      .devlog-review-group--frozen textarea[data-exterstellar-frozen-notes="1"] {
        position: relative !important;
        z-index: 2 !important;
      }
    `;
    const injectStyle = () => {
      if (!document.getElementById("exterstellar-frozen-notes-expand")) {
        (document.head ?? document.documentElement).appendChild(style);
      }
    };
    injectStyle();
    document.addEventListener("DOMContentLoaded", injectStyle, { once: true });

    function autoSize(ta: HTMLTextAreaElement): void {
      const prevHeight = ta.style.height;
      ta.style.height = "auto";
      const max = Math.floor(window.innerHeight * 0.7);
      const desired = ta.scrollHeight + 2;
      if (desired > ta.clientHeight) {
        ta.style.height = Math.min(desired, max) + "px";
      } else if (desired > 60 && ta.clientHeight < 60) {
        ta.style.height = Math.min(Math.max(desired, 60), max) + "px";
      } else {
        if (ta.scrollHeight < 60) {
          ta.style.height = "60px";
        } else {
          ta.style.height = Math.min(desired, max) + "px";
        }
      }
      if (ta.style.height === prevHeight) return;
    }

    function isNotesTextarea(ta: HTMLTextAreaElement): boolean {
      return (
        ta.classList.contains("notes-textarea") ||
        ta.getAttribute("data-certification--ysws--devlog-review-target") === "notesTextarea" ||
        ta.matches('textarea[placeholder="notes..."]') ||
        !!ta.closest(".devlog-review-panel")
      );
    }

    function isEffectivelyDisabled(ta: HTMLTextAreaElement): boolean {
      try {
        return ta.disabled || ta.matches(":disabled");
      } catch {
        return ta.disabled;
      }
    }

    function freeFromFieldset(ta: HTMLTextAreaElement): HTMLElement | null {
      const fs = ta.closest("fieldset:disabled, fieldset[disabled]") as HTMLFieldSetElement | null;
      if (!fs) return null;
      if (fs.dataset.exterstellarFrozenFieldset === "1") return fs;
      fs.dataset.exterstellarFrozenFieldset = "1";
      const wasDisabled = fs.disabled;
      if (wasDisabled) {
        fs.disabled = false;
        const controls = fs.querySelectorAll<HTMLElement>("button, input, select, textarea");
        controls.forEach((el) => {
          if (el === ta) return;
          if ((el as HTMLTextAreaElement).dataset?.exterstellarFrozenNotes === "1") return;
          if (!(el as any).dataset.exterstellarFieldsetReDisabled) {
            (el as any).dataset.exterstellarFieldsetReDisabled = "1";
            (el as HTMLButtonElement).disabled = true;
          }
        });
      }
      return fs;
    }

    function freeFromInert(ta: HTMLTextAreaElement): void {
      let cur: HTMLElement | null = ta as unknown as HTMLElement;
      while (cur) {
        if (cur.hasAttribute("inert")) {
          if (!cur.dataset.exterstellarWasInert) cur.dataset.exterstellarWasInert = "1";
          cur.removeAttribute("inert");
          (cur as any).inert = false;
        }
        cur = cur.parentElement;
        if (cur?.classList.contains("devlog-item--frozen") || cur?.classList.contains("devlog-review-group--frozen")) {
          if (cur.hasAttribute("inert")) {
            if (!cur.dataset.exterstellarWasInert) cur.dataset.exterstellarWasInert = "1";
            cur.removeAttribute("inert");
            (cur as any).inert = false;
          }
          break;
        }
      }
      if ((ta as any).inert) (ta as any).inert = false;
      ta.removeAttribute("inert");
    }

    function enhance(ta: HTMLTextAreaElement): void {
      if (ta.dataset.exterstellarFrozenNotes === "1") {
        autoSize(ta);
        return;
      }

      const frozenRoot =
        ta.closest(".devlog-item--frozen") ?? ta.closest(".devlog-review-group--frozen");
      if (!frozenRoot) return;
      if (!isNotesTextarea(ta)) return;
      if (!isEffectivelyDisabled(ta)) return;

      (frozenRoot as HTMLElement).style.pointerEvents = "auto";
      const panel = ta.closest(".devlog-review-panel") as HTMLElement | null;
      if (panel) panel.style.pointerEvents = "auto";

      freeFromInert(ta);
      freeFromFieldset(ta);

      ta.dataset.exterstellarWasDisabled = "1";
      ta.removeAttribute("disabled");
      ta.disabled = false;
      ta.removeAttribute("aria-disabled");
      (ta as any).inert = false;
      ta.readOnly = true;
      ta.dataset.exterstellarFrozenNotes = "1";
      ta.setAttribute("data-exterstellar-frozen-notes", "1");
      ta.style.pointerEvents = "auto";
      ta.style.resize = "vertical";
      ta.style.overflowY = "auto";
      ta.style.cursor = "text";
      ta.style.userSelect = "text";
      if (!ta.hasAttribute("tabindex")) ta.tabIndex = 0;
      requestAnimationFrame(() => autoSize(ta));
    }

    function scan(root: ParentNode): void {
      const frozenRoots = root instanceof Element && root.matches(".devlog-item--frozen, .devlog-review-group--frozen")
        ? [root]
        : Array.from(root.querySelectorAll(".devlog-item--frozen, .devlog-review-group--frozen"));
      if (root === document) {
        document.querySelectorAll(".devlog-item--frozen, .devlog-review-group--frozen").forEach((r) => {
          if (!frozenRoots.includes(r)) frozenRoots.push(r);
        });
      }

      for (const fr of frozenRoots) {
        fr.querySelectorAll<HTMLTextAreaElement>(
          'textarea.notes-textarea, textarea[data-certification--ysws--devlog-review-target="notesTextarea"], textarea[placeholder="notes..."]'
        ).forEach((ta) => {
          if (isEffectivelyDisabled(ta)) enhance(ta);
        });
        fr.querySelectorAll<HTMLTextAreaElement>("textarea:disabled").forEach((ta) => {
          if (isNotesTextarea(ta)) enhance(ta);
        });
      }

      (root as Element).querySelectorAll?.(
        'textarea.notes-textarea[data-exterstellar-frozen-notes="1"]'
      ).forEach((el) => autoSize(el as HTMLTextAreaElement));
      if (root === document) {
        document
          .querySelectorAll<HTMLTextAreaElement>('textarea[data-exterstellar-frozen-notes="1"]')
          .forEach(autoSize);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => scan(document), { once: true });
    } else {
      scan(document);
    }
    setTimeout(() => scan(document), 500);
    setTimeout(() => scan(document), 1500);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          const target = m.target as HTMLElement;
          if (target instanceof HTMLTextAreaElement) {
            if (isEffectivelyDisabled(target) && target.closest(".devlog-item--frozen, .devlog-review-group--frozen")) {
              enhance(target);
            }
          } else if (
            target.matches?.(".devlog-item--frozen, .devlog-review-group--frozen, .devlog-review-panel, fieldset")
          ) {
            scan(target);
          }
          if (target instanceof HTMLFieldSetElement && target.disabled) {
            scan(target);
          }
          continue;
        }
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node instanceof HTMLTextAreaElement) {
            if (node.closest(".devlog-item--frozen, .devlog-review-group--frozen")) {
              if (isEffectivelyDisabled(node)) enhance(node);
            }
          } else {
            scan(node);
            if (node.matches?.(".devlog-item--frozen, .devlog-review-group--frozen")) {
              scan(node);
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "inert", "aria-disabled", "class"],
      attributeOldValue: false,
    });

    const onTurbo = () => scan(document);
    document.addEventListener("turbo:load", onTurbo);
    document.addEventListener("turbo:frame-load", onTurbo);
    document.addEventListener("turbo:render", onTurbo as EventListener);

    const onWindowResize = () => {
      document
        .querySelectorAll<HTMLTextAreaElement>('textarea[data-exterstellar-frozen-notes="1"]')
        .forEach(autoSize);
    };
    window.addEventListener("resize", onWindowResize);

    return function cleanup() {
      observer.disconnect();
      document.removeEventListener("turbo:load", onTurbo);
      document.removeEventListener("turbo:frame-load", onTurbo);
      document.removeEventListener("turbo:render", onTurbo as EventListener);
      window.removeEventListener("resize", onWindowResize);
      style.remove();
      document
        .querySelectorAll<HTMLTextAreaElement>('textarea[data-exterstellar-frozen-notes="1"]')
        .forEach((ta) => {
          if (ta.dataset.exterstellarWasDisabled === "1") {
            ta.readOnly = false;
            ta.disabled = true;
            delete ta.dataset.exterstellarWasDisabled;
          }
          delete ta.dataset.exterstellarFrozenNotes;
          ta.removeAttribute("data-exterstellar-frozen-notes");
          ta.style.pointerEvents = "";
          ta.style.resize = "";
          ta.style.overflowY = "";
          ta.style.cursor = "";
          ta.style.userSelect = "";
          ta.style.height = "";
          if (ta.getAttribute("tabindex") === "0") ta.removeAttribute("tabindex");
        });
      document.querySelectorAll<HTMLElement>("[data-exterstellar-frozen-fieldset]").forEach((fs) => {
        (fs as HTMLFieldSetElement).disabled = true;
        delete (fs as any).dataset.exterstellarFrozenFieldset;
        fs.removeAttribute("data-exterstellar-frozen-fieldset");
      });
      document.querySelectorAll<HTMLElement>("[data-exterstellar-fieldset-re-disabled]").forEach((el) => {
        (el as HTMLButtonElement).disabled = false;
        delete (el as any).dataset.exterstellarFieldsetReDisabled;
        el.removeAttribute("data-exterstellar-fieldset-re-disabled");
      });
      document.querySelectorAll<HTMLElement>("[data-exterstellar-was-inert]").forEach((el) => {
        el.setAttribute("inert", "");
        (el as any).inert = true;
        delete (el as any).dataset.exterstellarWasInert;
        el.removeAttribute("data-exterstellar-was-inert");
      });
      document.querySelectorAll<HTMLElement>(".devlog-item--frozen, .devlog-review-group--frozen").forEach((el) => {
        (el as HTMLElement).style.pointerEvents = "";
      });
      document.querySelectorAll<HTMLElement>(".devlog-review-panel").forEach((el) => {
        if ((el as HTMLElement).style.pointerEvents === "auto") (el as HTMLElement).style.pointerEvents = "";
      });
    };
  },
});
