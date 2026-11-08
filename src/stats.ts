// Numbers worked out from the contribution calendar of the last 12 months, for the streaks card.
import { formatDay, formatMonth, formatNumber, plural } from './render/svg.ts';
import type { Snapshot } from './types.ts';

/** A big number (or short text) with its label under it. */
export interface Tile {
  label: string;
  value: number | string;
}

const DAY = 24 * 60 * 60 * 1000;

/** The longest run of active days, and the run reaching today; a quiet today doesn't end a streak. */
export function streakLengths(days: Snapshot['calendar']): { current: number; longest: number } {
  const dates = [...new Map(days.map((d) => [d.date, d.count])).entries()].sort(([a], [b]) => a.localeCompare(b));
  let longest = 0;
  let run = 0;
  let previous = 0;
  for (const [date, count] of dates) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (count > 0) {
      run = previous && time - previous === DAY ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = time;
    } else {
      run = 0;
      previous = 0;
    }
  }
  const reaching = dates.at(-1)?.[1] === 0 ? dates.slice(0, -1) : dates;
  let current = 0;
  for (let i = reaching.length - 1; i >= 0 && reaching[i][1] > 0; i--) {
    const gap = i < reaching.length - 1 ? Date.parse(reaching[i + 1][0]) - Date.parse(reaching[i][0]) : DAY;
    if (gap !== DAY) break;
    current++;
  }
  return { current, longest };
}

/** The days in order, and where the current and longest runs, the best day and the best month are. */
export interface StreakDays {
  days: { date: string; count: number }[];
  /** First and last index of a run of active days. */
  current: [number, number] | null;
  longest: [number, number] | null;
  best: number | null;
  /** "YYYY-MM" */
  bestMonth: string | null;
}

export function streakDays(all: Snapshot['calendar']): StreakDays {
  const days = [...new Map(all.map((d) => [d.date, d.count])).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
  const { current, longest } = streakLengths(days);
  // The runs again, as places: the longest one that ends last, and the one reaching the end.
  let longestAt: [number, number] | null = null;
  let start = -1;
  days.forEach((d, i) => {
    const follows = i > 0 && Date.parse(`${d.date}T00:00:00Z`) - Date.parse(`${days[i - 1].date}T00:00:00Z`) === DAY;
    if (d.count > 0) {
      if (start < 0 || !follows || days[i - 1].count === 0) start = i;
      if (longest && i - start + 1 === longest) longestAt = [start, i];
    } else start = -1;
  });
  const last = days.length && days[days.length - 1].count === 0 ? days.length - 2 : days.length - 1;
  const currentAt: [number, number] | null = current ? [last - current + 1, last] : null;
  let best: number | null = null;
  days.forEach((d, i) => { if (d.count > 0 && (best === null || d.count > days[best].count)) best = i; });
  const months = new Map<string, number>();
  for (const d of days) if (d.count > 0) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.count);
  const bestMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { days, current: currentAt, longest: longestAt, best, bestMonth };
}

export function streakStats(days: Snapshot['calendar']): Tile[] {
  const { current, longest } = streakLengths(days);
  const active = days.filter((d) => d.count > 0);
  const total = active.reduce((s, d) => s + d.count, 0);
  const best = active.reduce<Snapshot['calendar'][number] | null>((top, d) => (top && top.count >= d.count ? top : d), null);
  const months = new Map<string, number>();
  for (const d of active) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.count);
  const bestMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
  return [
    { label: 'Current streak', value: plural(current, 'day') },
    { label: 'Longest streak', value: plural(longest, 'day') },
    { label: 'Active days', value: active.length },
    { label: 'Per active day', value: active.length ? formatNumber(total / active.length) : 0 },
    { label: best ? `Best day · ${formatDay(best.date)}, ${best.date.slice(0, 4)}` : 'Best day', value: best?.count ?? 0 },
    { label: bestMonth ? `Best month · ${formatMonth(`${bestMonth[0]}-01`)}` : 'Best month', value: bestMonth?.[1] ?? 0 },
  ];
}
