export interface PluginConfigField {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  default?: string | boolean | number;
  placeholder?: string;
  options?: Array<string | {value: string; label: string}>;
  showIf?: {key: string; value: string};
  sub?: PluginConfigField[];
}

export interface PluginDefinition {
  id: string;
  name: string;
  description?: string;
  author?: string;
  config?: PluginConfigField[];
  start?: () => (() => void) | void;
}

export interface PluginEntry extends PluginDefinition {
  _active: boolean;
  _cleanup: (() => void) | null;
}

export type PluginManifestEntry = Pick<PluginDefinition, "id" | "name" | "description" | "author" | "config">;

export type PluginConfigMap = Record<string, Record<string, string | boolean | number>>;
export type PluginStateMap = Record<string, boolean>;

export interface ExterstellarAPI {
  register(plugin: PluginDefinition): void;
  getAll(): PluginEntry[];
  activate(id: string): void;
  deactivate(id: string): void;
  getConfig(id: string): Record<string, string | boolean | number>;
  loadConfigs(allConfigs: PluginConfigMap): void;
  _exports: Record<string, unknown>;
  getExport(id: string): unknown;
}

export interface RepoInfo {
  type: "github" | "gitlab";
  owner: string;
  repo: string;
}

export interface CommitSummary {
  shortSha: string;
  message: string;
  url: string;
}

export interface FetchCommitsOptions {
  since: string | null;
  until: string | null;
  branch: string;
  token: string;
  max: number;
}

export interface GoalItem {
  name: string;
  pct: number;
  dustNeeded: number;
  cost: number;
  elem: HTMLElement;
}

export type SortKey = "manual" | "closest" | "cheapest" | "expensive";
export type EtaMode = "individual" | "cumulative";

export interface ManagerSettings {
  fontSize?: string;
  width?: string;
}

export interface MgrFieldDef {
  key: keyof ManagerSettings;
  label: string;
  default: string;
  options: Array<{value: string; label: string}>;
  apply: (v: string) => void;
}

export interface ExportPayload {
  exterstellar: true;
  version: number;
  pluginStates: PluginStateMap;
  pluginConfig: PluginConfigMap;
  managerSettings: ManagerSettings;
}

export type CssVarMap = Record<string, string>;
export type FlavorMap = Record<string, CssVarMap>;