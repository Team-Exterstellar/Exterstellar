import { extractPointValue } from "./chartUtils";

// sabio's good code (IF YOU TOUCH THIS I WILL FIND YOU - I touched the comment :3 - i will find u - Claude now has touched this in rewrite)
// rank overtaking visual thingy idk

export function sumSeriesBeforeCutoff(data: any[], cutoffIndex: number): number {
  let total = 0;
  for (let i = 0; i < cutoffIndex; i++) {
    total += extractPointValue(data[i]);
  }
  return total;
}

export function computeRanksAtCutoff(
  chart: any,
  cutoffIndex: number,
): Map<string, number> {
  const datasets: any[] = chart.data.datasets ?? [];

  const totals = datasets.map((d) => ({
    username: (d.label ?? "").trim().toLowerCase(),
    total: sumSeriesBeforeCutoff(d.data ?? [], cutoffIndex),
  }));

  totals.sort((a, b) => b.total - a.total);

  const ranks = new Map<string, number>();
  totals.forEach((t, i) => ranks.set(t.username, i + 1));
  return ranks;
}

export function formatRankChange(
  current: number,
  previous: number | undefined,
): string {
  if (previous === undefined) return "New";

  const diff = previous - current;
  if (diff === 0) return "-";
  return diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`;
}

export function computeDaysOnTop(chart: any): Map<string, number> {
  const datasets: any[] = chart.data.datasets ?? [];
  const labels: string[] = chart.data.labels ?? [];

  const wins = new Map<string, number>();
  for (const d of datasets) {
    wins.set((d.label ?? "").trim().toLowerCase(), 0);
  }

  for (let day = 0; day < labels.length; day++) {
    let topUsername: string | null = null;
    let topValue = 0;

    for (const d of datasets) {
      const value = extractPointValue(d.data?.[day]);
      if (value > topValue) {
        topValue = value;
        topUsername = (d.label ?? "").trim().toLowerCase();
      }
    }

    if (topUsername && topValue > 0) {
      wins.set(topUsername, (wins.get(topUsername) ?? 0) + 1);
    }
  }

  return wins;
}

export function computeCumulativeStateForDay(
  chart: any,
  dayIndex: number,
): { ranks: Map<string, number>; totals: Map<string, number> } {
  const datasets: any[] = chart.data.datasets ?? [];
  const cutoffIndex = dayIndex + 1;

  const entries = datasets.map((d) => ({
    username: (d.label ?? "").trim().toLowerCase(),
    total: sumSeriesBeforeCutoff(d.data ?? [], cutoffIndex),
  }));

  entries.sort((a, b) => b.total - a.total);

  const ranks = new Map<string, number>();
  const totals = new Map<string, number>();
  entries.forEach((e, i) => {
    ranks.set(e.username, i + 1);
    totals.set(e.username, e.total);
  });

  return { ranks, totals };
}