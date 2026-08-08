export {};
declare const Exterstellar: import("../../types").ExterstellarAPI;

import GOI_CSS from "./css";
import { handleQueuePage } from "./modules/search";
import { handleDevlogMarkdown } from "./modules/devlogMarkdown";
import { handleReviewDetailPage } from "./modules/commits";
import { handleChartControls } from "./modules/chartControls";
import { handleDevlogReviewPanels } from "./modules/openAllCommits";
import { handleRandomProject } from "./modules/randProj";
import { handleWeeklyStat } from "./modules/weeklyStat";
import { handleWeeklyLeaderboardColumn } from "./modules/lbCol";
import {
  handleLeaderboardSorting,
  finalizeLeaderboardSortRestore,
} from "./modules/lbSort";
import { handleLeaderboardReplay } from "./modules/lbReplay";
import { handleApproveAllMissingVerdict } from "./modules/approveAllWithoutVerdict";
import { handleIncremationProjectReviewed } from "./modules/projCounter";
import { handleLinkHealthCheck } from "./modules/linkHealth";
import { handleSidebarToggleHotkey, teardownSidebarHotkey } from "./modules/sidebarHotkey";

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
      key: "search",
      label: "Show a search bar",
      type: "checkbox",
      default: true,
    },
    {
      key: "git",
      label: "Show all git activity in review sidebar panel",
      type: "checkbox",
      default: true,
    },
    {
      key: "markdown",
      label: "Use extension's markdown support in reviews",
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
      key: "commitsButton",
      label: "Show 'Open all commits' button on devlog review panels",
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
      key: "weeklyStat",
      label: "Show your weekly devlog review count next to the goal",
      type: "checkbox",
      default: true,
    },
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
      key: "approveAllMissingVerdict",
      label:
        "Show 'Approve all missing verdict' link on incomplete-review error",
      type: "checkbox",
      default: true,
    },
    {
      key: "emojiSupport",
      label: "Render Slack emoji shortcodes in devlog markdown",
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
    {
      key: "projectsReviewedCounter",
      label:
        "Show the projects you have reviewed since plugin enabled and weekly projects reviewed!",
      type: "checkbox",
      default: true,
    },
    {
      key: "linkHealthCheck",
      label: "Check review links for errors and disable broken ones",
      type: "checkbox",
      default: true,
    },
  ],
  start() {
    const cfg = Exterstellar.getConfig("better-goi");
    console.log(cfg)
    const isReviewPage = window.location.pathname.includes(
      "/admin/certification/review",
    );
    if (!isReviewPage) return;

    const preload = cfg.preload !== false && cfg.preload !== "false";
    sessionStorage.setItem("_ext_better-goi_pre", preload ? "1" : "0");

    let style = document.getElementById("exterstellar-better-goi");
    console.log(GOI_CSS)
    if (!style) {
      style = document.createElement("style");
      style.id = "exterstellar-better-goi";
      style.textContent = GOI_CSS;
    }
    document.head.appendChild(style);

    const isQueueListPage = () =>
      /^\/admin\/certification\/review\/?$/.test(window.location.pathname);
    const isReviewDetailPage = () =>
      /^\/admin\/certification\/review\/[^/]+\/?$/.test(
        window.location.pathname,
      );

    const onTurboUpdate = () => {
      if (isQueueListPage()) {
        handleQueuePage(cfg);
        handleChartControls(cfg);
        handleRandomProject(cfg);
        handleWeeklyStat(cfg);
        handleLinkHealthCheck(cfg);
        handleLeaderboardSorting(cfg);
        handleWeeklyLeaderboardColumn(cfg).then(() => {
          finalizeLeaderboardSortRestore(cfg);
          handleLeaderboardReplay(cfg);
        });
      }
      if (isReviewDetailPage()) {
        handleReviewDetailPage(cfg);
        handleDevlogMarkdown(cfg);
        handleDevlogReviewPanels(cfg);
        handleApproveAllMissingVerdict(cfg);
        handleSidebarToggleHotkey(cfg);
      }
      handleIncremationProjectReviewed(cfg, isReviewDetailPage(), isQueueListPage())
    };

    document.addEventListener("turbo:load", onTurboUpdate);
    document.addEventListener("turbo:frame-load", onTurboUpdate);

    onTurboUpdate();

    return function cleanup() {
      style?.remove();
      document.removeEventListener("turbo:load", onTurboUpdate);
      document.removeEventListener("turbo:frame-load", onTurboUpdate);
      teardownSidebarHotkey();
      document.getElementById("exterstellar-better-goi-search")?.remove();
      document.getElementById("exterstellar-better-goi-chart-controls")?.remove();
    };
  },
});