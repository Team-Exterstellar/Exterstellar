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
`;

export default GOI_CSS;