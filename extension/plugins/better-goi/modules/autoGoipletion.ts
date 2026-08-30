import type { Cfg } from "./types";
import { type SnippetDef, SNIPPETS } from "./snippets";

type Verdict = "approve" | "reject" | "any";

interface JustifEntry {
  text: string;
  verdict: Verdict;
  uses: number;
  lastUsed: number;
}

interface Countable {
  key: string;
  text: string;
  uses: number;
  docs: number;
  lastUsed: number;
}

interface JustifStore {
  entries: JustifEntry[];
  phrases: Countable[];
  chunks: Countable[];
}

interface LineRef {
  text: string;
  entry: JustifEntry;
  entryLines: string[];
  lineIdx: number;
}

interface TAState {
  baseline: string;
  dirty: boolean;
  lastInputAt: number;
  lastCaptureValue: string | null;
  lastCaptureAt: number;
}

type DdItem =
  | { kind: "template"; entry: JustifEntry }
  | { kind: "phrase"; phrase: Countable }
  | { kind: "snippet"; def: SnippetDef; resolved: string };

let store: JustifStore = { entries: [], phrases: [], chunks: [] };
let storeLoaded = false;
let lineIndex: LineRef[] | null = null;
let wordIndex: Map<string, number> | null = null;
let chunkIndex: Map<string, Countable[]> | null = null;

const attachedStates = new WeakMap<HTMLTextAreaElement, TAState>();
const taCleanups = new Map<HTMLTextAreaElement, () => void>();

let observer: MutationObserver | null = null;

let ghost: { start: number; completion: string } | null = null;

interface GhostHint {
  wrap: HTMLDivElement;
  hint: HTMLDivElement;
  origBg: string;
  origPosition: string;
  origZIndex: string;
  origMargin: string;
}
const ghostHints = new WeakMap<HTMLTextAreaElement, GhostHint>();

let lastGhostCompute: {
  value: string;
  caret: number;
  gatesOpen: boolean;
  result: { completion: string } | null;
} | null = null;
let ddEl: HTMLDivElement | null = null;
let activeTA: HTMLTextAreaElement | null = null;
let ddItems: DdItem[] = [];
let ddSelIdx = -1;
let ddOpen = false;
let ghostSuppressed = false;
let forceShowNext = false;
let suppressUntil = 0;
let blurTimer: number | undefined;
let lastAccept: { prevValue: string; entryText: string } | null = null;
let undoWaiting = false;
let acceptedText: string | null = null;
let escapeValueLen = -1;
const rejectedKeys = new Set<string>();
let ddSuppressed = false;
let enabled = true;
let ghostEnabled = true;
let snippetEnabled = true;
let commonPhrasesEnabled = true;
let chunkCompletionEnabled = true;

let programmaticInput = false;

function dispatchProgrammaticInput(ta: HTMLTextAreaElement): void {
  programmaticInput = true;
  try {
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  } finally {
    programmaticInput = false;
  }
}

function storageLoad(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get("exterstellar-better-goi-justif-v1", (items) => {
      const saved = items["exterstellar-better-goi-justif-v1"] as
        JustifStore | undefined;
      if (saved && Array.isArray(saved.entries)) {
        store = {
          entries: saved.entries.filter((e) => typeof e?.text === "string"),
          phrases: Array.isArray(saved.phrases)
            ? saved.phrases.filter(
                (p) =>
                  typeof p?.key === "string" && typeof p?.text === "string",
              )
            : [],
          chunks: Array.isArray(saved.chunks)
            ? saved.chunks.filter(
                (c) =>
                  typeof c?.key === "string" && typeof c?.text === "string",
              )
            : [],
        };
      }
      if (!Array.isArray(store.chunks)) store.chunks = [];
      if (store.chunks.length === 0) bootstrapChunksFromCorpus();
      if (pruneStale(Date.now()) > 0) storageSave();
      chunkIndex = null;
      storeLoaded = true;
      resolve();
    });
  });
}

function storageSave(): void {
  chrome.storage.local.set({ ["exterstellar-better-goi-justif-v1"]: store });
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeWordKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function recencyScore(
  item: { docs: number; uses: number; lastUsed: number },
  now: number,
): number {
  const days = Math.max(0, (now - item.lastUsed) / 86400000);
  const recency = Math.exp((-Math.LN2 * days) / 21);
  return (item.docs * 2 + item.uses * 0.5) * recency;
}

function extractChunks(
  text: string,
): Map<string, { text: string; count: number }> {
  const found = new Map<string, { text: string; count: number }>();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const words = sentence
      .trim()
      .split(/\s+/)
      .filter((w) => /[a-zA-Z0-9]/.test(w));
    if (words.length < 2) continue;
    for (let len = 2; len <= Math.min(5, words.length); len++) {
      for (let i = 0; i + len <= words.length; i++) {
        const chunkText = words.slice(i, i + len).join(" ");
        const key = normalizeWordKey(chunkText);
        if (key.length < 2) continue;
        const ex = found.get(key);
        if (ex) ex.count += 1;
        else found.set(key, { text: chunkText, count: 1 });
      }
    }
  }
  return found;
}

function buildChunkIndex(): Map<string, Countable[]> {
  if (chunkIndex) return chunkIndex;
  const idx = new Map<string, Countable[]>();
  for (const c of store.chunks) {
    const first = c.text.toLowerCase().split(/\s+/)[0];
    if (!first) continue;
    const bucket = idx.get(first);
    if (bucket) bucket.push(c);
    else idx.set(first, [c]);
  }
  chunkIndex = idx;
  return idx;
}

function lookupChunkPrefix(prefix: string): Countable[] {
  const idx = buildChunkIndex();
  const first = prefix.split(/\s+/)[0] ?? "";
  const bucket = idx.get(first) ?? [];
  return bucket.filter((c) => c.text.toLowerCase().startsWith(prefix));
}

function bootstrapChunksFromCorpus(): void {
  if (store.chunks.length > 0) return;
  const all = [
    ...store.entries.map((e) => e.text),
    ...store.phrases.map((p) => p.text),
  ];
  if (all.length === 0) return;
  const merged = new Map<string, Countable>();
  for (const text of all) {
    const found = extractChunks(text);
    for (const [key, info] of found) {
      const ex = merged.get(key);
      if (ex) {
        ex.uses += info.count;
        ex.docs += 1;
        ex.text = info.text;
      } else {
        merged.set(key, {
          key,
          text: info.text,
          uses: info.count,
          docs: 1,
          lastUsed: Date.now(),
        });
      }
    }
  }
  store.chunks = [...merged.values()];
}

function extractPhrases(
  text: string,
): Map<string, { text: string; count: number }> {
  const found = new Map<string, { text: string; count: number }>();
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => {
      const words = s
        .replace(/[^a-zA-Z]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return s.length >= 12 && words.length >= 3;
    });
  for (const s of sentences) {
    const key = normalizeWordKey(s);
    if (!key) continue;
    const ex = found.get(key);
    if (ex) ex.count += 1;
    else found.set(key, { text: s, count: 1 });
  }
  return found;
}

function entryScore(entry: JustifEntry, now: number): number {
  const days = Math.max(0, (now - entry.lastUsed) / 86400000);
  const recency = Math.exp((-Math.LN2 * days) / 21);
  const freq = 1 + Math.log(1 + entry.uses);
  return recency * freq;
}

function verdictBoost(entry: JustifEntry, verdict: Verdict): number {
  return entry.verdict !== "any" &&
    verdict !== "any" &&
    entry.verdict === verdict
    ? 1.3
    : 1;
}

function firstLineOf(text: string): string {
  return (text.split("\n")[0] ?? "").trim();
}

function minScoreForLength(currentLength: number): number {
  return currentLength > 300
    ? 0.75
    : currentLength > 100
      ? 0.6
      : currentLength > 30
        ? 0.5
        : 0.45;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j] ?? 0;
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prevDiag
          : 1 + Math.min(prevDiag, dp[j] ?? 0, dp[j - 1] ?? 0);
      prevDiag = temp;
    }
  }
  return dp[n] ?? Math.max(m, n);
}

function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const dist = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen === 0 ? 0 : Math.max(0, 1 - dist / maxLen);
}

function fastSim(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;
  const c1 = s1.length > 80 ? s1.slice(0, 80) : s1;
  const c2 = s2.length > 80 ? s2.slice(0, 80) : s2;
  return stringSimilarity(c1, c2);
}

function getLineIndex(): LineRef[] {
  if (lineIndex) return lineIndex;
  const index: LineRef[] = [];
  for (const entry of store.entries) {
    const lines = entry.text
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);
    lines.forEach((text, lineIdx) => {
      index.push({ text, entry, entryLines: lines, lineIdx });
    });
  }
  lineIndex = index;
  return index;
}

function buildWordIndex(): Map<string, number> {
  if (wordIndex) return wordIndex;
  const freq = new Map<string, number>();
  for (const entry of store.entries) {
    const words = entry.text.toLowerCase().match(/[a-z]{3,}/g);
    if (!words) continue;
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + entry.uses);
    }
  }
  wordIndex = freq;
  return freq;
}

function lookupWordCompletions(prefix: string, limit = 3): string[] {
  if (prefix.length < 2) return [];
  const freq = buildWordIndex();
  const matches: Array<{ word: string; count: number }> = [];
  for (const [word, count] of freq) {
    if (word.startsWith(prefix) && word !== prefix) {
      matches.push({ word, count });
    }
  }
  matches.sort((a, b) => b.count - a.count);
  return matches.slice(0, limit).map((m) => m.word);
}

function computeChunkCompletion(
  currentLine: string,
  caret: number,
  value: string,
): string | null {
  if (caret !== value.length) return null;
  if (currentLine.length < 2) return null;
  if (currentLine.trim().length === 0) return null;
  const lastChar = currentLine[currentLine.length - 1] ?? "";
  if (!/\S/.test(lastChar)) return null;

  const tokens = currentLine.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const maxK = Math.min(5, tokens.length);

  const now = Date.now();

  for (let k = maxK; k >= 2; k--) {
    const candidateTokens = tokens.slice(tokens.length - k);
    const candidate = candidateTokens.join(" ");
    if (candidate.length < 2) continue;
    const lastToken = candidateTokens[candidateTokens.length - 1] ?? "";
    if (lastToken.length < 2) continue;

    const matches = lookupChunkPrefix(candidate).filter((c) => c.uses >= 2);
    let best: { completion: string; score: number } | null = null;
    for (const c of matches) {
      if (c.text.length <= candidate.length) continue;
      const chunkWords = c.text.split(/\s+/).length;
      if (
        chunkWords > candidateTokens.length &&
        candidateTokens.length / chunkWords < 0.4
      )
        continue;
      const completion = c.text.slice(candidate.length);
      if (completion.trim().length < 2) continue;
      if (completion.length > 120) continue;
      const score = recencyScore(c, now);
      if (!best || score > best.score) best = { completion, score };
    }
    if (best) return best.completion;
  }

  return null;
}

function computeGhost(
  value: string,
  caret: number,
  verdict: Verdict,
): { completion: string } | null {
  const before = value.slice(0, caret);
  const lineStart = before.lastIndexOf("\n") + 1;
  const currentLine = before.slice(lineStart);

  if (chunkCompletionEnabled) {
    const chunkResult = computeChunkCompletion(currentLine, caret, value);
    if (chunkResult) return { completion: chunkResult };
  }

  if (currentLine.trim().length >= 3) {
    const lower = currentLine.toLowerCase();
    const now = Date.now();
    let best: { completion: string; score: number } | null = null;

    for (const ref of getLineIndex()) {
      if (now - ref.entry.lastUsed < 120_000) continue;
      const ll = ref.text.toLowerCase();
      if (ll.length <= lower.length) continue;
      if (!ll.startsWith(lower)) continue;

      const raw = ref.text.slice(currentLine.length);
      const sentenceEnd = raw.search(/[.!?]/);
      let completion = sentenceEnd >= 0 ? raw.slice(0, sentenceEnd + 1) : raw;
      if (completion.length > 120) completion = completion.slice(0, 120);
      if (completion.trim().length < 3) continue;

      const score =
        entryScore(ref.entry, now) *
        verdictBoost(ref.entry, verdict) *
        (1 / (1 + completion.length / 60));
      if (!best || score > best.score) best = { completion, score };
    }

    if (commonPhrasesEnabled) {
      for (const p of store.phrases) {
        if (p.docs < 2) continue;
        if (now - p.lastUsed < 120_000) continue;
        const ll = p.text.toLowerCase();
        if (ll.length <= lower.length) continue;
        if (!ll.startsWith(lower)) continue;

        const raw = p.text.slice(currentLine.length);
        const sentenceEnd = raw.search(/[.!?]/);
        let completion = sentenceEnd >= 0 ? raw.slice(0, sentenceEnd + 1) : raw;
        if (completion.length > 120) completion = completion.slice(0, 120);
        if (completion.trim().length < 3) continue;

        const score = recencyScore(p, now);
        if (!best || score > best.score) best = { completion, score };
      }
    }

    if (best)
      return {
        completion: best.completion,
      };
  }

  const lastSpace = currentLine.lastIndexOf(" ");
  const wordStart = lastSpace + 1;
  const currentWord = currentLine.slice(wordStart).toLowerCase();
  if (
    currentWord.length >= 2 &&
    caret < value.length &&
    /\w/.test(value[caret] ?? "")
  ) {
    const completions = lookupWordCompletions(currentWord);
    if (completions.length > 0) {
      const word = completions[0];
      const suffix = (word ?? "").slice(currentWord.length);
      if (suffix.length > 0) {
        return {
          completion: suffix,
        };
      }
    }
  }

  return null;
}

interface DdEntryMeta {
  entry: JustifEntry;
  textLC: string;
  firstLC: string;
  key: string;
}
interface DdPhraseMeta {
  phrase: Countable;
  ptLC: string;
  firstLC: string;
}
let ddMetaCache: {
  version: number;
  entries: DdEntryMeta[];
  phrases: DdPhraseMeta[];
} | null = null;
function getDdMeta(): { entries: DdEntryMeta[]; phrases: DdPhraseMeta[] } {
  if (ddMetaCache && ddMetaCache.version === storeVersion) return ddMetaCache;
  const entries = store.entries.map((e) => {
    const textLC = e.text.toLowerCase();
    return {
      entry: e,
      textLC,
      firstLC: firstLineOf(textLC),
      key: normalizeKey(e.text),
    };
  });
  const phrases = store.phrases.map((p) => {
    const ptLC = p.text.toLowerCase();
    return { phrase: p, ptLC, firstLC: firstLineOf(ptLC) };
  });
  ddMetaCache = { version: storeVersion, entries, phrases };
  return ddMetaCache;
}

function computeTemplates(
  query: string,
  verdict: Verdict,
  currentLength: number,
): DdItem[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const ql = q.toLowerCase();
  const now = Date.now();
  const meta = getDdMeta();
  const scored: Array<{ item: DdItem; score: number }> = [];

  for (const m of meta.entries) {
    const entry = m.entry;
    if (now - entry.lastUsed < 120_000) continue;
    if (m.key === ql) continue;
    if (fastSim(ql, m.key) > 0.8) continue;
    const sim = Math.max(fastSim(ql, m.textLC), fastSim(ql, m.firstLC));
    if (ql.length >= 8 && sim < 0.18) continue;
    let bonus = 0;
    if (m.firstLC.startsWith(ql) || m.textLC.startsWith(ql)) bonus = 0.4;
    else if (m.firstLC.includes(ql) || m.textLC.includes(ql)) bonus = 0.15;
    const lenPenalty = 1 / (1 + m.firstLC.length / 60);
    let score =
      (sim + bonus) *
      entryScore(entry, now) *
      verdictBoost(entry, verdict) *
      lenPenalty;
    if (currentLength > 0 && entry.text.length / currentLength > 0.5) {
      const ratio = entry.text.length / currentLength;
      score *= Math.max(0.2, 1 - (ratio - 0.5));
    }
    if (score >= minScoreForLength(currentLength))
      scored.push({ item: { kind: "template", entry }, score });
  }

  if (commonPhrasesEnabled) {
    const entryPhraseKeys = new Set(
      meta.entries.map((m) => normalizeWordKey(m.entry.text)),
    );
    for (const m of meta.phrases) {
      const p = m.phrase;
      if (p.docs < 2) continue;
      if (now - p.lastUsed < 120_000) continue;
      if (entryPhraseKeys.has(p.key)) continue;
      const sim = Math.max(fastSim(ql, m.ptLC), fastSim(ql, m.firstLC));
      if (ql.length >= 8 && sim < 0.18) continue;
      let bonus = 0;
      if (m.ptLC.startsWith(ql)) bonus = 0.4;
      else if (m.ptLC.includes(ql)) bonus = 0.15;
      const lenPenalty = 1 / (1 + p.text.length / 60);
      const score = (sim + bonus) * recencyScore(p, now) * lenPenalty;
      if (score >= minScoreForLength(currentLength))
        scored.push({ item: { kind: "phrase", phrase: p }, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.item);
}

function itemText(item: DdItem | undefined): string | null {
  if (!item) return null;
  if (item.kind === "snippet") return item.resolved;
  if (item.kind === "phrase") return item.phrase.text;
  return item.entry.text;
}

function topEntries(verdict: Verdict, limit: number): JustifEntry[] {
  const now = Date.now();
  return [...store.entries]
    .filter((e) => now - e.lastUsed >= 120_000)
    .sort(
      (a, b) =>
        entryScore(b, now) * verdictBoost(b, verdict) -
        entryScore(a, now) * verdictBoost(a, verdict),
    )
    .slice(0, limit);
}

function firstSentence(text: string, maxLen: number): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?]/);
  let out = end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out.trim();
}

function mergeExtracted<T extends Countable>(
  store: T[],
  found: Map<string, { text: string; count: number }>,
  now: number,
  cap: number,
): T[] {
  const credited = new Set<string>();
  for (const [key, info] of found) {
    const existing = store.find((c) => c.key === key);
    if (existing) {
      existing.uses += info.count;
      existing.lastUsed = now;
      existing.text = info.text;
      if (!credited.has(key)) {
        existing.docs += 1;
        credited.add(key);
      }
    } else {
      store.push({
        key,
        text: info.text,
        uses: info.count,
        docs: 1,
        lastUsed: now,
      } as T);
      credited.add(key);
    }
  }
  if (store.length > cap) {
    store.sort((a, b) => recencyScore(b, now) - recencyScore(a, now));
    store.length = cap;
  }
  return store;
}

function pruneStale(now: number): number {
  const cutoff = now - 30 * 86400000;
  const before =
    store.entries.length + store.phrases.length + store.chunks.length;
  store.entries = store.entries.filter((e) => e.lastUsed >= cutoff);
  store.phrases = store.phrases.filter((p) => p.lastUsed >= cutoff);
  store.chunks = store.chunks.filter((c) => c.lastUsed >= cutoff);
  const removed =
    before -
    (store.entries.length + store.phrases.length + store.chunks.length);
  if (store.chunks.length === 0) bootstrapChunksFromCorpus();
  lineIndex = null;
  wordIndex = null;
  chunkIndex = null;
  return removed;
}

async function learn(text: string, verdict: Verdict): Promise<void> {
  if (!storeLoaded) await storageLoad();

  const trimmed = firstSentence(text, 160);
  if (trimmed.length < 8) return;

  const key = normalizeKey(trimmed);
  const now = Date.now();
  const existing = store.entries.find((e) => normalizeKey(e.text) === key);

  if (existing) {
    existing.uses += 1;
    existing.lastUsed = now;
    existing.text = trimmed;
    if (existing.verdict === "any" && verdict !== "any")
      existing.verdict = verdict;
  } else {
    store.entries.push({
      text: trimmed,
      verdict,
      uses: 1,
      lastUsed: now,
    });
  }

  if (commonPhrasesEnabled) {
    const phraseFound = extractPhrases(text);
    if (phraseFound.size > 0)
      store.phrases = mergeExtracted(store.phrases, phraseFound, now, 300);
    const chunkFound = extractChunks(text);
    if (chunkFound.size > 0)
      store.chunks = mergeExtracted(store.chunks, chunkFound, now, 600);
  }

  if (store.entries.length > 400) {
    store.entries.sort((a, b) => entryScore(b, now) - entryScore(a, now));
    store.entries = store.entries.slice(0, 400);
  }

  pruneStale(now);

  lineIndex = null;
  wordIndex = null;
  chunkIndex = null;
  storeVersion++;
  storageSave();
}

function bumpUsage(text: string, verdict: Verdict): void {
  if (!storeLoaded) return;
  const key = normalizeKey(text);
  const entry = store.entries.find((e) => normalizeKey(e.text) === key);
  if (!entry) return;
  entry.uses += 1;
  entry.lastUsed = Date.now();
  if (entry.verdict === "any" && verdict !== "any") entry.verdict = verdict;
  const phrase = store.phrases.find((p) => p.key === normalizeWordKey(text));
  if (phrase && phrase.uses > 0) phrase.uses += 1;
  const chunk = store.chunks.find((c) => c.key === normalizeWordKey(text));
  if (chunk && chunk.uses > 0) chunk.uses += 1;
  chunkIndex = null;
  storageSave();
}

function detectVerdict(ta: HTMLTextAreaElement): Verdict {
  const panel = ta.closest(".devlog-review-panel");
  if (!panel) return "any";
  if (panel.classList.contains("approved")) return "approve";
  if (panel.classList.contains("rejected")) return "reject";
  return "any";
}

function isJustificationTextarea(ta: HTMLTextAreaElement): boolean {
  if (ta.closest(".devlog-review-group--frozen")) return false;
  if (
    ta.closest(
      ".feed-composer__textarea, .devlog-detail__comment-textarea, .comment-modal__textarea",
    )
  )
    return false;

  return ta.matches(
    '[data-certification--ysws--devlog-review-target="notesTextarea"]',
  );
}

function detectSnippet(
  value: string,
  caret: number,
): { trigger: string; startPos: number } | null {
  const before = value.slice(0, caret);
  const braceIdx = before.lastIndexOf("{");
  if (braceIdx < 0) return null;
  const afterBrace = before.slice(braceIdx + 1);
  if (/\s/.test(afterBrace)) return null;
  return { trigger: afterBrace.toLowerCase(), startPos: braceIdx };
}

function checkAutoSnippet(
  ta: HTMLTextAreaElement,
  value: string,
  caret: number,
): { startPos: number; endPos: number; replacement: string } | null {
  const before = value.slice(0, caret);
  const match = before.match(/\{([a-zA-Z]+)\}$/);
  if (!match) return null;
  const trigger = (match[1] ?? "").toLowerCase();
  const def = SNIPPETS.find((s) => s.trigger === trigger);
  if (!def) return null;
  const devlogItem = ta.closest(".devlog-item");
  const resolved = def.resolve(devlogItem);
  return {
    startPos: match.index ?? 0,
    endPos: caret,
    replacement: resolved,
  };
}

function ensureDdEl(): HTMLDivElement {
  if (!ddEl) {
    ddEl = document.createElement("div");
    ddEl.className = "exterstellar-better-goi-justif-dd";
    ddEl.setAttribute("role", "listbox");
    document.body.appendChild(ddEl);
  }
  return ddEl;
}

const HINT_CLONE_PROPS = [
  "direction",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "tabSize",
  "textAlign",
  "textTransform",
  "fontFeatureSettings",
  "fontVariationSettings",
  "textRendering",
  "whiteSpace",
  "wordWrap",
  "overflowWrap",
  "wordBreak",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "boxSizing",
  "width",
  "height",
  "maxWidth",
  "minWidth",
  "maxHeight",
  "minHeight",
  "overflowX",
  "overflowY",
];

function ensureGhostHint(ta: HTMLTextAreaElement): GhostHint {
  const existing = ghostHints.get(ta);
  if (existing && existing.hint.isConnected) return existing;

  const cs = getComputedStyle(ta);
  const tcs = ta.style;
  const wrap = document.createElement("div");

  wrap.style.position = "relative";
  wrap.style.display = cs.display;
  wrap.style.width = "100%";
  wrap.style.minWidth = "0";
  wrap.style.flex = cs.flex;
  wrap.style.flexGrow = cs.flexGrow;
  wrap.style.flexShrink = cs.flexShrink;
  wrap.style.flexBasis = cs.flexBasis;
  wrap.style.margin = cs.margin;
  wrap.style.maxWidth = cs.maxWidth;
  wrap.style.minWidth = cs.minWidth;

  const hint = document.createElement("div");
  hint.setAttribute("aria-hidden", "true");
  hint.style.position = "absolute";
  hint.style.inset = "0";
  hint.style.margin = "0";
  hint.style.background = cs.backgroundColor;
  hint.style.color = "transparent";
  hint.style.setProperty("-webkit-text-fill-color", "transparent");
  hint.style.visibility = "visible";
  hint.style.pointerEvents = "none";
  hint.style.resize = "none";
  hint.style.zIndex = "1";

  for (const prop of HINT_CLONE_PROPS) {
    const v = (cs as unknown as Record<string, string>)[prop];
    if (v != null) (hint.style as unknown as Record<string, string>)[prop] = v;
  }
  hint.style.background = cs.background;
  hint.style.backgroundColor = cs.backgroundColor;
  hint.style.borderRadius = cs.borderRadius;
  hint.style.boxShadow = "none";
  hint.style.filter = cs.filter;
  hint.style.opacity = cs.opacity;
  (hint.style as unknown as Record<string, string>)["backdropFilter"] =
    (cs as unknown as Record<string, string>)["backdropFilter"] ?? "";
  // Border on the hint (behind) would double-draw over the textarea's border
  // and make the whole field look brighter/more opaque — keep it transparent
  // but retain the cloned widths so text layout still matches.
  hint.style.borderColor = "transparent";
  // `color` for ghost is faint, but keep `caretColor` from original so caret
  // doesn't change brightness; ensure hint doesn't introduce its own filter
  // that would brighten the whole field.

  const parent = ta.parentElement;
  parent?.insertBefore(wrap, ta);
  wrap.appendChild(hint);
  wrap.appendChild(ta);

  const state: GhostHint = {
    wrap,
    hint,
    origBg: tcs.backgroundColor,
    origPosition: tcs.position,
    origZIndex: tcs.zIndex,
    origMargin: tcs.margin,
  };

  tcs.margin = "0";
  tcs.position = "relative";
  tcs.zIndex = "2";
  tcs.backgroundColor = "transparent";
  ghostHints.set(ta, state);
  return state;
}

function setGhostText(ta: HTMLTextAreaElement, text: string): void {
  const h = ensureGhostHint(ta);
  syncGhostGeometry(ta);
  const prefix = ta.value;
  let completion = text.slice(prefix.length);
  h.hint.textContent = "";
  // Keep leading whitespace with the transparent prefix so the faint span
  // doesn't start with a space at an inline boundary — that wraps 1px lower
  // than the single-text-node case (the "slightly lower" bug).
  let ws = "";
  const m = completion.match(/^\s+/);
  if (m) {
    ws = m[0]!;
    completion = completion.slice(ws.length);
  }
  h.hint.appendChild(document.createTextNode(prefix + ws));
  if (completion) {
    const span = document.createElement("span");
    span.textContent = completion;
    span.style.color = "var(--color-space-surface, #6e738d)";
    span.style.setProperty(
      "-webkit-text-fill-color",
      "var(--color-space-surface, #6e738d)",
    );
    // Ensure the span inherits the exact same inline layout as the raw text
    // node so wrapping/baseline matches the single-node case.
    span.style.whiteSpace = "pre-wrap";
    span.style.font = "inherit";
    span.style.letterSpacing = "inherit";
    span.style.wordSpacing = "inherit";
    h.hint.appendChild(span);
  }
}

function clearGhostHint(ta: HTMLTextAreaElement): void {
  const h = ghostHints.get(ta);
  if (h) h.hint.textContent = "";
}

function destroyGhostHint(ta: HTMLTextAreaElement): void {
  const h = ghostHints.get(ta);
  if (!h) return;
  const parent = h.wrap.parentElement;
  ta.style.backgroundColor = h.origBg;
  ta.style.position = h.origPosition;
  ta.style.zIndex = h.origZIndex;
  ta.style.margin = h.origMargin;
  parent?.insertBefore(ta, h.wrap);
  h.wrap.remove();
  ghostHints.delete(ta);
}

let lastDdComputeAt = 0;

let storeVersion = 0;

function clearGhost(ta?: HTMLTextAreaElement): void {
  ghost = null;
  if (ta) clearGhostHint(ta);
}

function syncGhostScroll(ta: HTMLTextAreaElement): void {
  const h = ghostHints.get(ta);
  if (!h) return;
  h.hint.scrollTop = ta.scrollTop;
  h.hint.scrollLeft = ta.scrollLeft;
}

function syncGhostGeometry(ta: HTMLTextAreaElement): void {
  const h = ghostHints.get(ta);
  if (!h) return;
  const cs = getComputedStyle(ta);
  // `ta` is now `background: transparent` (hint behind shows through), so
  // don't re-read `background`/`borderRadius`/`boxShadow`/`filter`/`opacity`
  // from `cs` — that would overwrite the correctly-cloned hint background
  // with transparent and cause the brightness flash. Only layout/font props
  // need live sync for resize.
  for (const prop of HINT_CLONE_PROPS) {
    const v = (cs as unknown as Record<string, string>)[prop];
    if (v != null) (h.hint.style as unknown as Record<string, string>)[prop] = v;
  }
  h.hint.style.borderColor = "transparent";
  h.hint.style.boxShadow = "none";
  // Keep wrapper's flex/margin in sync but don't freeze its width/height to
  // a px value — the wrapper stays at "100%" so the layout remains
  // responsive. The hint itself gets the correct px width/height from the
  // loop above and, being position:absolute with overflow:visible on the
  // wrapper, will still line up with the textarea even after the user drags
  // the resize handle to an explicit size (the previous bug was that those
  // explicit hint dimensions were only cloned once at creation).
  h.wrap.style.display = cs.display;
  h.wrap.style.flex = cs.flex;
  h.wrap.style.flexGrow = cs.flexGrow;
  h.wrap.style.flexShrink = cs.flexShrink;
  h.wrap.style.flexBasis = cs.flexBasis;
  h.wrap.style.margin = cs.margin;
  h.wrap.style.maxWidth = cs.maxWidth;
  h.wrap.style.minWidth = cs.minWidth;
  syncGhostScroll(ta);
}

function renderGhostSelection(ta: HTMLTextAreaElement): void {
  const caret = ta.selectionStart ?? ta.value.length;
  const collapsed = (ta.selectionEnd ?? caret) === caret;
  const gatesOpen =
    ghostEnabled && collapsed && !ghostSuppressed && caret === ta.value.length;

  let result: { completion: string } | null;
  if (
    lastGhostCompute &&
    lastGhostCompute.value === ta.value &&
    lastGhostCompute.caret === caret &&
    lastGhostCompute.gatesOpen === gatesOpen
  ) {
    result = lastGhostCompute.result;
  } else {
    result = gatesOpen
      ? computeGhost(ta.value, caret, detectVerdict(ta))
      : null;
    lastGhostCompute = { value: ta.value, caret, gatesOpen, result };
  }

  if (!result) {
    clearGhost(ta);
    return;
  }

  ghost = { start: caret, completion: result.completion };

  setGhostText(ta, ta.value + result.completion);
}

function hideGhost(ta?: HTMLTextAreaElement): void {
  clearGhost(ta ?? activeTA ?? undefined);
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function buildDdItem(item: DdItem, idx: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "exterstellar-better-goi-justif-item";
  el.setAttribute("role", "option");
  el.dataset.idx = String(idx);
  if (idx === ddSelIdx)
    el.classList.add("exterstellar-better-goi-justif-item--sel");

  if (item.kind === "snippet") {
    const text = document.createElement("div");
    text.className = "exterstellar-better-goi-justif-item-text";
    text.textContent = `${item.def.label} → ${item.resolved}`;

    const meta = document.createElement("div");
    meta.className = "exterstellar-better-goi-justif-item-meta";
    meta.appendChild(document.createTextNode(item.def.description));

    el.append(text, meta);
  } else if (item.kind === "phrase") {
    const p = item.phrase;
    const text = document.createElement("div");
    text.className = "exterstellar-better-goi-justif-item-text";
    text.textContent =
      p.text.length > 110 ? `${p.text.slice(0, 110)}…` : p.text;

    const meta = document.createElement("div");
    meta.className = "exterstellar-better-goi-justif-item-meta";
    const badge = document.createElement("span");
    badge.className = "exterstellar-better-goi-justif-badge";
    badge.textContent = "common";
    meta.appendChild(badge);
    meta.appendChild(
      document.createTextNode(
        `used ×${p.uses} across ${p.docs} reviews · ${relTime(p.lastUsed)}`,
      ),
    );

    el.append(text, meta);
  } else {
    const entry = item.entry;
    const text = document.createElement("div");
    text.className = "exterstellar-better-goi-justif-item-text";
    const firstLine = firstLineOf(entry.text);
    text.textContent =
      firstLine.length > 110 ? `${firstLine.slice(0, 110)}…` : firstLine;

    const meta = document.createElement("div");
    meta.className = "exterstellar-better-goi-justif-item-meta";
    if (entry.verdict !== "any") {
      const badge = document.createElement("span");
      badge.className = "exterstellar-better-goi-justif-badge";
      badge.textContent = entry.verdict;
      meta.appendChild(badge);
    }
    meta.appendChild(
      document.createTextNode(
        `used ×${entry.uses} · ${relTime(entry.lastUsed)}`,
      ),
    );

    el.append(text, meta);
  }

  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", () => {
    if (!activeTA) return;
    if (item.kind === "snippet") acceptSnippet(activeTA, item);
    else if (item.kind === "phrase") acceptPhrase(activeTA, item.phrase);
    else acceptTemplate(activeTA, item.entry);
  });
  return el;
}

function positionDd(ta: HTMLTextAreaElement): void {
  const dd = ensureDdEl();
  const rect = ta.getBoundingClientRect();
  const width = Math.max(rect.width, 280);
  dd.style.visibility = "hidden";
  dd.style.left = "0px";
  dd.style.top = "0px";
  dd.style.width = `${width}px`;

  const ddHeight = dd.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  let top: number;
  if (spaceBelow < ddHeight + 12 && rect.top > ddHeight + 12) {
    top = rect.top + window.scrollY - ddHeight - 6;
  } else {
    top = rect.bottom + window.scrollY + 6;
  }
  dd.style.left = `${rect.left + window.scrollX}px`;
  dd.style.top = `${top}px`;
  dd.style.visibility = "";
}

function renderDd(ta: HTMLTextAreaElement): void {
  const dd = ensureDdEl();
  dd.textContent = "";
  ddItems.forEach((item, idx) => dd.appendChild(buildDdItem(item, idx)));

  if (ddItems.length > 0) {
    const hint = document.createElement("div");
    hint.className = "exterstellar-better-goi-justif-hint";
    hint.innerHTML =
      "<kbd>↑</kbd><kbd>↓</kbd> pick &nbsp; <kbd>Tab</kbd> use &nbsp; <kbd>Esc</kbd> close";
    dd.appendChild(hint);
  }

  if (ddItems.length === 0) {
    hideDd();
    return;
  }

  ddOpen = true;
  positionDd(ta);
}

function hideDd(): void {
  ddOpen = false;
  ddSelIdx = -1;
  ddItems = [];
  ddEl?.remove();
  ddEl = null;
}

function hideAll(): void {
  hideGhost();
  hideDd();
}

function acceptGhost(ta: HTMLTextAreaElement): void {
  if (!ghost) return;
  const caret = ta.selectionStart ?? ta.value.length;
  const completion = ghost.completion;
  const insertAt = caret;
  const before = ta.value.slice(0, insertAt);
  const after = ta.value.slice(insertAt);

  lastAccept = { prevValue: ta.value, entryText: completion };
  undoWaiting = true;
  acceptedText = completion;
  ta.value = before + completion + after;
  const newCaret = insertAt + completion.length;
  ta.setSelectionRange(newCaret, newCaret);
  clearGhost(ta);
  dispatchProgrammaticInput(ta);
  suppressUntil = Date.now() + 1200;
}

function applyInsertion(ta: HTMLTextAreaElement, text: string): void {
  const caret = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? caret;
  const before = ta.value.slice(0, caret);
  const after = ta.value.slice(end);

  let newValue: string;
  let newCaret: number;
  if (
    before.length > 0 &&
    text.toLowerCase().startsWith(before.toLowerCase())
  ) {
    newValue = text + after;
    newCaret = text.length;
  } else {
    const sep = before.length > 0 && !/\s$/.test(before) ? " " : "";
    newValue = before + sep + text + after;
    newCaret = before.length + sep.length + text.length;
  }

  lastAccept = { prevValue: ta.value, entryText: text };
  undoWaiting = true;
  acceptedText = text;
  ta.value = newValue;
  ta.setSelectionRange(newCaret, newCaret);
  dispatchProgrammaticInput(ta);
}

function acceptTemplate(ta: HTMLTextAreaElement, entry: JustifEntry): void {
  applyInsertion(ta, entry.text);
  hideDd();
  bumpUsage(entry.text, detectVerdict(ta));
  suppressUntil = Date.now() + 1200;
  ta.focus();
}

function acceptPhrase(ta: HTMLTextAreaElement, phrase: Countable): void {
  applyInsertion(ta, phrase.text);
  hideDd();
  bumpUsage(phrase.text, detectVerdict(ta));
  suppressUntil = Date.now() + 1200;
  ta.focus();
}

function acceptSnippet(
  ta: HTMLTextAreaElement,
  item: { def: SnippetDef; resolved: string },
): void {
  const caret = ta.selectionStart ?? ta.value.length;
  const before = ta.value.slice(0, caret);
  const braceIdx = before.lastIndexOf("{");
  if (braceIdx < 0) return;

  lastAccept = { prevValue: ta.value, entryText: item.resolved };
  undoWaiting = true;
  acceptedText = item.resolved;
  ta.value =
    ta.value.slice(0, braceIdx) + item.resolved + ta.value.slice(caret);
  const newCaret = braceIdx + item.resolved.length;
  ta.setSelectionRange(newCaret, newCaret);
  dispatchProgrammaticInput(ta);
  hideDd();
  suppressUntil = Date.now() + 1200;
  ta.focus();
}

async function undoAccept(ta: HTMLTextAreaElement): Promise<void> {
  const accept = lastAccept;
  if (!accept) return;
  acceptedText = accept.prevValue;
  ta.value = accept.prevValue;
  ta.setSelectionRange(ta.value.length, ta.value.length);
  undoWaiting = true;
  dispatchProgrammaticInput(ta);

  if (!storeLoaded) await storageLoad();
  const key = normalizeKey(accept.entryText);
  const entry = store.entries.find((e) => normalizeKey(e.text) === key);
  if (entry && entry.uses > 0) entry.uses -= 1;
  const phrase = store.phrases.find(
    (p) => p.key === normalizeWordKey(accept.entryText),
  );
  if (phrase && phrase.uses > 0) phrase.uses -= 1;
  const chunk = store.chunks.find(
    (c) => c.key === normalizeWordKey(accept.entryText),
  );
  if (chunk && chunk.uses > 0) chunk.uses -= 1;
  chunkIndex = null;
  storageSave();

  lastAccept = null;
  scheduleUpdateUI(ta);
}

let uiRafPending = false;
let uiPendingTA: HTMLTextAreaElement | null = null;

function scheduleUpdateUI(ta: HTMLTextAreaElement): void {
  uiPendingTA = ta;
  if (uiRafPending) return;
  uiRafPending = true;
  requestAnimationFrame(() => {
    uiRafPending = false;
    const t = uiPendingTA;
    uiPendingTA = null;
    if (t && t.isConnected) updateUI(t);
  });
}

function updateUI(ta: HTMLTextAreaElement): void {
  if (document.activeElement !== ta || !ta.isConnected) {
    hideAll();
    return;
  }

  const caret = ta.selectionStart ?? ta.value.length;

  if (snippetEnabled && Date.now() >= suppressUntil) {
    const snippet = detectSnippet(ta.value, caret);
    if (snippet) {
      hideGhost();
      const devlogItem = ta.closest(".devlog-item");
      const matches = SNIPPETS.filter((s) =>
        s.trigger.startsWith(snippet.trigger),
      );
      ddItems = matches.map((def) => ({
        kind: "snippet" as const,
        def,
        resolved: def.resolve(devlogItem),
      }));
      ddSelIdx = -1;
      if (ddItems.length > 0) renderDd(ta);
      else hideDd();
      return;
    }
  }

  if (forceShowNext) {
    forceShowNext = false;
    const now = Date.now();
    const entryItems = topEntries(
      detectVerdict(ta),
      commonPhrasesEnabled ? 6 - 2 : 6,
    ).map((entry) => ({
      kind: "template" as const,
      entry,
    }));
    const phraseItems: DdItem[] = commonPhrasesEnabled
      ? [...store.phrases]
          .filter((p) => p.docs >= 2)
          .sort((a, b) => recencyScore(b, now) - recencyScore(a, now))
          .slice(0, 2)
          .map((p) => ({ kind: "phrase" as const, phrase: p }))
      : [];
    ddItems = [...entryItems, ...phraseItems].filter(
      (i) => !rejectedKeys.has(itemText(i) ?? ""),
    );
    ddSelIdx = -1;
    renderDd(ta);
    return;
  }

  if (ghostEnabled && !ghostSuppressed) renderGhostSelection(ta);
  else hideGhost();

  if (ghost) {
    hideDd();
    return;
  }

  const before = ta.value.slice(0, caret);
  const lineStart = before.lastIndexOf("\n") + 1;
  const query = before.slice(lineStart);

  if (ddSuppressed) {
    hideDd();
    return;
  }
  if (query.trim().length >= 2 || ta.value.includes("\n")) {
    const nowTs = Date.now();

    if (nowTs - lastDdComputeAt >= 120) {
      lastDdComputeAt = nowTs;
      const items = computeTemplates(
        query,
        detectVerdict(ta),
        ta.value.length,
      ).filter((i) => !rejectedKeys.has(itemText(i) ?? ""));
      if (items.length > 0) {
        const topText = itemText(items[0]) ?? null;
        const prevText = ddItems[0] ? itemText(ddItems[0]) : "";
        ddSelIdx = prevText === topText ? ddSelIdx : -1;
        ddItems = items;
        renderDd(ta);
        return;
      }
    } else if (ddItems.length > 0) {
      return;
    }
  }
  hideDd();
}

function capture(ta: HTMLTextAreaElement): void {
  const state = attachedStates.get(ta);
  if (!state) return;

  const value = ta.value.trim();
  if (!state.dirty) return;
  if (!value || value === state.baseline.trim()) return;
  if (value.length < 8) return;

  const now = Date.now();
  if (state.lastCaptureValue === value && now - state.lastCaptureAt < 4000)
    return;

  const idle = now - state.lastInputAt;
  if (idle < 3000) return;

  state.lastCaptureValue = value;
  state.lastCaptureAt = now;
  void learn(value, detectVerdict(ta));
}

function relearnOnVerdict(e: MouseEvent): void {
  if (!enabled) return;
  const target = e.target as Element | null;
  if (!target) return;

  let verdict: Verdict | null = null;
  if (
    target.closest(
      '[data-certification--ysws--devlog-review-target="approveButton"]',
    )
  )
    verdict = "approve";
  else if (
    target.closest(
      '[data-certification--ysws--devlog-review-target="rejectButton"]',
    )
  )
    verdict = "reject";
  if (!verdict) return;

  const panel = target.closest(".devlog-review-panel");
  if (!panel) return;

  const ta = panel.querySelector<HTMLTextAreaElement>("textarea");
  if (!ta || !isJustificationTextarea(ta)) return;

  const value = ta.value.trim();
  if (value.length < 8) return;

  void learn(value, verdict);

  const st = attachedStates.get(ta);
  if (st) {
    st.lastCaptureValue = value;
    st.lastCaptureAt = Date.now();
  }
}

function handleKeydown(ta: HTMLTextAreaElement, e: KeyboardEvent): void {
  // Debug shortcut: Ctrl+Shift+G while focused copies ghost alignment dump
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
    e.preventDefault();
    const h = ghostHints.get(ta);
    const domHint = (ta.parentElement?.querySelector(
      'div[aria-hidden="true"]',
    ) ?? null) as HTMLDivElement | null;
    const hintEl = h?.hint ?? domHint;
    const gc = (el: Element) => getComputedStyle(el as Element);
    const span = hintEl?.querySelector("span") as HTMLSpanElement | null;
    const dump: Record<string, unknown> = {
      taRect: ta.getBoundingClientRect(),
      hintRect: hintEl?.getBoundingClientRect() ?? null,
      spanRect: span?.getBoundingClientRect() ?? null,
      taLineHeight: gc(ta).lineHeight,
      hintLineHeight: hintEl ? gc(hintEl).lineHeight : null,
      hintHtml: hintEl?.innerHTML.slice(0, 300),
      ghost,
      sel: ta.selectionStart,
    };
    const txt = JSON.stringify(dump, null, 2);
    navigator.clipboard?.writeText(txt).catch(() => {});
    console.log("[ghost debug]", dump);
    // also show in prompt so you can copy even if clipboard blocked
    window.prompt("Ghost debug — Ctrl+C to copy", txt);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.code === "Space" || e.key === " ")) {
    e.preventDefault();
    forceShowNext = true;
    ghostSuppressed = false;
    escapeValueLen = -1;
    rejectedKeys.clear();
    ddSuppressed = false;
    scheduleUpdateUI(ta);
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    if (undoWaiting && lastAccept) {
      e.preventDefault();
      void undoAccept(ta);
      return;
    }
  }

  if (e.key === "Escape") {
    if (ddOpen && ddItems.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const sel = ddSelIdx >= 0 ? ddItems[ddSelIdx] : ddItems[0];
      const selText = itemText(sel);
      if (selText) rejectedKeys.add(selText);
      ddSuppressed = true;
      hideDd();
      return;
    }
    if (ghost) {
      e.preventDefault();
      e.stopPropagation();
      hideDd();
      hideGhost();
      ghostSuppressed = true;
      escapeValueLen = ta.value.length;
    }
    return;
  }

  if (ddOpen && ddItems.length > 0) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      ddSelIdx = (ddSelIdx + delta + ddItems.length) % ddItems.length;
      ddEl
        ?.querySelectorAll(".exterstellar-better-goi-justif-item")
        .forEach((el, idx) => {
          el.classList.toggle(
            "exterstellar-better-goi-justif-item--sel",
            idx === ddSelIdx,
          );
        });
      const sel = ddEl?.querySelectorAll(
        ".exterstellar-better-goi-justif-item",
      )[ddSelIdx];
      sel?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (e.key === "Enter" && ddSelIdx >= 0) {
      e.preventDefault();
      const item = ddItems[ddSelIdx];
      if (item?.kind === "snippet") acceptSnippet(ta, item);
      else if (item?.kind === "phrase") acceptPhrase(ta, item.phrase);
      else if (item?.kind === "template") acceptTemplate(ta, item.entry);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const hasSubstantialText = ta.value.length > 50;
      if (hasSubstantialText && ddSelIdx < 0) return;
      const item = ddSelIdx >= 0 ? ddItems[ddSelIdx] : ddItems[0];
      if (item?.kind === "snippet") acceptSnippet(ta, item);
      else if (item?.kind === "phrase") acceptPhrase(ta, item.phrase);
      else if (item?.kind === "template") acceptTemplate(ta, item.entry);
      return;
    }
  }

  if (e.key === "Tab" && ghost && !ghostSuppressed) {
    e.preventDefault();
    acceptGhost(ta);
  }
}

function attach(ta: HTMLTextAreaElement): void {
  if (taCleanups.has(ta)) return;

  attachedStates.set(ta, {
    baseline: ta.value,
    dirty: false,
    lastInputAt: 0,
    lastCaptureValue: null,
    lastCaptureAt: 0,
  });

  const markDirty = () => {
    const state = attachedStates.get(ta);
    if (state) {
      state.dirty = true;
      state.lastInputAt = Date.now();
    }
  };

  const onInput = (e: Event) => {
    if (!enabled) return;

    if (ta.value.trim() === "") rejectedKeys.clear();

    if (programmaticInput) {
      markDirty();
      return;
    }

    if (undoWaiting && lastAccept && ta.value === lastAccept.prevValue) {
      undoWaiting = false;
      acceptedText = null;
      void undoAccept(ta);
    }

    if (undoWaiting && acceptedText !== null && ta.value !== acceptedText) {
      undoWaiting = false;
      acceptedText = null;
      lastAccept = null;
    }

    markDirty();
    if (ghostSuppressed && escapeValueLen >= 0) {
      if (ta.value.length - escapeValueLen >= 3) {
        ghostSuppressed = false;
        escapeValueLen = -1;
      }
    } else {
      ghostSuppressed = false;
    }
    if (Date.now() < suppressUntil) {
      hideAll();
      return;
    }

    const caret = ta.selectionStart ?? ta.value.length;
    const autoSnip = checkAutoSnippet(ta, ta.value, caret);
    if (autoSnip) {
      ta.value =
        ta.value.slice(0, autoSnip.startPos) +
        autoSnip.replacement +
        ta.value.slice(autoSnip.endPos);
      const newCaret = autoSnip.startPos + autoSnip.replacement.length;
      ta.setSelectionRange(newCaret, newCaret);
      suppressUntil = Date.now() + 1200;
      hideAll();
      return;
    }

    if (!(e instanceof InputEvent) || !e.isComposing) renderGhostSelection(ta);
    scheduleUpdateUI(ta);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (!enabled) return;
    handleKeydown(ta, e);
  };

  const onKeyup = () => {
    if (!enabled) return;
    if (ghostSuppressed) return;
    if (document.activeElement === ta) scheduleUpdateUI(ta);
  };

  const onFocus = () => {
    if (!enabled) return;
    window.clearTimeout(blurTimer);
    activeTA = ta;
    ddSuppressed = false;
    scheduleUpdateUI(ta);
  };

  const onBlur = () => {
    window.clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => {
      clearGhost(ta);
      if (activeTA === ta) {
        activeTA = null;
        hideDd();
      }
      capture(ta);
    }, 150);
  };

  const onSelect = () => {
    if (!enabled) return;

    if (ghost) {
      const s = ta.selectionStart ?? 0;
      const e = ta.selectionEnd ?? s;
      if (s !== ghost.start || e !== ghost.start) clearGhost(ta);
    }
    if (document.activeElement === ta) scheduleUpdateUI(ta);
  };

  const onSubmit = () => {
    if (!enabled) return;
    clearGhost(ta);
    capture(ta);
  };

  const onScroll = () => {
    if (!enabled) return;

    syncGhostScroll(ta);
  };

  const onTurboSubmitEnd = (e: Event) => {
    if (!enabled) return;
    const detail = (e as CustomEvent).detail as
      { success?: boolean } | undefined;
    if (detail && detail.success === false) return;
    clearGhost(ta);
    capture(ta);
  };

  ta.addEventListener("input", onInput);
  ta.addEventListener("scroll", onScroll);
  ta.addEventListener("keydown", onKeydown);
  ta.addEventListener("keyup", onKeyup);
  ta.addEventListener("focus", onFocus);
  ta.addEventListener("blur", onBlur);
  ta.addEventListener("click", onSelect);
  ta.addEventListener("select", onSelect);
  ta.addEventListener("submit", onSubmit);
  ta.addEventListener("turbo:submit-end", onTurboSubmitEnd);

  const form = ta.closest("form");
  form?.addEventListener("submit", onSubmit);
  form?.addEventListener("turbo:submit-end", onTurboSubmitEnd);

  const ro = new ResizeObserver(() => {
    if (ghostHints.has(ta)) syncGhostGeometry(ta);
    if (activeTA === ta) {
      if (ddEl) positionDd(ta);
      // Re-render ghost so the new dimensions are used for wrapping.
      if (ghostEnabled && document.activeElement === ta) renderGhostSelection(ta);
    }
  });
  const roTargets = new Set<Element>([ta]);
  if (ta.parentElement) roTargets.add(ta.parentElement);
  if (ta.offsetParent) roTargets.add(ta.offsetParent);
  roTargets.forEach((t) => ro.observe(t));

  taCleanups.set(ta, () => {
    ro.disconnect();
    ta.removeEventListener("input", onInput);
    ta.removeEventListener("scroll", onScroll);
    ta.removeEventListener("keydown", onKeydown);
    ta.removeEventListener("keyup", onKeyup);
    ta.removeEventListener("focus", onFocus);
    ta.removeEventListener("blur", onBlur);
    ta.removeEventListener("click", onSelect);
    ta.removeEventListener("select", onSelect);
    ta.removeEventListener("submit", onSubmit);
    ta.removeEventListener("turbo:submit-end", onTurboSubmitEnd);
    form?.removeEventListener("submit", onSubmit);
    form?.removeEventListener("turbo:submit-end", onTurboSubmitEnd);
    destroyGhostHint(ta);
  });
}

function scan(root: ParentNode): void {
  if (!enabled) return;
  root.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((ta) => {
    if (isJustificationTextarea(ta)) attach(ta);
  });
}

function repositionOnScroll(): void {
  if (!activeTA) return;
  if (ghostHints.has(activeTA)) syncGhostGeometry(activeTA);
  if (!activeTA.isConnected) {
    hideAll();
    return;
  }
  if (!ddOpen || !ddEl) return;
  positionDd(activeTA);
}

export async function handleJustificationAutocomplete(cfg: Cfg): Promise<void> {
  enabled =
    cfg.autoGoipletion !== false &&
    cfg.autoGoipletion !== "false";
  ghostEnabled =
    cfg.autoGoipletionGhostText !== false &&
    cfg.autoGoipletionGhostText !== "false";
  snippetEnabled = cfg.snippetInsert !== false && cfg.snippetInsert !== "false";
  commonPhrasesEnabled =
    cfg.autoGoipletionCommonPhrases !== false &&
    cfg.autoGoipletionCommonPhrases !== "false";
  chunkCompletionEnabled = commonPhrasesEnabled;

  if (!enabled) {
    hideAll();
    return;
  }

  if (!storeLoaded) await storageLoad();

  scan(document);

  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLTextAreaElement) {
          if (isJustificationTextarea(node)) attach(node);
        } else {
          scan(node);
        }
      }
    }
  });
  observer.observe(document.documentElement ?? document, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("scroll", repositionOnScroll, true);
  window.addEventListener("resize", repositionOnScroll);
  document.addEventListener("click", relearnOnVerdict, true);
}

export function teardownJustificationAutocomplete(): void {
  enabled = false;
  observer?.disconnect();
  observer = null;
  document.removeEventListener("scroll", repositionOnScroll, true);
  window.removeEventListener("resize", repositionOnScroll);
  document.removeEventListener("click", relearnOnVerdict, true);
  window.clearTimeout(blurTimer);
  hideAll();
  for (const cleanup of taCleanups.values()) cleanup();
  taCleanups.clear();
}