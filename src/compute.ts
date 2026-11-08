import { repoKey, type Config } from './config.ts';
import { streakDays, streakStats, type StreakDays, type Tile } from './stats.ts';
import type { ContributionWindow, Snapshot } from './types.ts';

export type CountKey = 'commits' | 'pullRequests' | 'reviews' | 'issues';

export interface SummaryModel {
  title: string | null;
  ring: Config['cards']['summary']['ring'];
  rows: { key: CountKey; label: string; last12Months: number; allTime: number }[];
  /** Stars received in the last 12 months, and the current total. */
  stars: { last12Months: number; allTime: number };
  activity: { activeDays: number; totalDays: number; percent: number };
}

export interface LanguageItem {
  name: string;
  /** null for "Other". */
  color: string | null;
  percent: number;
}

export interface ContributionItem {
  repo: string;
  owner: string;
  stars: number;
  avatar: string | null;
  merged: number;
  open: number;
  /** ISO date of the latest merge, or of the latest opened pull request if none merged. */
  lastDate: string;
}

/** Contributions per weekday over the last 12 months, Monday first. */
export interface WeekdayItem {
  day: string;
  count: number;
}

/** The weekly card's numbers: the busiest and the quietest weekday, and the share of Monday to Friday. */
export interface WeekdayFacts {
  busiest: WeekdayItem;
  quietest: WeekdayItem;
  /** Percent of the contributions made Monday to Friday. */
  weekdays: number;
}

export function weekdayFacts(days: WeekdayItem[]): WeekdayFacts {
  const total = days.reduce((s, d) => s + d.count, 0);
  const busiest = days.reduce((top, d) => (d.count > top.count ? d : top), days[0]);
  const quietest = days.reduce((low, d) => (d.count < low.count ? d : low), days[0]);
  const weekdays = days.slice(0, 5).reduce((s, d) => s + d.count, 0);
  return { busiest, quietest, weekdays: total ? Math.round((weekdays / total) * 100) : 0 };
}

/** A weekday's full name, from its short one. */
export const DAY_NAMES: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

export interface Model {
  summary: SummaryModel;
  languages: LanguageItem[];
  contributions: ContributionItem[];
  weekly: WeekdayItem[];
  streaks: Tile[];
  /** The days behind the streaks, for the OLED card's strip. */
  streakDays: StreakDays;
  /** Things the user should know, e.g. config entries that matched nothing. */
  notes: string[];
}

const ROW_LABELS: Record<CountKey, string> = {
  commits: 'Commits',
  pullRequests: 'PRs created',
  reviews: 'PRs reviewed',
  issues: 'Issues',
};

const FIELDS = ['commits', 'pullRequests', 'reviews', 'issues'] as const;

export function compute(snapshot: Snapshot, config: Config): Model {
  const notes: string[] = [];
  const login = snapshot.user.login.toLowerCase();
  const include = config.count;

  const included = (key: string): boolean => {
    const repo = snapshot.repos[key];
    if (!repo) return false;
    if (!include.private && repo.isPrivate) return false;
    if (!include.orgs && repo.ownerIsOrg && snapshot.orgs.includes(repo.owner.toLowerCase())) return false;
    return true;
  };

  const known = (refs: string[], setting: string): Set<string> => {
    const keys = new Set(refs.map((r) => repoKey(r, login)));
    for (const k of keys) if (!snapshot.repos[k]) notes.push(`${setting}: "${k}" matched no repository you contributed to`);
    return keys;
  };

  // Summary: both columns from the contributions API, only the time window differs.
  const filtering = !include.private || !include.orgs;
  const counts = (windows: ContributionWindow[]) => {
    const sums: Record<CountKey, number> = { commits: 0, pullRequests: 0, reviews: 0, issues: 0 };
    for (const w of windows) {
      const listed = { commits: 0, pullRequests: 0, reviews: 0, issues: 0 };
      for (const [key, c] of Object.entries(w.byRepo)) {
        for (const f of FIELDS) listed[f] += c[f];
        if (!included(key)) continue;
        for (const f of FIELDS) sums[f] += c[f];
      }
      // GitHub lists at most 100 repos per type and window; the rest only shows in the totals.
      // That rest can be counted only when nothing is filtered out.
      if (!filtering) for (const f of FIELDS) sums[f] += Math.max(0, w.totals[f] - listed[f]);
    }
    return sums;
  };
  const last12 = counts([snapshot.last12Months]);
  const all = counts(snapshot.allTime);
  const activeDays = snapshot.calendar.filter((d) => d.count > 0).length;
  const totalDays = snapshot.calendar.length;

  const summary: SummaryModel = {
    title: config.cards.summary.title,
    ring: config.cards.summary.ring,
    rows: (Object.keys(ROW_LABELS) as CountKey[]).map((key) => ({
      key,
      label: ROW_LABELS[key],
      last12Months: last12[key],
      allTime: all[key],
    })),
    stars: snapshot.ownedRepos
      .filter((k) => included(k) && !snapshot.repos[k].isFork)
      .reduce(
        (sum, k) => ({
          last12Months: sum.last12Months + (snapshot.recentStars[k] ?? 0),
          allTime: sum.allTime + snapshot.repos[k].stars,
        }),
        { last12Months: 0, allTime: 0 },
      ),
    activity: {
      activeDays,
      totalDays,
      percent: totalDays ? Math.round((activeDays / totalDays) * 100) : 0,
    },
  };

  // Languages: each repo's language mix, weighted by your commits there (all time).
  const lc = config.cards.languages;
  const excludedLangs = new Set(lc.hide.map((l) => l.toLowerCase()));
  const weights = new Map<string, number>(); // 0 leaves a repo out
  for (const [ref, w] of Object.entries(lc.repos)) weights.set(repoKey(ref, login), w);
  known(Object.keys(lc.repos), 'cards.languages.repos');

  const commitsByRepo = new Map<string, number>();
  for (const w of snapshot.allTime) {
    for (const [key, c] of Object.entries(w.byRepo)) {
      if (c.commits) commitsByRepo.set(key, (commitsByRepo.get(key) ?? 0) + c.commits);
    }
  }

  const scores = new Map<string, { color: string | null; score: number }>();
  for (const [key, commits] of commitsByRepo) {
    if (!included(key)) continue;
    const weight = weights.get(key) ?? 1;
    if (weight === 0) continue;
    // An excluded language's share of the repo is dropped, not handed to the repo's other languages.
    const langs = snapshot.repos[key].languages;
    const size = langs.reduce((s, l) => s + l.size, 0);
    if (!size) continue;
    for (const l of langs) {
      if (excludedLangs.has(l.name.toLowerCase())) continue;
      const entry = scores.get(l.name) ?? { color: l.color, score: 0 };
      entry.score += (commits * weight * l.size) / size;
      scores.set(l.name, entry);
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  // Without "Other", the languages shown share 100% between them, so the bar stays full.
  const total = (lc.other ? ranked : ranked.slice(0, lc.count)).reduce((s, [, e]) => s + e.score, 0);
  const languages: LanguageItem[] = ranked.slice(0, lc.count).map(([name, e]) => ({
    name,
    color: e.color,
    percent: total ? (e.score / total) * 100 : 0,
  }));
  const rest = ranked.slice(lc.count).reduce((s, [, e]) => s + e.score, 0);
  if (lc.other && total && (rest / total) * 100 >= 0.5) {
    languages.push({ name: 'Other', color: null, percent: (rest / total) * 100 });
  }

  // Notable contributions: merged (and optionally open) pull requests to public repos of other
  // people and organizations. Pull requests closed without merging never count.
  const cc = config.cards.contributions;
  const pins = known(cc.pin, 'cards.contributions.pin');
  const hidden = known(cc.hide, 'cards.contributions.hide');
  const outside = snapshot.pullRequests.filter((a) => {
    if (hidden.has(a.repo)) return false;
    if (a.state !== 'MERGED' && !(a.state === 'OPEN' && cc.open)) return false;
    const r = snapshot.repos[a.repo];
    const owner = r.owner.toLowerCase();
    return !r.isPrivate && owner !== login && !snapshot.orgs.includes(owner);
  });
  const grouped = new Map<string, ContributionItem & { dates: string[]; mergedDates: string[] }>();
  for (const pr of outside) {
    const repo = snapshot.repos[pr.repo];
    const item = grouped.get(pr.repo) ?? {
      repo: repo.nameWithOwner,
      owner: repo.owner,
      stars: repo.stars,
      avatar: snapshot.avatars[repo.owner.toLowerCase()] ?? null,
      merged: 0,
      open: 0,
      lastDate: '',
      dates: [],
      mergedDates: [],
    };
    if (pr.state === 'MERGED') item.merged++;
    else item.open++;
    item.dates.push(pr.createdAt);
    if (pr.mergedAt) item.mergedDates.push(pr.mergedAt);
    grouped.set(pr.repo, item);
  }
  // Pins take their places first; the remaining places go to the most starred.
  const eligible = [...grouped.entries()].sort((a, b) => b[1].stars - a[1].stars);
  const pinned = eligible.filter(([key]) => pins.has(key));
  const others = eligible.filter(([key]) => !pins.has(key)).slice(0, Math.max(0, cc.count - pinned.length));
  const contributions: ContributionItem[] = [...pinned, ...others]
    .map(([, { dates, mergedDates, ...item }]) => ({
      ...item,
      lastDate: (mergedDates.length ? mergedDates : dates).sort().at(-1) ?? '',
    }))
    .sort((a, b) => b.stars - a.stars);
  for (const key of pins) {
    if (snapshot.repos[key] && !grouped.has(key)) {
      notes.push(`cards.contributions.pin: "${key}" has no merged${cc.open ? ' or open' : ''} pull requests of yours, so it is not shown`);
    }
  }

  // Weekly rhythm: the contribution calendar summed per weekday. Like the active-days ring, it
  // follows the calendar, which the count settings cannot filter.
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekly: WeekdayItem[] = DAYS.map((day) => ({ day, count: 0 }));
  for (const d of snapshot.calendar) {
    const sundayFirst = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    weekly[(sundayFirst + 6) % 7].count += d.count;
  }

  // Streaks: the last 12 months, like the active days and the weekly rhythm; the calendar can't be filtered.
  const streaks = streakStats(snapshot.calendar);
  const days = streakDays(snapshot.calendar);
  if (filtering && config.show.includes('streaks')) {
    notes.push('the count settings cannot filter the contribution calendar, so the streaks card still counts private and organization work');
  }

  return { summary, languages, contributions, weekly, streaks, streakDays: days, notes };
}
