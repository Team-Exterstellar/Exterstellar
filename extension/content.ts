import type { PluginConfigMap, PluginManifestEntry, PluginStateMap } from "./types";

declare const Exterstellar: import("./types").ExterstellarAPI;

let _activeStates: PluginStateMap = {};

chrome.storage.sync.get(["pluginStates", "pluginConfig"], async (data) => {
  let states: PluginStateMap = data["pluginStates"] ?? {};
  const configs: PluginConfigMap = data["pluginConfig"] ?? {};
  if (states["frozen-notes-expand"] === undefined) {
    states = { ...states, "frozen-notes-expand": true };
    chrome.storage.sync.set({ pluginStates: states });
  }
  _activeStates = {...states};

  Exterstellar.loadConfigs(configs);

  const all = Exterstellar.getAll();
  const manifest: PluginManifestEntry[] = all.map(({id, name, description, author, config}) => ({
    id,
    name,
    ...(description !== undefined && {description}),
    ...(author !== undefined && {author}),
    ...(config !== undefined && {config}),
  }));

  try {
    await chrome.storage.local.set({pluginManifest: manifest});
  } catch (err) {
    throw new Error("[Exterstellar | Plugin Registrar] Failed to write plugin manifest to session: " + (err instanceof Error ? err.message : String(err)));
  }

  chrome.storage.sync.get(["stardanceVisited", "onboardingDone"], flagData => {
    if (!flagData["stardanceVisited"]) chrome.storage.sync.set({["stardanceVisited"]: true});
    if (!flagData["onboardingDone"]) showPopupNudge();
  });

  Exterstellar._exports = {};

  for (const plugin of all) {
    if (states[plugin.id] === true) Exterstellar.activate(plugin.id);
  }

  for (const plugin of all) {
    if (states[plugin.id] !== true) {
      document.getElementById(`exterstellar-${plugin.id}`)?.remove();
      sessionStorage.removeItem(`_ext_${plugin.id}_pre`);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes["pluginConfig"]) {
      const newConfigs: PluginConfigMap = changes["pluginConfig"].newValue ?? {};
      Exterstellar.loadConfigs(newConfigs);
      const oldConfigs: PluginConfigMap = changes["pluginConfig"].oldValue ?? {};

      for (const plugin of Exterstellar.getAll()) {
        if (!_activeStates[plugin.id]) continue;
        if (JSON.stringify(oldConfigs[plugin.id] ?? {}) === JSON.stringify(newConfigs[plugin.id] ?? {})) continue;
        Exterstellar.deactivate(plugin.id);
        Exterstellar.activate(plugin.id);
      }
    }

    if (changes["pluginStates"]) {
      const newStates: PluginStateMap = changes["pluginStates"].newValue ?? {};
      for (const plugin of Exterstellar.getAll()) {
        const wasOn = _activeStates[plugin.id] === true;
        const isOn = newStates[plugin.id] === true;
        if (wasOn === isOn) continue;

        if (isOn) {
          Exterstellar.activate(plugin.id);
        } else {
          Exterstellar.deactivate(plugin.id);
          delete Exterstellar._exports[plugin.id];
          document.getElementById(`exterstellar-${plugin.id}`)?.remove();
          sessionStorage.removeItem(`_ext_${plugin.id}_pre`);
        }
      }
      _activeStates = {...newStates};
    }
  });
});

function showPopupNudge(): void {
  const nudge = document.createElement("div");
  nudge.id = "exterstellar-popup-nudge";
  nudge.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info-icon lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
    <span>
      <strong>Exterstellar is installed!</strong>
      Open your <strong>Extensions menu</strong> (usually on the top right) and click on Exterstellar. After you do so, you should finish setup.
    </span>
    <button id="exterstellar-nudge-dismiss" title="Dismiss"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
  `;

  const s = document.createElement("style");
  s.textContent = `
    #exterstellar-popup-nudge {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #a3a3a3;
      border-radius: 10px;
      font-family: "Exo 2", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      max-width: 340px;
    }
      
    #exterstellar-popup-nudge strong {color: #fff;}

    #exterstellar-popup-nudge > svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    #exterstellar-nudge-dismiss {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      font-size: 14px;
      flex-shrink: 0;
      padding: 0 2px;
      line-height: 1;
    }

    #exterstellar-nudge-dismiss:hover {color: #f4f4f5;}
  `;
  document.head.appendChild(s);
  document.body.appendChild(nudge);

  nudge.querySelector("#exterstellar-nudge-dismiss")?.addEventListener("click", () => nudge.remove());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes["onboardingDone"]?.newValue) nudge.remove();
  });
}