export function getMyUsername(): string | null {
  const handleEl = document.querySelector<HTMLAnchorElement>(
    ".sidebar__user-meta-handle",
  );
  if (!handleEl) return null;
  const text = handleEl.textContent?.trim() ?? "";
  if (!text) return null;
  return text.replace(/^@/, "").toLowerCase();
}

function getSelector(canvas: HTMLCanvasElement) {
  if (canvas.id) return `#${canvas.id}`;
  const target = canvas.getAttribute(
    "data-certification--ysws--reviewer-chart-target",
  );
  return target
    ? `canvas[data-certification--ysws--reviewer-chart-target="${target}"]`
    : "canvas[data-certification--ysws--reviewer-chart-target]";
}

export async function getChartInstance(
  canvas: HTMLCanvasElement,
): Promise<any | null> {
  const selector = getSelector(canvas);

  const chartStuff = await chrome.runtime.sendMessage({
    type: "GET_CHART_INSTANCE",
    selector,
  });

  if (!chartStuff?.exists) return null;

  return {
    id: chartStuff.id,

    get data() {
      return chartStuff.data;
    },

    update: async () => {
      return chrome.runtime.sendMessage({
        type: "CHART_ACTION",
        selector,
        action: {
          type: "UPDATE",
        },
      });
    },

    destroy: async () => {
      return chrome.runtime.sendMessage({
        type: "CHART_ACTION",
        selector,
        action: {
          type: "DESTROY",
        },
      });
    },

    setDataset: async (dataset: number, data: any[]) => {
      return chrome.runtime.sendMessage({
        type: "CHART_ACTION",
        selector,
        action: {
          type: "SET_DATASET",
          dataset,
          data,
        },
      });
    },

    setDatasetVisibility: async (predicate: (label: string) => boolean) => {
      const datasets = chartStuff.data.datasets.map((d: any) =>
        (d.label ?? "").toLowerCase(),
      );

      return chrome.runtime.sendMessage({
        type: "CHART_ACTION",
        selector,
        action: {
          type: "SET_VISIBILITY",
          visibleIndexes: datasets
            .map((label: string, index: number) =>
              predicate(label) ? index : -1,
            )
            .filter((i: number) => i !== -1),
        },
      });
    },
  };
}

export async function setDatasetVisibility(
  chart: any,
  predicate: (label: string) => boolean,
) {
  if (typeof chart.setDatasetVisibility === "function") {
    return chart.setDatasetVisibility(predicate);
  }
}

export function findReviewerChartElements(): {
  canvas: HTMLCanvasElement;
  panel: Element;
} | null {
  const chartWrapper = document.querySelector(
    `.ysws-dashboard__chart[data-controller="certification--ysws--reviewer-chart"]`,
  );
  const canvas = chartWrapper?.querySelector<HTMLCanvasElement>(
    '[data-certification--ysws--reviewer-chart-target="canvas"]',
  );
  const panel = chartWrapper?.closest(".ysws-dashboard__panel--chart");

  if (canvas && panel) return { canvas, panel };
  return null;
}

export function extractPointValue(point: any): number {
  if (typeof point === "number") return point;
  if (point && typeof point.y === "number") return point.y;
  return 0;
}