export interface SnippetDef {
  trigger: string;
  label: string;
  description: string;
  resolve: (devlogItem: Element | null) => string;
}

function scrapeCommits(devlogItem: Element | null): string {
  if (!devlogItem) return "?";
  const texts = devlogItem.querySelectorAll(".devlog-git-section svg text");
  for (const t of Array.from(texts)) {
    const m = (t.textContent ?? "").trim().match(/^(\d+)\s+commits?$/);
    if (m) return m[1] ?? "?";
  }
  return "?";
}

function scrapeHours(devlogItem: Element | null): string {
  if (!devlogItem) return "?";
  const tv = devlogItem.querySelector(".time-value");
  const m = (tv?.textContent ?? "").match(/([\d.]+)/);
  return m?.[1] ?? "?";
}

function scrapeLines(devlogItem: Element | null): string {
  if (!devlogItem) return "?";
  const texts = devlogItem.querySelectorAll(".devlog-git-section svg text");
  let adds = "";
  let dels = "";
  for (const t of Array.from(texts)) {
    const content = (t.textContent ?? "").trim();
    if (!adds && /^\+\d+$/.test(content)) adds = content;
    if (!dels && /^-\d+$/.test(content)) dels = content;
  }
  return adds || dels ? `${adds} / ${dels}` : "?";
}

function scrapeApprovedMinutes(devlogItem: Element | null): string {
  if (!devlogItem) return "?";
  const input = devlogItem.querySelector<HTMLInputElement>(
    '[data-certification--ysws--devlog-review-target="minutesInput"]',
  );
  return input ? String(parseInt(input.value, 10) || 0) : "?";
}

function scrapeApprovedHours(devlogItem: Element | null): string {
  if (!devlogItem) return "?";
  const input = devlogItem.querySelector<HTMLInputElement>(
    '[data-certification--ysws--devlog-review-target="minutesInput"]',
  );
  if (!input) return "?";
  const mins = parseInt(input.value, 10) || 0;
  return String(Math.round((mins / 60) * 100) / 100);
}

function scrapeDevlogs(): string {
  const h3 = document.querySelector(".devlogs-header h3");
  const m = (h3?.textContent ?? "").match(/\((\d+)\)/);
  return m?.[1] ?? "?";
}

function scrapeCommitsAll(): string {
  let total = 0;
  const items = document.querySelectorAll(".devlog-item");
  for (const item of Array.from(items)) {
    const texts = item.querySelectorAll(".devlog-git-section svg text");
    for (const t of Array.from(texts)) {
      const m = (t.textContent ?? "").trim().match(/^(\d+)\s+commits?$/);
      if (m) {
        total += parseInt(m[1] ?? "0", 10);
        break;
      }
    }
  }
  return String(total);
}

function scrapeHoursAll(): string {
  let total = 0;
  const items = document.querySelectorAll(".devlog-item");
  for (const item of Array.from(items)) {
    const tv = item.querySelector(".time-value");
    const m = (tv?.textContent ?? "").match(/([\d.]+)/);
    if (m?.[1]) total += parseFloat(m[1]);
  }
  return String(Math.round(total * 100) / 100);
}

function scrapeApprovedMinutesAll(): string {
  let total = 0;
  const inputs = document.querySelectorAll<HTMLInputElement>(
    '[data-certification--ysws--devlog-review-target="minutesInput"]',
  );
  for (const input of Array.from(inputs)) {
    total += parseInt(input.value, 10) || 0;
  }
  return String(total);
}

function scrapeApprovedHoursAll(): string {
  let total = 0;
  const inputs = document.querySelectorAll<HTMLInputElement>(
    '[data-certification--ysws--devlog-review-target="minutesInput"]',
  );
  for (const input of Array.from(inputs)) {
    total += parseInt(input.value, 10) || 0;
  }
  return String(Math.round((total / 60) * 100) / 100);
}

export const SNIPPETS: SnippetDef[] = [
  {
    trigger: "commits",
    label: "{commits}",
    description: "Commits — this devlog",
    resolve: scrapeCommits,
  },
  {
    trigger: "commitsAll",
    label: "{commitsAll}",
    description: "Commits — all devlogs",
    resolve: () => scrapeCommitsAll(),
  },
  {
    trigger: "hours",
    label: "{hours}",
    description: "Original hours — this devlog",
    resolve: scrapeHours,
  },
  {
    trigger: "hoursAll",
    label: "{hoursAll}",
    description: "Original hours — all devlogs",
    resolve: () => scrapeHoursAll(),
  },
  {
    trigger: "approvedMinutes",
    label: "{approvedMinutes}",
    description: "Approved minutes — this devlog",
    resolve: scrapeApprovedMinutes,
  },
  {
    trigger: "approvedMinutesAll",
    label: "{approvedMinutesAll}",
    description: "Approved minutes — all devlogs",
    resolve: () => scrapeApprovedMinutesAll(),
  },
  {
    trigger: "approved",
    label: "{approved}",
    description: "Approved hours — this devlog",
    resolve: scrapeApprovedHours,
  },
  {
    trigger: "approvedAll",
    label: "{approvedAll}",
    description: "Approved hours — all devlogs",
    resolve: () => scrapeApprovedHoursAll(),
  },
  {
    trigger: "devlogs",
    label: "{devlogs}",
    description: "Total devlog count",
    resolve: () => scrapeDevlogs(),
  },
  {
    trigger: "lines",
    label: "{lines}",
    description: "Lines added / removed — this devlog",
    resolve: scrapeLines,
  },
];
