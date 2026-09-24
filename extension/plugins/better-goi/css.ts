const GOI_CSS = `
  .exterstellar-better-goi-search-wrapper {
    position: relative;
    margin-bottom: 10px;
  }

  .exterstellar-better-goi-search {
      width: 100%;
      height: 39px;
      padding: 0 38px 0 34px;
      border: 2px solid var(--color-border-input);
      border-radius: var(--profile-radius);
      background: var(--color-set-2-bg);
      color: var(--color-space-text);
      font-family: var(--font-family-text);
      font-size: var(--font-size-s);
  }

  .exterstellar-better-goi-search--not-approved {
    border-color: #f87171 !important;
  }

  .exterstellar-better-goi-search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: white;
    pointer-events: none;
  }

  .exterstellar-better-goi-chart-controls {
    display: flex;
    gap: 8px;
    margin: 8px 0 12px;
  }

  .exterstellar-better-goi-chart-button {
    padding: 6px 12px;
    border: 2px solid var(--color-border-input);
    border-radius: var(--profile-radius);
    background: var(--color-set-2-bg);
    color: var(--color-space-text);
    font-family: var(--font-family-text);
    font-size: var(--font-size-s);
    cursor: pointer;
  }

  .exterstellar-better-goi-chart-button:hover {
    filter: brightness(1.1);
  }

  .exterstellar-better-goi-review-commit-details {
    color: var(--color-space-text-muted);
    font-style: italic;
  }

  .exterstellar-better-goi-commits-list {
    max-height: 350px;
    overflow-y: auto;
  }

  body::-webkit-scrollbar {
    width: 12px;
    background: rgba(0, 0, 0, 0.3);
  }

  body::-webkit-scrollbar-track {
    width: 12px;
    background:  rgba(5, 4, 24, 0.02);
  }

  body::-webkit-scrollbar-thumb {
    width: 12px;
    background: rgba(0, 0, 0, 0.3);
  }

  body::-webkit-scrollbar-thumb:hover {
    width: 12px;
  }

  .certification-ysws .review-detail-right.is-popup-mode {
    overflow-y: scroll;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .certification-ysws .review-detail-right.is-popup-mode::-webkit-scrollbar {
    display: none;
  }

  .exterstellar-better-goi-commits-window-btn {
    width: 100%;
    margin-bottom: 10px;
    background: var(--color-space-surface-strong);
    color: var(--color-space-text-muted) !important;
  }

  .exterstellar-better-goi-commits-window-btn:hover:not(:disabled) {
    background: var(--color-brand-mint);
    color: var(--color-set-1-bg) !important;
  }

  .ysws-dashboard__reviewer-link--on-pace {
     color: var(--color-set-1-bg) !important;
  }

  .exterstellar-better-goi-commits-window-btn:disabled {
    opacity: .6;
    cursor: not-allowed;
  }

  .exterstellar-random-project-btn {
    display: inline-flex;
    align-items: center;
    align-self: flex-end;
    padding: .375rem .75rem;
    min-height: 2rem;
    padding-inline: var(--space-s);
    background: var(--color-set-1-bg);
    border: 2px solid var(--color-set-1-fg-secondary);
    border-radius: var(--profile-radius);
    color: var(--color-space-text) !important;
    font-size: var(--font-size-s);
    font-weight: 700;
    text-decoration: none;
  }

  .exterstellar-random-project-btn:hover {
    background: hsla(0, 0%, 100%, .06);
    border-color: var(--color-brand-highlight);
    color: var(--color-brand-highlight);
    text-decoration: none;
    cursor: pointer;
  }

  .ysws-dashboard__panel--chart {
    display: flex;
    flex-direction: column;
  }

  .exterstellar-better-goi-sortable-th {
    cursor: pointer;
    user-select: none;
  }

  .exterstellar-better-goi-sortable-th:hover {
    color: var(--color-brand-highlight);
  }

  .exterstellar-better-goi-sort-indicator {
    font-size: 0.75em;
    opacity: 0.8;
  }

  .exterstellar-better-goi-approve-all-link {
    color: inherit;
    text-decoration: underline;
    font-weight: 600;
    cursor: pointer;
  }

  .exterstellar-better-goi-approve-all-link:hover {
    opacity: 0.85;
  }

  .exterstellar-better-goi-emoji {
    width: 20px;
    height: 20px;
    vertical-align: middle;
    display: inline-block;
  }

  .exterstellar-better-goi-top-value {
    color: var(--color-brand-highlight) !important;
    font-weight: 700;
  }

  .ysws-dashboard__row--on-pace .exterstellar-better-goi-top-value {
    color: var(--color-set-1-bg) !important;
  }

  .exterstellar-better-goi-rank-gain {
    color: var(--color-brand-highlight) !important;
    font-weight: 700;
  }

  .ysws-dashboard__row--on-pace .exterstellar-better-goi-rank-gain {
    color: var(--color-set-1-bg) !important;
  }

  .exterstellar-better-goi-replay-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: 8px 0 12px;
  }

  .exterstellar-better-goi-replay-date {
    color: var(--color-space-text-muted);
    font-size: var(--font-size-s);
  }

  .exterstellar-better-goi-replay-active tr {
    transition: transform 0.3s ease;
  }

  .exterstellar-better-goi-week-stats {
    display: flex;
    align-items: baseline;
    align-self: flex-end;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    background: var(--color-set-1-bg);
    border: 2px solid var(--color-set-1-fg-secondary);
    border-radius: var(--profile-radius);
  }

  .exterstellar-better-goi-broken-link {
    opacity: 0.5;
  }

  .exterstellar-better-goi-btn-broken {
    color: #e5484d !important;
    border-color: #e5484d !important;
  }

  /* Inline "ghost text" suggestion: a cloned <textarea> (see
     autoGoipletion.ts) is placed behind the real one with a faint
     text color; the real textarea's background is made transparent so the
     clone's completion shows through. No extra CSS needed here — styling is
     copied from the real textarea at runtime. */

  .exterstellar-better-goi-justif-dd {
    position: absolute;
    z-index: 999999;
    background: var(--color-set-1-bg, #16122b);
    border: 2px solid var(--color-border-input, rgba(255, 255, 255, 0.15));
    border-radius: var(--profile-radius, 8px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    overflow-y: auto;
    max-height: 240px;
  }

  .exterstellar-better-goi-justif-item {
    padding: 8px 10px;
    cursor: pointer;
    color: var(--color-space-text, #fff);
    font-size: var(--font-size-s, 13px);
    font-family: var(--font-family-text, sans-serif);
  }

  .exterstellar-better-goi-justif-item:hover,
  .exterstellar-better-goi-justif-item--sel {
    background: hsla(0, 0%, 100%, 0.08);
  }

  .exterstellar-better-goi-justif-item--sel {
    outline: 1px solid var(--color-brand-highlight, #7fd4a8);
  }

  .exterstellar-better-goi-justif-item-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exterstellar-better-goi-justif-item-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 2px;
    font-size: 11px;
    color: var(--color-space-text-muted, rgba(255, 255, 255, 0.5));
  }

  .exterstellar-better-goi-justif-badge {
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 0 4px;
    font-size: 10px;
    text-transform: uppercase;
  }

  .exterstellar-better-goi-justif-hint {
    padding: 4px 10px 6px;
    font-size: 10px;
    color: var(--color-space-text-muted, rgba(255, 255, 255, 0.5));
    border-top: 1px solid hsla(0, 0%, 100%, 0.08);
  }

  .exterstellar-better-goi-justif-hint kbd {
    display: inline-block;
    padding: 0 4px;
    border: 1px solid hsla(0, 0%, 100%, 0.25);
    border-radius: 4px;
    font-family: inherit;
    font-size: 10px;
  }

  .exterstellar-queue-sort-hint {
    font-size: 12px;
    color: var(--color-space-text-muted, rgba(255,255,255,0.6));
    margin: 6px 0 8px;
    padding: 6px 10px;
    border: 1px dashed var(--color-border-input, rgba(255,255,255,0.15));
    border-radius: 6px;
    background: var(--color-set-2-bg, rgba(255,255,255,0.03));
  }
  .exterstellar-queue-sort-hint--fade {
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
  }

  /* Commit Viewer — centered modal, follows stardance theming like other modules */
  .exterstellar-cv-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(5, 4, 24, 0.55);
    backdrop-filter: blur(4px);
    font-family: var(--font-family-text, sans-serif);
    color: var(--color-space-text, #cdd6f4);
  }
  .exterstellar-cv-modal {
    width: min(980px, 94vw);
    height: min(88vh, 900px);
    max-height: min(88vh, 900px);
    display: flex;
    flex-direction: column;
    background: var(--color-set-2-bg, #1e1e2e);
    border: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.08));
    border-radius: var(--profile-radius, 10px);
    box-shadow: 0 16px 40px rgba(0,0,0,0.45);
    overflow: hidden;
  }
  .exterstellar-cv-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.08));
    background: var(--color-set-1-bg, #16122b);
  }
  .exterstellar-cv-topbar h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .exterstellar-cv-topbar small {
    color: var(--color-space-text-muted, #bac2debf);
    font-size: 13px;
    white-space: nowrap;
  }
  .exterstellar-cv-btn {
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.08));
    background: var(--color-space-bg, #181825);
    color: var(--color-space-text, #cdd6f4);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .exterstellar-cv-btn:hover { border-color: var(--color-space-accent, #cba6f7); }
  .exterstellar-cv-btn:disabled { opacity: .4; cursor: not-allowed; }
  .exterstellar-cv-btn--primary {
    background: var(--color-space-accent, #cba6f7);
    color: var(--color-space-bg, #181825);
    border-color: var(--color-space-accent, #cba6f7);
  }
  .exterstellar-cv-btn--primary:hover { opacity: .9; }
  .exterstellar-cv-btn--ghost { background: transparent; border-color: transparent; font-size: 16px; padding: 2px 6px; }
  .exterstellar-cv-mainrow {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .exterstellar-cv-sidebar {
    width: 220px;
    min-width: 180px;
    max-width: 260px;
    flex-shrink: 0;
    overflow: auto;
    background: var(--color-set-1-bg, #16122b);
    border-right: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.08));
    padding: 6px 0;
    font-size: 13px;
  }
  .exterstellar-cv-sidebar-title {
    padding: 4px 10px 6px;
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--color-space-text-muted);
  }
  .exterstellar-cv-sidebar-commit {
    padding: 6px 10px 4px;
    font-weight: 600;
    font-size: 13px;
    color: var(--color-space-text);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-left: 2px solid transparent;
  }
  .exterstellar-cv-sidebar-commit:hover { background: rgba(255,255,255,.04); }
  .exterstellar-cv-sidebar-commit--active { border-left-color: var(--color-space-accent, #cba6f7); background: rgba(203,166,247,.08); }
  .exterstellar-cv-sidebar-file {
    padding: 2px 10px 2px 20px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-space-text-muted);
    font-size: 13px;
  }
  .exterstellar-cv-sidebar-file:hover { color: var(--color-space-text); background: rgba(255,255,255,.04); }
  .exterstellar-cv-sidebar-file--active { color: var(--color-space-text); background: rgba(255,255,255,.06); }
  .exterstellar-cv-sidebar-empty { padding: 8px 10px; color: var(--color-space-text-muted); font-size: 13px; font-style: italic; }
  .exterstellar-cv-body {
    flex: 1;
    min-width: 0;
    overflow: auto;
    background: var(--color-set-2-bg, #1e1e2e);
    padding: 0;
  }
  .exterstellar-cv-commits { display: none; }
  .exterstellar-cv-commit {
    border-bottom: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.06));
  }
  .exterstellar-cv-commit:last-child { border-bottom: none; }
  .exterstellar-cv-commit-head {
    padding: 10px 14px 6px;
    background: var(--color-set-1-bg, #16122b);
    border-bottom: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.06));
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .exterstellar-cv-commit-msg {
    font-weight: 700;
    font-size: 14px;
    line-height: 1.4;
    color: var(--color-space-text, #cdd6f4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .exterstellar-cv-commit-meta {
    font-size: 13px;
    color: var(--color-space-text-muted, #bac2debf);
    margin-top: 2px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .exterstellar-cv-commit-meta a { color: var(--color-space-accent, #cba6f7); text-decoration: none; }
  .exterstellar-cv-commit-meta a:hover { text-decoration: underline; }
  .exterstellar-cv-fileblock {
    border-bottom: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.04));
  }
  .exterstellar-cv-fileblock:last-child { border-bottom: none; }
  .exterstellar-cv-filehead {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255,255,255,0.03);
    font-size: 13px;
    user-select: none;
  }
  .exterstellar-cv-badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    border: 1px solid transparent;
  }
  .exterstellar-cv-badge--modified { background: rgba(205,214,244,0.08); color: var(--color-space-text-muted); border-color: rgba(255,255,255,0.08); }
  .exterstellar-cv-badge--added { background: rgba(166,227,161,0.14); color: #a6e3a1; border-color: rgba(166,227,161,0.2); }
  .exterstellar-cv-badge--deleted { background: rgba(243,139,168,0.14); color: #f38ba8; border-color: rgba(243,139,168,0.2); }
  .exterstellar-cv-badge--renamed { background: rgba(249,226,175,0.14); color: #f9e2af; border-color: rgba(249,226,175,0.2); }
  .exterstellar-cv-stats { color: var(--color-space-text-muted); font-size: 13px; margin-left: auto; }
  .exterstellar-cv-patch {
    margin: 0;
    padding: 8px 12px;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    background: var(--color-space-bg, #181825);
  }
  .exterstellar-cv-line--add { background: rgba(166,227,161,0.10); }
  .exterstellar-cv-line--del { background: rgba(243,139,168,0.12); }
  .exterstellar-cv-line--hunk { color: var(--color-space-text-muted); background: rgba(255,255,255,0.04); }
  .exterstellar-cv-line--ctx { color: var(--color-space-text, #cdd6f4); }
  .exterstellar-cv-tok-kw { color: #cba6f7; font-weight: 600; }
  .exterstellar-cv-tok-str { color: #a6e3a1; }
  .exterstellar-cv-tok-com { color: #6c7086; font-style: italic; }
  .exterstellar-cv-tok-num { color: #fab387; }
  .exterstellar-cv-tok-fn { color: #89b4fa; }
  .exterstellar-cv-tok-type { color: #f9e2af; }
  .exterstellar-cv-ln { user-select: none; opacity: .35; display: inline-block; min-width: 28px; text-align: right; padding-right: 10px; font-size: 12.5px; }
  .exterstellar-cv-empty {
    padding: 18px 14px;
    text-align: center;
    color: var(--color-space-text-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .exterstellar-cv-empty a { color: var(--color-space-accent, #cba6f7); }
  .exterstellar-cv-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-top: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.08));
    background: var(--color-set-1-bg, #16122b);
    font-size: 13px;
    color: var(--color-space-text-muted);
  }
  .exterstellar-cv-footer kbd {
    display: inline-block;
    padding: 0 4px;
    border: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.15));
    border-radius: 4px;
    font-family: inherit;
    font-size: 12px;
    background: var(--color-space-bg, #181825);
  }
  /* devlog panel buttons — compact, not huge */
  .exterstellar-cv-wrap {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    width: 100%;
  }
  .exterstellar-cv-wrap .exterstellar-better-goi-commits-window-btn {
    width: auto;
    margin-bottom: 0;
    flex: 1 1 0;
    padding: 4px 8px;
    font-size: 11px;
    line-height: 1.2;
    min-height: 0;
  }
  .exterstellar-cv-wrap .exterstellar-better-goi-commits-window-btn--secondary {
    flex: 0 0 auto;
    opacity: .85;
  }
  @media (max-width: 640px) {
    .exterstellar-cv-modal { width: 96vw; max-height: 88vh; }
    .exterstellar-cv-mainrow { flex-direction: column; }
    .exterstellar-cv-sidebar {
      width: auto;
      max-width: none;
      max-height: 140px;
      border-right: none;
      border-bottom: 1px solid var(--color-space-surface-faint, rgba(255,255,255,0.08));
    }
  }
`;

export default GOI_CSS;
