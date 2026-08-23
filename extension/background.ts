async function setCookieRuleImpl(cookieValue: string) {
  const rule: chrome.declarativeNetRequest.Rule = {
    id: 1,
    priority: 1,
    condition: {
      urlFilter: "https://ds.shipwrights.dev/*", // match your real target
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
    },
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: [
        {
          header: "cookie",
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          value: cookieValue,
        },
      ],
    },
  };

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [rule],
  });
}

async function handleSWDashLinksImpl(id: string, swCookie: string) {
  await setCookieRuleImpl(swCookie);
  const res = await fetch(
    `https://ds.shipwrights.dev/api/v1/workplaces/stardance/certifications/${id}`,
  );
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: true, data };
}

async function resizeImage(url: string, width: number, height: number) {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`http error!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx!.drawImage(bitmap, 0, 0, width, height);
    
    const resizedBlob = await canvas.convertToBlob({ type: "image/png" });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(resizedBlob);
    });
  } catch (error) {
    console.error("resizing image failed i crave for help at scripts/background.js ", error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (
    (msg.type === "GET_CHART_INSTANCE" || msg.type === "CHART_ACTION") &&
    _sender.tab?.id
  ) {
    chrome.scripting
      .executeScript({
        target: {
          tabId: _sender.tab.id,
        },
        world: "MAIN",
        func: (selector, action) => {
          const canvas = document.querySelector(selector);

          if (!(canvas instanceof HTMLCanvasElement)) {
            return { error: "canvas not found" };
          }

          const Chart = (window as any).Chart;
          const chart = Chart?.getChart(canvas);

          if (!chart) {
            return { error: "chart not found" };
          }

          if (!action || action.type === "GET") {
            return {
              exists: true,
              id: chart.id,
              data: {
                labels: chart.data.labels,
                datasets: chart.data.datasets.map((d: any) => ({
                  label: d.label,
                  data: d.data,
                })),
              },
            };
          }

          switch (action.type) {
            case "UPDATE":
              chart.update();
              return { success: true };

            case "DESTROY":
              chart.destroy();
              return { success: true };

            case "SET_DATASET":
              chart.data.datasets[action.dataset].data = action.data;
              chart.update();
              return { success: true };

            case "SET_VISIBILITY": {
              const visibleIndexes = new Set(action.visibleIndexes);

              chart.data.datasets.forEach((_dataset: any, index: number) => {
                chart.setDatasetVisibility(index, visibleIndexes.has(index));
              });

              chart.update();

              return {
                success: true,
              };
            }

            default:
              return {
                error: "unknown action",
              };
          }
        },
        args: [msg.selector, msg.action ?? { type: "GET" }],
      })
      .then(([result]) => {
        sendResponse(result!.result);
      });

    return true;
  }

  if (msg.type === "FETCH_SW_CERT") {
    handleSWDashLinksImpl(msg.id, msg.swCookie).then(sendResponse);
    return true;
  }

  if (msg.type === "OPEN_TABS") {
    const urls = Array.isArray(msg.urls) ? (msg.urls as unknown[]) : [];
    for (const url of urls) {
      if (typeof url === "string" && url) {
        chrome.tabs.create({ url, active: false });
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_SLACK_EMOJIS") {
    const cacheKey = "slack_emoji_cache";
    chrome.storage.local.get([cacheKey]).then(async (result) => {
      const now = Date.now();
      const cached = result[cacheKey];
      if (cached && now - cached.timestamp < 86400000) {
        // one day
        return sendResponse({ ok: true, emoji: cached.data });
      }

      try {
        const response = await fetch("https://cachet.dunkirk.sh/emojis");
        const data = await response.json();
        const emojiMap: Record<string, string> = {};
        data.forEach(
          (emoji: {
            type: string;
            id: string;
            name: string;
            alias: string | null;
            imageUrl: string;
            expiration: string;
          }) => {
            if (emoji.imageUrl) emojiMap[emoji.name] = emoji.imageUrl;
          },
        );
        await chrome.storage.local.set({
          [cacheKey]: { data: emojiMap, timestamp: now },
        });

        sendResponse({ ok: true, emoji: emojiMap });
      } catch (error) {
        if (cached) {
          sendResponse({ ok: true, emoji: cached.data, stale: true });
        } else {
          sendResponse({ ok: false, error: (error as any).message });
        }
      }
    });
    return true;
  } else if (msg.type === "RESIZE_EMOJI") {
    resizeImage(msg.url, 24, 24)
      .then((base64) => {
        sendResponse({ ok: true, dataUri: base64 });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (msg?.type !== "ext_lp_fetch") return false;

  const url: string = msg.url;
  fetch(url, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(6000),
  })
    .then(async (r) => {
      if (!r.ok) {
        sendResponse({ ok: false });
        return;
      }
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) {
        sendResponse({ ok: false });
        return;
      }
      const html = await r.text();
      sendResponse({ ok: true, html });
    })
    .catch((err) => {
      console.warn("[Exterstellar | link-preview SW] fetch failed:", err);
      sendResponse({ ok: false, error: String(err) });
    });

  return true;
});