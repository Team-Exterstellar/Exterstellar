import type { CommitDiff, CommitDiffFile } from "../../../types";
import type { Cfg } from "./types";

type ViewerCommit = {
  hash: string;
  message: string;
  author: string;
  date: string;
  url: string;
};

type ExtFetchOkJson = { ok: true; data: unknown; headers: Record<string, string>; contentType: string; status: number };
type ExtFetchOkText = { ok: true; text: string; headers: Record<string, string>; contentType: string; status: number };
type ExtFetchFail = { ok: false; status?: number; statusText?: string; error?: string; body?: string; text?: string; contentType?: string; headers?: Record<string, string> };
type ExtFetchResp = ExtFetchOkJson | ExtFetchOkText | ExtFetchFail;

function bgFetch(url: string, headers: Record<string, string> = {}, expect: "json"|"text"|"html" = "json", timeout = 15000): Promise<ExtFetchResp> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "ext_fetch", url, headers, expect, timeout }, (resp: ExtFetchResp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message } as ExtFetchFail);
      else resolve(resp ?? { ok: false, error: "no response" } as ExtFetchFail);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function splitUnifiedDiff(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  const parts = raw.split(/^diff --git /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const full = "diff --git " + part;
    const m = full.match(/^diff --git a\/(.+?) b\/(.+?)\s*$/m) || full.match(/^\+\+\+ b\/(.+?)\s*$/m);
    const filename = m ? (m[2] ?? m[1] ?? "").trim() : "";
    if (!filename) continue;
    // Use b-side name as key
    map.set(filename, full.trim());
  }
  // Fallback: if split produced nothing but raw has @@ hunks, store as single
  if (map.size === 0 && raw.includes("@@")) {
    map.set("__single", raw.trim());
  }
  return map;
}

function countPatchStats(patch: string): { adds: number; dels: number } {
  let adds = 0, dels = 0;
  for (const l of patch.split("\n")) {
    if (l.startsWith("+") && !l.startsWith("+++")) adds++;
    else if (l.startsWith("-") && !l.startsWith("---")) dels++;
  }
  return { adds, dels };
}

function isWhitespaceOnlyPatch(patch: string): boolean {
  let adds: string[] = [];
  let dels: string[] = [];
  let inHunk = false;
  for (const l of patch.split("\n")) {
    if (l.startsWith("@@")) { inHunk = true; continue; }
    if (!inHunk || l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("+")) adds.push(l.slice(1).replace(/\s+/g, ""));
    else if (l.startsWith("-")) dels.push(l.slice(1).replace(/\s+/g, ""));
  }
  if (adds.length !== dels.length) return false;
  const sortKey = (arr: string[]) => arr.slice().sort().join("\u0001");
  return sortKey(adds) === sortKey(dels);
}

function isBinaryLike(filename: string, patch?: string): boolean {
  if (patch && /Binary files .* differ/.test(patch)) return true;
  const lower = filename.toLowerCase();
  const binExt = [".png",".jpg",".jpeg",".gif",".webp",".ico",".bmp",".tiff",".pdf",".zip",".tar",".gz",".bz2",".7z",".rar",".mp3",".mp4",".mov",".avi",".mkv",".woff",".woff2",".ttf",".otf",".eot",".exe",".bin",".o",".so",".dll",".class",".pyc",".jar",".a",".lib",".DS_Store"];
  return binExt.some(ext => lower.endsWith(ext));
}

function inferPlatform(repoUrl: string): "github"|"gitlab"|"codeberg"|"gitea"|"tangled"|"unknown" {
  try {
    const u = new URL(repoUrl);
    const host = u.hostname;
    if (host === "github.com") return "github";
    if (host === "gitlab.com") return "gitlab";
    if (host === "codeberg.org") return "codeberg";
    if (host.endsWith("tangled.sh") || host.endsWith("tangled.org") || repoUrl.includes("tangled.sh") || repoUrl.includes("tangled.org")) return "tangled";
    // self-hosted gitea-like detected later, treat as gitea generically
    return "gitea";
  } catch { return "unknown"; }
}

async function detectGiteaLikeOrigin(repoUrl: string): Promise<string | null> {
  let origin: string;
  try { origin = new URL(repoUrl).origin; } catch { return null; }
  try {
    const r = await bgFetch(`${origin}/api/v1/version`, {}, "json", 6000);
    if (r.ok && (r as ExtFetchOkJson).data && typeof ((r as ExtFetchOkJson).data as {version?: unknown}).version === "string") return origin;
  } catch {}
  return null;
}

function parseGiteaRepo(repoUrl: string): { origin: string; owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const origin = u.origin;
    const m = repoUrl.match(/\/([^/]+)\/([^/#.]+?)(?:\.git)?\/?$/);
    if (!m) return null;
    const [, owner, repo] = m;
    if (!owner || !repo) return null;
    return { origin, owner, repo };
  } catch { return null; }
}

function parseGithubRepo(repoUrl: string): { owner: string; repo: string } | null {
  const m = repoUrl.match(/github\.com\/([^/]+)\/([^/#.]+)/);
  if (!m) return null;
  const [, owner, repo] = m;
  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/,"") };
}

function parseGitlabRepo(repoUrl: string): { projectPath: string } | null {
  const m = repoUrl.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
  if (!m) return null;
  const projectPath = m[1];
  if (!projectPath) return null;
  return { projectPath };
}

function parseCodebergRepo(repoUrl: string): { owner: string; repo: string } | null {
  const m = repoUrl.match(/codeberg\.org\/([^/]+)\/([^/#.]+)/);
  if (!m) return null;
  const [, owner, repo] = m;
  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/,"") };
}

// ---------- per-platform diff fetch (public-first, optional token) ----------

async function fetchGithubDiff(repoUrl: string, sha: string, token?: string): Promise<CommitDiff> {
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) throw new Error("Invalid GitHub URL");
  const { owner, repo } = parsed;
  const headers: Record<string,string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
  const r = await bgFetch(url, headers, "json");
  if (!r.ok) {
    const status = (r as ExtFetchFail).status;
    const body = (r as ExtFetchFail).body ?? (r as ExtFetchFail).text ?? "";
    // Try unauth .diff fallback for public repos if auth failed or rate-limited
    if (status === 403 || status === 401 || status === 429) {
      const raw = await bgFetch(`https://github.com/${owner}/${repo}/commit/${sha}.diff`, {}, "text");
      if (raw.ok && (raw as ExtFetchOkText).text) {
        const rawText = (raw as ExtFetchOkText).text;
        const byFile = splitUnifiedDiff(rawText);
        const files: CommitDiffFile[] = Array.from(byFile.entries()).map(([fn, patch]) => {
          const { adds, dels } = countPatchStats(patch);
          return { filename: fn, status: "modified", additions: adds, deletions: dels, changes: adds+dels, patch, binary: false };
        });
        return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`https://github.com/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files, rawDiff: rawText };
      }
    }
    const msg = status === 404 ? "Commit not found or private (check repo visibility)" : `GitHub ${status}: ${body.slice(0,200)}`;
    return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`https://github.com/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files:[], error: msg, isPrivate: status===404 };
  }
  const j = (r as ExtFetchOkJson).data as {
    sha: string; html_url: string; commit:{message:string; author:{name:string; date:string}}; stats?:{additions:number; deletions:number; total:number};
    files?: Array<{filename:string; status:string; additions:number; deletions:number; changes:number; patch?:string; blob_url?:string; previous_filename?:string}>;
  };
  const files: CommitDiffFile[] = (j.files ?? []).map(f => {
    const patchMissing = f.patch === undefined;
    const binary = patchMissing ? isBinaryLike(f.filename, undefined) : isBinaryLike(f.filename, f.patch);
    // if patch missing but not binary, mark as tooLarge so UI shows "too large / view on host" not "binary"
    const obj: CommitDiffFile = {
      filename: f.filename,
      status: (f.status as CommitDiffFile["status"]) ?? "modified",
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      changes: f.changes ?? 0,
      binary,
    };
    if (!binary && patchMissing) obj.tooLarge = true;
    if (f.previous_filename) obj.previousFilename = f.previous_filename;
    if (f.patch !== undefined) obj.patch = f.patch;
    if (f.blob_url) obj.blobUrl = f.blob_url;
    return obj;
  });
  return { sha: j.sha ?? sha, shortSha: (j.sha ?? sha).slice(0,7), message: j.commit?.message ?? "", author: j.commit?.author?.name ?? "", date: j.commit?.author?.date ?? "", url: j.html_url ?? `https://github.com/${owner}/${repo}/commit/${sha}`, stats: j.stats ?? {additions:0,deletions:0,total:0}, files };
}

async function fetchGitlabDiff(repoUrl: string, sha: string, token?: string): Promise<CommitDiff> {
  const parsed = parseGitlabRepo(repoUrl);
  if (!parsed) throw new Error("Invalid GitLab URL");
  const { projectPath } = parsed;
  const enc = encodeURIComponent(projectPath);
  const headers: Record<string,string> = {};
  if (token) headers["PRIVATE-TOKEN"] = token;
  const metaR = await bgFetch(`https://gitlab.com/api/v4/projects/${enc}/repository/commits/${sha}`, headers, "json");
  const diffR = await bgFetch(`https://gitlab.com/api/v4/projects/${enc}/repository/commits/${sha}/diff`, headers, "json");
  if (!diffR.ok) {
    const status = (diffR as ExtFetchFail).status;
    // fallback to web .diff
    const raw = await bgFetch(`https://gitlab.com/${projectPath}/-/commit/${sha}.diff`, {}, "text");
    if (raw.ok && (raw as ExtFetchOkText).text) {
      const rawText = (raw as ExtFetchOkText).text;
      const byFile = splitUnifiedDiff(rawText);
      const files: CommitDiffFile[] = Array.from(byFile.entries()).map(([fn, patch]) => {
        const { adds, dels } = countPatchStats(patch);
        return { filename: fn, status:"modified", additions:adds, deletions:dels, changes:adds+dels, patch, binary:false };
      });
      const meta = metaR.ok ? (metaR as ExtFetchOkJson).data as {message?:string; author_name?:string; created_at?:string; web_url?:string; short_id?:string} : null;
      return { sha, shortSha: sha.slice(0,7), message: meta?.message ?? "", author: meta?.author_name ?? "", date: meta?.created_at ?? "", url: meta?.web_url ?? `https://gitlab.com/${projectPath}/-/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files, rawDiff: rawText };
    }
    return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`https://gitlab.com/${projectPath}/-/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files:[], error: status===404?"Private or not found":"GitLab error "+status, isPrivate: status===404 };
  }
  const diffs = (diffR as ExtFetchOkJson).data as Array<{diff:string; new_path:string; old_path:string; new_file:boolean; renamed_file:boolean; deleted_file:boolean; too_large?:boolean}>;
  const meta2 = metaR.ok ? (metaR as ExtFetchOkJson).data as {id:string; short_id:string; title:string; message:string; author_name:string; created_at:string; web_url:string; stats?:{additions:number; deletions:number; total:number}} : null;
  const files: CommitDiffFile[] = diffs.map(d => {
    const { adds, dels } = countPatchStats(d.diff ?? "");
    const status: CommitDiffFile["status"] = d.new_file ? "added" : d.deleted_file ? "deleted" : d.renamed_file ? "renamed" : "modified";
    const hasDiff = !!d.diff && d.diff.trim().length > 0;
    const binary = hasDiff ? isBinaryLike(d.new_path, d.diff) : isBinaryLike(d.new_path);
    const obj: CommitDiffFile = { filename: d.new_path, status, additions:adds, deletions:dels, changes:adds+dels, binary: binary && !hasDiff };
    if (d.old_path !== d.new_path && d.old_path) obj.previousFilename = d.old_path;
    if (d.diff) { obj.patch = d.diff; obj.rawDiff = d.diff; }
    if (d.too_large || (!hasDiff && !binary)) obj.tooLarge = true;
    if (!hasDiff && !binary) obj.binary = false;
    return obj;
  });
  return { sha: meta2?.id ?? sha, shortSha: (meta2?.short_id ?? sha.slice(0,7)), message: meta2?.message ?? meta2?.title ?? "", author: meta2?.author_name ?? "", date: meta2?.created_at ?? "", url: meta2?.web_url ?? `https://gitlab.com/${projectPath}/-/commit/${sha}`, stats: meta2?.stats ?? {additions:0,deletions:0,total:0}, files };
}

async function fetchGiteaLikeDiff(repoUrl: string, sha: string, token?: string): Promise<CommitDiff> {
  const parsed = parseGiteaRepo(repoUrl);
  if (!parsed) throw new Error("Invalid repo URL");
  const { origin, owner, repo } = parsed;
  // Try self-hosted token via optional per-origin map (cfg passed as single token or json)
  const headers: Record<string,string> = {};
  if (token) headers.Authorization = `token ${token}`;
  const metaR = await bgFetch(`${origin}/api/v1/repos/${owner}/${repo}/git/commits/${sha}?files=true&stat=true&verification=false`, headers, "json");
  if (!metaR.ok) {
    const status = (metaR as ExtFetchFail).status;
    // try web .diff as fallback
    const rawWeb = await bgFetch(`${origin}/${owner}/${repo}/commit/${sha}.diff`, {}, "text");
    if (rawWeb.ok && (rawWeb as ExtFetchOkText).text) {
      const rawText = (rawWeb as ExtFetchOkText).text;
      const byFile = splitUnifiedDiff(rawText);
      const files: CommitDiffFile[] = Array.from(byFile.entries()).map(([fn, patch]) => {
        const { adds, dels } = countPatchStats(patch);
        return { filename: fn, status:"modified", additions:adds, deletions:dels, changes:adds+dels, patch, binary:false };
      });
      return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`${origin}/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files: files.length?files:[{filename:"(raw)", status:"modified", additions:0, deletions:0, changes:0, patch: rawText}], rawDiff: rawText };
    }
    return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`${origin}/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files:[], error: status===404?"Private or not found (owner must make repo public)":"Gitea error "+status, isPrivate: status===404 };
  }
  const j = (metaR as ExtFetchOkJson).data as {
    sha:string; html_url:string; commit:{message:string; author:{name:string; date:string}};
    stats?:{additions:number; deletions:number; total:number};
    files?: Array<{filename:string; status:string}>;
  };
  // Second fetch for per-file patches via raw diff
  const rawR = await bgFetch(`${origin}/api/v1/repos/${owner}/${repo}/git/commits/${sha}.diff`, headers, "text");
  let byFile = new Map<string,string>();
  let rawText = "";
  if (rawR.ok) {
    rawText = (rawR as ExtFetchOkText).text ?? "";
    byFile = splitUnifiedDiff(rawText);
  } else {
    // fallback try web
    const rawWeb2 = await bgFetch(`${origin}/${owner}/${repo}/commit/${sha}.diff`, {}, "text");
    if (rawWeb2.ok) { rawText = (rawWeb2 as ExtFetchOkText).text ?? ""; byFile = splitUnifiedDiff(rawText); }
  }
  const files: CommitDiffFile[] = (j.files ?? []).map(f => {
    const _patch = byFile.get(f.filename) ?? (byFile.get("__single")?.includes(f.filename) ? byFile.get("__single") : undefined);
    const stats = _patch ? countPatchStats(_patch) : { adds:0, dels:0 };
    const isBin = isBinaryLike(f.filename, _patch);
    const obj: CommitDiffFile = { filename: f.filename, status: (f.status as CommitDiffFile["status"]) ?? "modified", additions: stats.adds, deletions: stats.dels, changes: stats.adds+stats.dels, binary: isBin };
    if (_patch && !isBin) { obj.patch = _patch; obj.rawDiff = _patch; obj.binary = false; }
    else if (_patch && isBin) { obj.patch = _patch; obj.rawDiff = _patch; }
    else if (!_patch && rawText && !isBin) { obj.tooLarge = true; obj.binary = false; }
    return obj;
  });
  // If files empty but raw exists, create synthetic
  if (files.length===0 && rawText) {
    for (const [fn, patch] of byFile.entries()) {
      if (fn==="__single") continue;
      const { adds, dels } = countPatchStats(patch);
      files.push({ filename: fn, status:"modified", additions:adds, deletions:dels, changes:adds+dels, patch, binary:false });
    }
    if (files.length===0) files.push({ filename:"(raw diff)", status:"modified", additions:0, deletions:0, changes:0, patch: rawText.slice(0, 500_000), binary:false });
  }
  return { sha: j.sha ?? sha, shortSha: (j.sha ?? sha).slice(0,7), message: j.commit?.message ?? "", author: j.commit?.author?.name ?? "", date: j.commit?.author?.date ?? "", url: j.html_url ?? `${origin}/${owner}/${repo}/commit/${sha}`, stats: j.stats ?? {additions:0,deletions:0,total:0}, files, rawDiff: rawText };
}

async function fetchTangledDiff(repoUrl: string, sha: string): Promise<CommitDiff> {
  let origin = "";
  let owner = "";
  let repo = "";
  try {
    const u = new URL(repoUrl);
    origin = u.origin;
    const m = repoUrl.match(/tangled\.(?:sh|org)\/([^/]+)\/([^/#.]+)/);
    if (m) { owner = m[1] ?? ""; repo = m[2] ?? ""; }
    else {
      const parts = u.pathname.split("/").filter(Boolean);
      owner = parts[0] ?? ""; repo = (parts[1] ?? "").replace(/\.git$/,"");
    }
  } catch {}
  if (!origin || !owner || !repo) return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url: repoUrl, stats:{additions:0,deletions:0,total:0}, files:[], error:"Invalid Tangled URL" };
  // Try raw .diff first (public)
  const rawR = await bgFetch(`${origin}/${owner}/${repo}/commit/${sha}.diff`, {}, "text");
  if (rawR.ok && (rawR as ExtFetchOkText).text && ((rawR as ExtFetchOkText).contentType ?? "").includes("text/plain")) {
    const rawText = (rawR as ExtFetchOkText).text;
    const byFile = splitUnifiedDiff(rawText);
    const _files: CommitDiffFile[] = [];
    for (const [fn, patch] of byFile.entries()) {
      if (fn === "__single") continue;
      const { adds, dels } = countPatchStats(patch);
      _files.push({ filename: fn, status: "modified", additions: adds, deletions: dels, changes: adds+dels, patch, binary: false });
    }
    const files: CommitDiffFile[] = _files;
    if (files.length) return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`${origin}/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files, rawDiff: rawText };
    // Single-file raw fallback
    return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`${origin}/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files:[{filename:"(raw)", status:"modified", additions:0, deletions:0, changes:0, patch: rawText.slice(0,500_000)}], rawDiff: rawText };
  }
  // HTML scrape via background
  const htmlR = await bgFetch(`${origin}/${owner}/${repo}/commit/${sha}`, { Accept: "text/html" }, "html");
  if (!htmlR.ok) {
    return { sha, shortSha: sha.slice(0,7), message:"", author:"", date:"", url:`${origin}/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files:[], error:"Tangled commit not found or private", isPrivate: true };
  }
  const html = (htmlR as ExtFetchOkText).text;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Heuristic: each <pre> holds a hunk, closest file header
  const pres = Array.from(doc.querySelectorAll("pre"));
  const files: CommitDiffFile[] = [];
  for (const pre of pres) {
    const txt = pre.textContent ?? "";
    if (!txt.includes("@@") && txt.length < 20) continue;
    // Try to find sibling file name
    let filename = "unknown";
    const container = pre.closest("div, section, li") ?? pre.parentElement;
    if (container) {
      const cand = container.querySelector("[data-file], [data-filename]")?.getAttribute("data-file") ?? container.querySelector("a[href*='/blob/']")?.textContent?.trim() ?? "";
      if (cand) filename = cand.split("/").pop() ?? cand;
    }
    // De-duplicate: if multiple pres for same file, merge
    const existing = files.find(f => f.filename===filename);
    if (existing && existing.patch) existing.patch += "\n" + txt;
    else {
      const { adds, dels } = countPatchStats(txt);
      files.push({ filename: `${filename} #${files.length+1}`, status:"modified", additions:adds, deletions:dels, changes:adds+dels, patch: txt, binary:false });
    }
  }
  // If still empty, try to extract diff from raw text inside html
  if (files.length===0) {
    const bodyText = doc.body?.textContent ?? "";
    if (bodyText.includes("@@")) {
      const byFile = splitUnifiedDiff(bodyText);
      for (const [fn, patch] of byFile.entries()) {
        if (fn==="__single") continue;
        const { adds, dels } = countPatchStats(patch);
        files.push({ filename: fn, status:"modified", additions:adds, deletions:dels, changes:adds+dels, patch, binary:false });
      }
    }
  }
  const title = doc.querySelector("h1, h2")?.textContent?.trim() ?? "";
  return { sha, shortSha: sha.slice(0,7), message: title, author:"", date:"", url:`${origin}/${owner}/${repo}/commit/${sha}`, stats:{additions:0,deletions:0,total:0}, files: files.length?files:[{filename:"(no diff extracted)", status:"modified", additions:0, deletions:0, changes:0, patch: html.slice(0,2000)}] };
}

// ---------- router ----------

function getTokens(cfg: Cfg): { github?: string; gitlab?: string; codeberg?: string } {
  const _g = String(cfg.githubToken ?? (cfg as Record<string,unknown>)["ghToken"] ?? (cfg as Record<string,unknown>)["github_token"] ?? "").trim();
  const _gl = String(cfg.gitlabToken ?? (cfg as Record<string,unknown>)["glToken"] ?? "").trim();
  const _cb = String(cfg.codebergToken ?? cfg.giteaToken ?? (cfg as Record<string,unknown>)["codeberg_token"] ?? "").trim();
  const out: { github?: string; gitlab?: string; codeberg?: string } = {};
  if (_g) out.github = _g;
  if (_gl) out.gitlab = _gl;
  if (_cb) out.codeberg = _cb;
  return out;
}

export async function fetchCommitDiff(repoUrl: string, sha: string, cfg: Cfg): Promise<CommitDiff> {
  const tokens = getTokens(cfg);
  const platform = inferPlatform(repoUrl);

  if (platform === "github") return fetchGithubDiff(repoUrl, sha, tokens.github);
  if (platform === "gitlab") return fetchGitlabDiff(repoUrl, sha, tokens.gitlab);
  if (platform === "codeberg") {
    const parsed = parseCodebergRepo(repoUrl);
    if (parsed) {
      const origin = "https://codeberg.org";
      return fetchGiteaLikeDiff(`${origin}/${parsed.owner}/${parsed.repo}`, sha, tokens.codeberg);
    }
  }
  if (platform === "tangled") return fetchTangledDiff(repoUrl, sha);

  // gitea / self-hosted -> unauth only (reviewers don't have tokens)
  const giteaOrigin = await detectGiteaLikeOrigin(repoUrl);
  if (giteaOrigin) {
    return fetchGiteaLikeDiff(repoUrl, sha, undefined);
  }
  // Fallback: try gitea-like anyway unauth
  return fetchGiteaLikeDiff(repoUrl, sha, undefined);
}

// ---------- viewer overlay ----------

let activeOverlay: HTMLElement | null = null;
let activeKeyHandler: ((e: KeyboardEvent)=>void) | null = null;
let cachedCfg: Cfg | null = null;

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

function formatDate(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
}

function createSpan(className: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}

function findClosingQuote(code: string, start: number, quote: string): number {
  let j = start + 1;
  while (j < code.length) {
    if (code[j] === quote && code[j - 1] !== "\\") return j;
    j++;
  }
  return code.length - 1;
}

function appendWithHighlights(frag: DocumentFragment, text: string): void {
  const combined = /\b(const|let|var|function|class|import|export|from|if|else|for|while|return|async|await|try|catch|finally|throw|new|extends|implements|interface|type|enum|switch|case|break|continue|default|yield|static|public|private|protected|get|set|typeof|instanceof|in|of|do|struct|fn|pub|mod|use|where|match|self|super)\b|\b\d+\.?\d*\b|\b[A-Z][A-Za-z0-9_]*\b/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > lastIdx) frag.append(document.createTextNode(text.slice(lastIdx, m.index)));
    const token = m[0];
    const isKw = /^(const|let|var|function|class|import|export|from|if|else|for|while|return|async|await|try|catch|finally|throw|new|extends|implements|interface|type|enum|switch|case|break|continue|default|yield|static|public|private|protected|get|set|typeof|instanceof|in|of|do|struct|fn|pub|mod|use|where|match|self|super)$/.test(token);
    const isNum = /^\d+\.?\d*$/.test(token);
    const cls = isKw ? "exterstellar-cv-tok-kw" : isNum ? "exterstellar-cv-tok-num" : "exterstellar-cv-tok-type";
    frag.append(createSpan(cls, token));
    lastIdx = combined.lastIndex;
  }
  if (lastIdx < text.length) frag.append(document.createTextNode(text.slice(lastIdx)));
}

function highlightToFragment(code: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    // strings
    if (ch === '"') {
      const end = findClosingQuote(code, i, '"');
      const txt = code.slice(i, end + 1);
      frag.append(createSpan("exterstellar-cv-tok-str", txt));
      i = end + 1;
      continue;
    }
    if (ch === "'") {
      const end = findClosingQuote(code, i, "'");
      const txt = code.slice(i, end + 1);
      frag.append(createSpan("exterstellar-cv-tok-str", txt));
      i = end + 1;
      continue;
    }
    if (ch === "`") {
      const end = code.indexOf("`", i + 1);
      const endIdx = end === -1 ? code.length - 1 : end;
      const txt = code.slice(i, endIdx + 1);
      frag.append(createSpan("exterstellar-cv-tok-str", txt));
      i = endIdx + 1;
      continue;
    }
    if (code.startsWith("//", i)) {
      const nl = code.indexOf("\n", i);
      const end = nl === -1 ? code.length : nl;
      const txt = code.slice(i, end);
      frag.append(createSpan("exterstellar-cv-tok-com", txt));
      i = end;
      continue;
    }
    if (code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i + 2);
      const endIdx = end === -1 ? code.length : end + 2;
      const txt = code.slice(i, endIdx);
      frag.append(createSpan("exterstellar-cv-tok-com", txt));
      i = endIdx;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(code[i - 1] ?? ""))) {
      const nl = code.indexOf("\n", i);
      const end = nl === -1 ? code.length : nl;
      const txt = code.slice(i, end);
      frag.append(createSpan("exterstellar-cv-tok-com", txt));
      i = end;
      continue;
    }
    // normal text until next special
    let next = code.length;
    const idxs = [code.indexOf('"', i), code.indexOf("'", i), code.indexOf("`", i), code.indexOf("//", i), code.indexOf("/*", i)].filter(v => v !== -1);
    // # only if at line start or after space
    let hashIdx = -1;
    let h = code.indexOf("#", i);
    while (h !== -1) {
      if (h === 0 || /\s/.test(code[h - 1] ?? "")) { hashIdx = h; break; }
      h = code.indexOf("#", h + 1);
    }
    if (hashIdx !== -1) idxs.push(hashIdx);
    if (idxs.length) next = Math.min(...idxs);
    const chunk = code.slice(i, next);
    appendWithHighlights(frag, chunk);
    i = next;
  }
  return frag;
}

function renderPatchLinesDOM(container: HTMLElement, patch: string): void {
  const lines = patch.split("\n");
  const MAX_LINES = 8000;
  const slice = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  let lnAdd = 0, lnDel = 0;
  let curAdd = 0, curDel = 0;
  // clear
  container.textContent = "";
  for (const l of slice) {
    if (l.startsWith("\\")) continue;
    const lineDiv = document.createElement("div");
    if (l.startsWith("@@")) {
      lineDiv.className = "exterstellar-cv-line--hunk";
      const m = l.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (m) { curDel = parseInt(m[1]!, 10); curAdd = parseInt(m[2]!, 10); }
      const ln = createSpan("exterstellar-cv-ln", "…");
      lineDiv.append(ln, document.createTextNode(l));
      container.appendChild(lineDiv);
      continue;
    }
    if (l.startsWith("+++") || l.startsWith("---") || l.startsWith("diff ")) {
      lineDiv.className = "exterstellar-cv-line--hunk";
      lineDiv.textContent = l;
      container.appendChild(lineDiv);
      continue;
    }
    let cls = "exterstellar-cv-line--ctx";
    let prefix = "";
    let content = l;
    let lnText = "";
    if (l.startsWith("+") && !l.startsWith("+++")) {
      cls = "exterstellar-cv-line--add";
      prefix = "+";
      content = l.slice(1);
      lnText = String(curAdd || ++lnAdd);
      if (curAdd) curAdd++;
    } else if (l.startsWith("-") && !l.startsWith("---")) {
      cls = "exterstellar-cv-line--del";
      prefix = "-";
      content = l.slice(1);
      lnText = String(curDel || ++lnDel);
      if (curDel) curDel++;
    } else {
      lnText = curAdd ? String(curAdd) : "";
      if (curAdd) curAdd++;
      if (curDel) curDel++;
    }
    lineDiv.className = cls;
    const ln = createSpan("exterstellar-cv-ln", lnText);
    lineDiv.append(ln);
    if (prefix) {
      const pref = createSpan("", prefix);
      pref.style.opacity = ".6";
      lineDiv.append(pref);
    }
    if (content) lineDiv.append(highlightToFragment(content));
    container.appendChild(lineDiv);
  }
  if (lines.length > MAX_LINES) {
    const more = document.createElement("div");
    more.className = "exterstellar-cv-line--hunk";
    more.textContent = `… truncated ${lines.length - MAX_LINES} lines`;
    container.appendChild(more);
  }
}

export function isViewerOpen(): boolean { return !!activeOverlay; }

export function closeViewer(): void {
  if (activeKeyHandler) document.removeEventListener("keydown", activeKeyHandler, true);
  activeKeyHandler = null;
  if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
  document.body.style.overflow = "";
}

export async function openCommitViewer(commits: ViewerCommit[], repoUrl: string, cfg: Cfg, _startIndex = 0): Promise<void> {
  if (!commits.length) return;
  cachedCfg = cfg;
  closeViewer();

  const cache = new Map<string, CommitDiff>();
  const pending = new Map<string, Promise<CommitDiff>>();

  function loadDiffForCommit(c: ViewerCommit): Promise<CommitDiff> {
    if (cache.has(c.hash)) return Promise.resolve(cache.get(c.hash)!);
    if (pending.has(c.hash)) return pending.get(c.hash)!;
    const p = fetchCommitDiff(repoUrl, c.hash, cachedCfg ?? {}).then(d => {
      if (!d.message) d.message = c.message;
      if (!d.author) d.author = c.author;
      if (!d.date) d.date = c.date;
      cache.set(c.hash, d);
      pending.delete(c.hash);
      return d;
    }).catch(err => {
      const e: CommitDiff = { sha: c.hash, shortSha: c.hash.slice(0,7), message: c.message, author: c.author, date: c.date, url: c.url, stats:{additions:0,deletions:0,total:0}, files:[], error: String(err) };
      cache.set(c.hash, e); pending.delete(c.hash); return e;
    });
    pending.set(c.hash, p);
    return p;
  }

  const overlay = document.createElement("div");
  overlay.className = "exterstellar-cv-overlay";
  overlay.tabIndex = -1;

  const modal = document.createElement("div");
  modal.className = "exterstellar-cv-modal";

  const topBar = document.createElement("div");
  topBar.className = "exterstellar-cv-topbar";
  const titleEl = document.createElement("h2");
  titleEl.textContent = `Changes — ${commits.length} commit${commits.length!==1?"s":""}`;
  const counterEl = document.createElement("small");
  counterEl.textContent = `${commits.length} commits · scroll to review · n/p to jump`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "exterstellar-cv-btn exterstellar-cv-btn--ghost";
  closeBtn.textContent = "×";
  closeBtn.title = "Close (Esc)";
  topBar.append(titleEl, counterEl, closeBtn);

  const mainRow = document.createElement("div");
  mainRow.className = "exterstellar-cv-mainrow";

  const sidebar = document.createElement("div");
  sidebar.className = "exterstellar-cv-sidebar";
  const sideTitle = document.createElement("div");
  sideTitle.className = "exterstellar-cv-sidebar-title";
  sideTitle.textContent = "Files";
  sidebar.appendChild(sideTitle);
  const sideEmpty = document.createElement("div");
  sideEmpty.className = "exterstellar-cv-sidebar-empty";
  sideEmpty.textContent = "Loading files…";
  sidebar.appendChild(sideEmpty);

  const body = document.createElement("div");
  body.className = "exterstellar-cv-body";

  mainRow.append(sidebar, body);

  const footer = document.createElement("div");
  footer.className = "exterstellar-cv-footer";
  {
    const left = document.createElement("span");
    const kbdN = document.createElement("kbd"); kbdN.textContent = "n";
    const kbdP = document.createElement("kbd"); kbdP.textContent = "p";
    const kbdEsc = document.createElement("kbd"); kbdEsc.textContent = "Esc";
    left.append(kbdN, document.createTextNode("/"), kbdP, document.createTextNode(" next/prev commit · click file in sidebar · "), kbdEsc, document.createTextNode(" close"));
    const right = document.createElement("span");
    right.style.marginLeft = "auto";
    right.textContent = "all files open — just scroll";
    footer.append(left, right);
  }

  modal.append(topBar, mainRow, footer);
  overlay.appendChild(modal);

  // Build stacked commits — all visible at once, scroll inside body
  const commitEls: HTMLElement[] = [];
  const sideCommitEls: HTMLElement[] = [];
  const fileIdMap = new Map<string, HTMLElement>();
  const sidebarFileEls: HTMLElement[] = [];
  commits.forEach((c, cIdx) => {
    const commitWrap = document.createElement("div");
    commitWrap.className = "exterstellar-cv-commit";
    commitWrap.dataset.sha = c.hash;

    const head = document.createElement("div");
    head.className = "exterstellar-cv-commit-head";
    const msg = document.createElement("div");
    msg.className = "exterstellar-cv-commit-msg";
    msg.textContent = c.message || c.hash.slice(0,7);
    msg.title = c.message || c.hash;
    const meta = document.createElement("div");
    meta.className = "exterstellar-cv-commit-meta";
    const hashLink = document.createElement("a");
    hashLink.href = c.url;
    hashLink.target = "_blank";
    hashLink.rel = "noopener noreferrer";
    hashLink.textContent = c.hash.slice(0,7);
    const authorSpan = document.createElement("span");
    authorSpan.textContent = c.author ? `by ${c.author}` : "";
    const dateSpan = document.createElement("span");
    dateSpan.textContent = c.date ? formatDate(c.date) : "";
    meta.append(hashLink);
    if (c.author) meta.append(authorSpan);
    if (c.date) meta.append(dateSpan);
    head.append(msg, meta);

    const content = document.createElement("div");
    content.className = "exterstellar-cv-commit-content";
    {
      const loading = document.createElement("div");
      loading.className = "exterstellar-cv-empty";
      loading.textContent = "Loading diff…";
      content.append(loading);
    }

    commitWrap.append(head, content);
    body.appendChild(commitWrap);
    commitEls.push(commitWrap);

    const sideCommit = document.createElement("div");
    sideCommit.className = "exterstellar-cv-sidebar-commit";
    sideCommit.textContent = (c.message.split("\n")[0] ?? c.message).slice(0, 32) || c.hash.slice(0, 7);
    sideCommit.title = `${c.message} — ${c.hash.slice(0,7)}`;
    sideCommit.addEventListener("click", () => commitWrap.scrollIntoView({ behavior: "smooth", block: "start" }));
    sidebar.appendChild(sideCommit);
    sideCommitEls.push(sideCommit);

    const sideFilesForCommit: HTMLElement[] = [];
    // async load
    void loadDiffForCommit(c).then(diff => {
      content.textContent = "";
      if (diff.error && !diff.files.length) {
        const empty = document.createElement("div");
        empty.className = "exterstellar-cv-empty";
        if (diff.isPrivate) {
          empty.append(document.createTextNode("Private repo — "));
        } else {
          empty.append(document.createTextNode(diff.error!), document.createElement("br"));
        }
        const a = document.createElement("a");
        a.href = diff.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "Open on host →";
        empty.append(a);
        content.appendChild(empty);
        return;
      }
      if (!diff.files.length) {
        const empty = document.createElement("div");
        empty.className = "exterstellar-cv-empty";
        empty.textContent = "No file changes.";
        content.appendChild(empty);
        return;
      }
      // Update head with real message if fetched differs
      if (diff.message && diff.message !== c.message) {
        msg.textContent = diff.message;
        sideCommit.textContent = (diff.message.split("\n")[0] ?? diff.message).slice(0, 32);
        sideCommit.title = `${diff.message} — ${c.hash.slice(0,7)}`;
      }
      // remove empty placeholder once first diff arrives
      if (sideEmpty.parentElement) sideEmpty.remove();
      diff.files.forEach((f, fIdx) => {
        const block = document.createElement("div");
        block.className = "exterstellar-cv-fileblock";
        const fHead = document.createElement("div");
        fHead.className = "exterstellar-cv-filehead";
        const badge = document.createElement("span");
        badge.className = `exterstellar-cv-badge exterstellar-cv-badge--${f.status === "added" ? "added" : f.status === "deleted" ? "deleted" : f.status === "renamed" ? "renamed" : "modified"}`;
        badge.textContent = f.status;
        const name = document.createElement("span");
        name.textContent = f.filename;
        name.style.flex = "1";
        name.style.overflow = "hidden";
        name.style.textOverflow = "ellipsis";
        name.style.whiteSpace = "nowrap";
        const wsOnly = !!f.patch && isWhitespaceOnlyPatch(f.patch);
        const stats = document.createElement("span");
        stats.className = "exterstellar-cv-stats";
        stats.textContent = f.binary ? "binary" : f.tooLarge ? "too large" : wsOnly ? "whitespace" : `+${f.additions} -${f.deletions}`;
        const toggle = document.createElement("span");
        toggle.textContent = wsOnly ? "▸" : "▾";
        toggle.style.opacity = "0.6";
        toggle.style.fontSize = "12px";
        fHead.append(badge, name, stats, toggle);
        fHead.style.cursor = "pointer";
        fHead.title = "Click to collapse/expand";
        block.id = `exterstellar-cv-file-${cIdx}-${fIdx}`;
        const patchWrap = document.createElement("pre");
        patchWrap.className = "exterstellar-cv-patch";
        if (f.binary) {
          const msg = document.createElement("div");
          msg.className = "exterstellar-cv-empty";
          msg.style.padding = "10px";
          msg.append(document.createTextNode("Binary — "));
          const a = document.createElement("a");
          a.href = f.blobUrl ?? diff.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "view on host";
          msg.append(a);
          patchWrap.append(msg);
        } else if (f.tooLarge) {
          const msg = document.createElement("div");
          msg.className = "exterstellar-cv-empty";
          msg.style.padding = "10px";
          msg.append(document.createTextNode("Diff too large — "));
          const a = document.createElement("a");
          a.href = diff.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "open on host";
          msg.append(a);
          patchWrap.append(msg);
        } else if (f.patch) {
          if (wsOnly) {
            const msg = document.createElement("div");
            msg.className = "exterstellar-cv-empty";
            msg.style.padding = "8px 12px";
            msg.textContent =
              "Whitespace-only change — click header to inspect";
            patchWrap.append(msg);
          }
          renderPatchLinesDOM(patchWrap, f.patch);
        } else {
          patchWrap.textContent = "(no patch)";
        }
        let collapsed = wsOnly;
        if (collapsed) {
          patchWrap.style.display = "none";
          block.classList.add("exterstellar-cv-fileblock--collapsed");
        }
        fHead.addEventListener("click", () => {
          collapsed = !collapsed;
          patchWrap.style.display = collapsed ? "none" : "";
          toggle.textContent = collapsed ? "▸" : "▾";
          block.classList.toggle("exterstellar-cv-fileblock--collapsed", collapsed);
        });
        block.append(fHead, patchWrap);
        content.appendChild(block);
        fileIdMap.set(block.id, block);

        const sideFile = document.createElement("div");
        sideFile.className = "exterstellar-cv-sidebar-file";
        sideFile.textContent = f.filename.split("/").pop() ?? f.filename;
        sideFile.title = `${f.filename} — ${f.status}`;
        sideFile.dataset.target = block.id;
        sideFile.addEventListener("click", () => {
          // expand if collapsed
          if ((patchWrap.style.display as string) === "none") {
            patchWrap.style.display = "";
            toggle.textContent = "▾";
            block.classList.remove("exterstellar-cv-fileblock--collapsed");
          }
          block.scrollIntoView({ behavior: "smooth", block: "start" });
          sidebarFileEls.forEach(el => el.classList.remove("exterstellar-cv-sidebar-file--active"));
          sideFile.classList.add("exterstellar-cv-sidebar-file--active");
        });
        // insert after sideCommit, in order
        const insertAfter = sideFilesForCommit.length ? sideFilesForCommit[sideFilesForCommit.length - 1]! : sideCommit;
        insertAfter.insertAdjacentElement("afterend", sideFile);
        sideFilesForCommit.push(sideFile);
        sidebarFileEls.push(sideFile);
      });
    });
  });

  let currentCommitIdx = 0;
  function scrollToCommit(idx: number): void {
    idx = Math.max(0, Math.min(idx, commitEls.length - 1));
    currentCommitIdx = idx;
    commitEls[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  closeBtn.addEventListener("click", () => closeViewer());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeViewer(); });

  const keyHandler = (e: KeyboardEvent) => {
    if (!activeOverlay) return;
    if (isEditableTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === "escape") { e.preventDefault(); closeViewer(); return; }
    if (k === "n" || k === "arrowdown" || k === "j") { e.preventDefault(); scrollToCommit(currentCommitIdx + 1); return; }
    if (k === "p" || k === "arrowup" || k === "k") { e.preventDefault(); scrollToCommit(currentCommitIdx - 1); return; }
  };
  activeKeyHandler = keyHandler as unknown as (e: KeyboardEvent)=>void;
  document.addEventListener("keydown", activeKeyHandler, true);

  // track closest commit on scroll for n/p + highlight sidebar
  body.addEventListener("scroll", () => {
    let bestIdx = 0;
    let bestTop = Infinity;
    const bodyRect = body.getBoundingClientRect();
    commitEls.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top - bodyRect.top);
      if (dist < bestTop) { bestTop = dist; bestIdx = i; }
    });
    currentCommitIdx = bestIdx;
    sideCommitEls.forEach((el, i) => el.classList.toggle("exterstellar-cv-sidebar-commit--active", i === bestIdx));
  }, { passive: true });

  activeOverlay = overlay;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  overlay.focus();
}

export function teardownViewer(): void { closeViewer(); }
