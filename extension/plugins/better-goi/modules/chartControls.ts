import type { Cfg } from "./types";
import {
  getMyUsername,
  getChartInstance,
  setDatasetVisibility,
  findReviewerChartElements,
} from "../utils/chartUtils";

function injectChartControls(panel: Element, canvas: HTMLCanvasElement) {
  if (document.getElementById("exterstellar-better-goi-chart-controls")) return;

  const heading = panel.querySelector(".ysws-dashboard__heading");
  if (!heading) return;

  const wrapper = document.createElement("div");
  wrapper.id = "exterstellar-better-goi-chart-controls";
  wrapper.classList.add("exterstellar-better-goi-chart-controls");

  const onlyMeBtn = document.createElement("button");
  onlyMeBtn.type = "button";
  onlyMeBtn.textContent = "Only show me";
  onlyMeBtn.classList.add("exterstellar-better-goi-chart-button");
  onlyMeBtn.addEventListener("click", async () => {
    const username = getMyUsername();
    const chart = await getChartInstance(canvas);
    if (!username || !chart) return;
    await setDatasetVisibility(chart, (label) => {
      return label === username;
    });
  });

  const showAllBtn = document.createElement("button");
  showAllBtn.type = "button";
  showAllBtn.textContent = "Show all";
  showAllBtn.classList.add("exterstellar-better-goi-chart-button");
  showAllBtn.addEventListener("click", async () => {
    const chart = await getChartInstance(canvas);
    if (!chart) return;
    await setDatasetVisibility(chart, () => true);
  });

  wrapper.appendChild(onlyMeBtn);
  wrapper.appendChild(showAllBtn);
  heading.insertAdjacentElement("afterend", wrapper);
}

export function handleChartControls(cfg: Cfg) {
  if (document.getElementById("exterstellar-better-goi-chart-controls")) return;
  if (cfg.graphs == false || cfg.graphs === "false") return;
  let attempts = 0;
  const tryInject = () => {
    const found = findReviewerChartElements();
    if (found) {
      injectChartControls(found.panel, found.canvas);
      return;
    }
    attempts += 1;
    if (attempts < 20) requestAnimationFrame(tryInject);
  };

  tryInject();
}