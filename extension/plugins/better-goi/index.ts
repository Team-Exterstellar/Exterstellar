export {};
declare const Exterstellar: import("../../types").ExterstellarAPI;

import GOI_CSS from "./css";
import { handleQueuePage, teardownQueueSearch } from "./modules/search";
import { handleReviewDetailPage } from "./modules/commits";
import { handleChartControls } from "./modules/chartControls";
import { handleDevlogReviewPanels } from "./modules/openAllCommits";
import { handleRandomProject } from "./modules/randProj";
import { handleWeeklyLeaderboardColumn } from "./modules/lbCol";
import {
  handleLeaderboardSorting,
  finalizeLeaderboardSortRestore,
} from "./modules/lbSort";
import { handleLeaderboardReplay } from "./modules/lbReplay";
import { handleApproveAllMissingVerdict } from "./modules/approveAllWithoutVerdict";
import {
  handleJustificationAutocomplete,
  teardownJustificationAutocomplete,
} from "./modules/autoGoipletion";
import { handleLinkHealthCheck, sweepPendingClaims } from "./modules/linkHealth";
import {
  handleSidebarToggleHotkey,
  teardownSidebarHotkey,
} from "./modules/sidebarHotkey";
import { handleGoisDeserveBetterGoals } from "./modules/goisDeserveBetterGoals";
import { handleBannedFilter } from "./modules/hideStinkyFraudsters";
import { handleLinkPanels } from "./modules/openAllLinks";
import { handleHardwareFilter } from "./modules/iAintNoHardwareGOI";
import { handleProjBtnHealthCheck } from "./modules/projsBTNHealhcheck";
import { handleQueueMultiSort } from "./modules/queueMultiSort";
import { disconnectTrackedObservers } from "./modules/cleanupRegistry";
import { teardownViewer } from "./modules/commitViewer";

if (sessionStorage.getItem("_ext_better-goi_pre") === "1") {
  const pre = document.createElement("style");
  pre.id = "exterstellar-better-goi";
  pre.textContent = GOI_CSS;
  document.documentElement.appendChild(pre);
}

Exterstellar.register({
  id: "better-goi",
  name: "Better GOI",
  description: "The GOI dash you always wanted! Cuz well you know it sucks",
  author: "Gizzy",
  config: [
    {
      key: "preload",
      label: "Preload CSS before paint",
      type: "checkbox",
      default: true,
    },
    {
      key: "swCookie",
      label: "SW Cookie (optional)",
      type: "text",
      placeholder: "...",
      default: "",
    },
    {
      key: "grp_leaderboard",
      label: "Leaderboard & Stats",
      sub: [
        {
          key: "rankChange",
          label: "Show rank change vs 7 days ago on leaderboard",
          type: "checkbox",
          default: true,
        },
        {
          key: "daysOnTop",
          label: "Show days spent as #1 reviewer on that day",
          type: "checkbox",
          default: true,
        },
        {
          key: "leaderboardHighlights",
          label: "Highlight top values and rank gains on the leaderboard",
          type: "checkbox",
          default: true,
        },
        {
          key: "leaderboardReplay",
          label: "Show a button to replay leaderboard rank changes over time",
          type: "checkbox",
          default: true,
        },
      ],
    },
    {
      key: "grp_reviews",
      label: "Reviews",
      sub: [
        {
          key: "git",
          label: "Show all git activity in review sidebar panel",
          type: "checkbox",
          default: true,
        },
        {
          key: "autoGoipletion",
          label:
            "Autocomplete justifications in reviews (learns from the justifications you write)",
          type: "checkbox",
          default: true,
          sub: [
            {
              key: "autoGoipletionGhostText",
              label:
                "Show inline ghost-text completion while typing justifications",
              type: "checkbox",
              default: true,
            },
            {
              key: "snippetInsert",
              label:
                "Type {commits}, {hours}, {approved}, {approvedMinutes}, {devlogs}, {lines} to insert live data (add All suffix for all devlogs, e.g. {commitsAll})",
              type: "checkbox",
              default: true,
            },
            {
              key: "autoGoipletionCommonPhrases",
              label:
                "Learn common phrases you repeat across many reviews and suggest them on their own (e.g. 'The commits all seem regular')",
              type: "checkbox",
              default: true,
            },
          ],
        },
        {
          key: "commitsButton",
          label: "Show 'Open all commits' button on devlog review panels",
          type: "checkbox",
          default: true,
        },
        {
          key: "grp_commitViewer",
          label: "In-Platform Commit Viewer (new)",
          sub: [
            {
              key: "githubToken",
              label: "GitHub PAT (optional, raises rate limit 60→5000/h)",
              type: "text",
              placeholder: "ghp_...",
              default: "",
            },
            {
              key: "gitlabToken",
              label: "GitLab PAT (optional, for ratelimits)",
              type: "text",
              placeholder: "glpat-...",
              default: "",
            },
            {
              key: "codebergToken",
              label: "Codeberg PAT (optional, for ratelimits)",
              type: "text",
              placeholder: "…",
              default: "",
            },
          ],
        },
        {
          key: "approveAllMissingVerdict",
          label:
            "Show 'Approve all missing verdict' link on incomplete-review error",
          type: "checkbox",
          default: true,
        },
        {
          key: "projBtnHealthCheck",
          label:
            "Check Repo/Demo/Readme buttons on reviews and mark dead ones red",
          type: "checkbox",
          default: true,
        },
        {
          key: "openAllLinksButton",
          label: "Opens all links needed to open like user's repositories, user's project repo and the demo of project.",
          type: "checkbox",
          default: true
        },
      ],
    },
    {
      key: "grp_queue",
      label: "Queue & UI",
      sub: [
        {
          key: "search",
          label: "Show a search bar",
          type: "checkbox",
          default: true,
        },
        {
          key: "graphs",
          label: "Show graph buttons such as Only show me",
          type: "checkbox",
          default: true,
        },
        {
          key: "randomProjectBTN",
          label: "Show 'Open a random project' button on the queue page",
          type: "checkbox",
          default: true,
        },
        {
          key: "sidebarToggleHotkey",
          label: "Press Tab to toggle the project details sidebar",
          type: "checkbox",
          default: true,
        },
        {
          key: "queueMultiSort",
          label: "Client-side multi-sort on queue table (Click header to sort, Shift+Click to add secondary sort)",
          type: "checkbox",
          default: true,
        },
        {
          key: "linkHealthCheck",
          label: "Check dash queue links for errors and disable broken ones",
          type: "checkbox",
          default: false,
        },
      ],
    },
    {
      key: "grp_goals",
      label: "Goals & Filtering",
      sub: [
        {
          key: "goisDeserveBetterGoals",
          label:
            "GOIs deserve better goals! Show how many more devlogs needed until goal meet. (Shop Goals Enhanced required",
          type: "checkbox",
          default: false,
        },
        {
          key: "hideBanned",
          label:
            "Hide project's with the certification integrity set to banned because fraudsters smell bad.",
          type: "checkbox",
          default: true,
        },
        {
          key: "hideHardware",
          label:
            "Hide hardware-type projects from the queue (iAintNoHardwareGOI).",
          type: "checkbox",
          default: true,
        },
      ],
    },
  ],
  start() {
    const cfg = Exterstellar.getConfig("better-goi");
    const isReviewPage = window.location.pathname.includes(
      "/admin/certification/review",
    );

    const preload = cfg.preload !== false && cfg.preload !== "false";
    sessionStorage.setItem("_ext_better-goi_pre", preload ? "1" : "0");
    let style = document.getElementById("exterstellar-better-goi");

    if (isReviewPage) {
      if (!style) {
        style = document.createElement("style");
        style.id = "exterstellar-better-goi";
        style.textContent = GOI_CSS;
      }
      document.head.appendChild(style);
    }

    const isQueueListPage = () =>
      /^\/admin\/certification\/review\/?$/.test(window.location.pathname);
    const isReviewDetailPage = () =>
      /^\/admin\/certification\/review\/[^/]+\/?$/.test(
        window.location.pathname,
      );

    const onTurboUpdate = () => {
      if (cfg.linkHealthCheck !== false && cfg.linkHealthCheck !== "false") void sweepPendingClaims();
      if (isQueueListPage()) {
        handleQueuePage(cfg);
        handleChartControls(cfg);
        handleRandomProject(cfg);
        handleLinkHealthCheck(cfg);
        handleLeaderboardSorting(cfg);
        handleWeeklyLeaderboardColumn(cfg).then(() => {
          finalizeLeaderboardSortRestore(cfg);
          handleLeaderboardReplay(cfg);
        });
        handleBannedFilter(cfg);
        handleHardwareFilter(cfg);
        handleQueueMultiSort(cfg);
      }
      if (isReviewDetailPage()) {
        handleReviewDetailPage(cfg);
        handleDevlogReviewPanels(cfg);
        handleApproveAllMissingVerdict(cfg);
        handleSidebarToggleHotkey(cfg);
        handleLinkPanels(cfg);
        handleProjBtnHealthCheck(cfg);
        void handleJustificationAutocomplete(cfg);
      }
      handleGoisDeserveBetterGoals(cfg, isQueueListPage());
    };

    document.addEventListener("turbo:load", onTurboUpdate);
    document.addEventListener("turbo:frame-load", onTurboUpdate);

    onTurboUpdate();

    return function cleanup() {
      teardownViewer();
      style?.remove();
      document.removeEventListener("turbo:load", onTurboUpdate);
      document.removeEventListener("turbo:frame-load", onTurboUpdate);
      teardownSidebarHotkey();
      document.querySelectorAll(".exterstellar-cv-overlay").forEach((n) => n.remove());
      document.body.style.overflow = "";
      document
        .querySelectorAll(
          [
            '[id^="exterstellar-better-goi-"]',
            "[data-exterstellar-random-project-btn]",
            ".exterstellar-better-goi-open-all-btn",
            ".exterstellar-better-goi-replay-wrapper",
          ].join(", "),
        )
        .forEach((n) => n.remove());
      document
        .querySelectorAll("a.exterstellar-better-goi-btn-broken")
        .forEach((b) => b.classList.remove("exterstellar-better-goi-btn-broken"));
      document
        .querySelectorAll("[data-exterstellar-btn-health-checked]")
        .forEach((el) => el.removeAttribute("data-exterstellar-btn-health-checked"));
      disconnectTrackedObservers();
      teardownJustificationAutocomplete();
      teardownQueueSearch();
    };
  },
});
