import type { ContributionWindow, PullRequest, Repo, RepoCounts, Snapshot } from '../../src/types.ts';

const repo = (nameWithOwner: string, extra: Partial<Repo> = {}): Repo => ({
  nameWithOwner,
  owner: nameWithOwner.split('/')[0],
  ownerIsOrg: false,
  isPrivate: false,
  isFork: false,
  stars: 0,
  languages: [],
  ...extra,
});

const pr = (repo: string, createdAt: string, state: PullRequest['state'], mergedAt: string | null = null): PullRequest => ({
  repo,
  createdAt,
  state,
  mergedAt,
});

/** A window whose totals equal what its repos add up to. */
const window = (from: string, to: string, byRepo: Record<string, Partial<RepoCounts>>): ContributionWindow => {
  const full: Record<string, RepoCounts> = {};
  const totals: RepoCounts = { commits: 0, pullRequests: 0, reviews: 0, issues: 0 };
  for (const [key, c] of Object.entries(byRepo)) {
    full[key] = { commits: 0, pullRequests: 0, reviews: 0, issues: 0, ...c };
    for (const f of ['commits', 'pullRequests', 'reviews', 'issues'] as const) totals[f] += full[key][f];
  }
  return { from, to, totals, restricted: 0, byRepo: full };
};

const year = (y: number, byRepo: Record<string, Partial<RepoCounts>>) =>
  window(`${y}-01-01T00:00:00Z`, `${y}-12-31T23:59:59Z`, byRepo);

/** A made-up user "octo", member of the organization "acme". */
export function fixture(): Snapshot {
  const y2026 = {
    'octo/secret': { commits: 50 },
    'acme/platform': { commits: 100, pullRequests: 1, reviews: 1 },
    'acme/site': { issues: 1 },
    'big/project': { pullRequests: 1 },
    'mid/project': { pullRequests: 1 },
    'hidden/private': { pullRequests: 1 },
  };
  const dec2025 = { 'octo/game': { commits: 10, pullRequests: 1 } };
  return {
    version: 5,
    generatedAt: '2026-11-04T12:00:00Z',
    user: { login: 'octo', name: 'Octo', createdAt: '2015-03-01T00:00:00Z' },
    orgs: ['acme'],
    repos: {
      'octo/game': repo('octo/game', {
        stars: 120,
        languages: [
          { name: 'C', color: '#555555', size: 9000 },
          { name: 'Python', color: '#3572A5', size: 1000 },
        ],
      }),
      'octo/secret': repo('octo/secret', {
        isPrivate: true,
        stars: 3,
        languages: [{ name: 'Rust', color: '#dea584', size: 5000 }],
      }),
      'octo/fork': repo('octo/fork', { isFork: true, stars: 50 }),
      'acme/platform': repo('acme/platform', {
        ownerIsOrg: true,
        isPrivate: true,
        languages: [
          { name: 'Ruby', color: '#701516', size: 6000 },
          { name: 'Batchfile', color: '#C1F12E', size: 4000 },
        ],
      }),
      'acme/site': repo('acme/site', { ownerIsOrg: true, stars: 10 }),
      'big/project': repo('big/project', { ownerIsOrg: true, stars: 30000 }),
      'mid/project': repo('mid/project', { ownerIsOrg: true, stars: 2000 }),
      'tiny/project': repo('tiny/project', { stars: 5 }),
      'old/archive': repo('old/archive', { ownerIsOrg: true, stars: 40000 }),
      'hidden/private': repo('hidden/private', { isPrivate: true, stars: 9 }),
    },
    ownedRepos: ['octo/game', 'octo/secret', 'octo/fork'],
    recentStars: { 'octo/game': 20, 'octo/secret': 3, 'octo/fork': 7 },
    last12Months: window('2025-11-05T00:00:00Z', '2026-11-04T12:00:00Z', { ...dec2025, ...y2026 }),
    allTime: [
      year(2018, { 'old/archive': { pullRequests: 2 } }),
      year(2019, { 'octo/game': { issues: 1 } }),
      year(2020, { 'octo/game': { commits: 90 }, 'tiny/project': { pullRequests: 1 } }),
      year(2024, { 'acme/platform': { commits: 100, pullRequests: 1 } }),
      year(2025, dec2025),
      year(2026, y2026),
    ],
    calendar: Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, count: i < 4 ? 0 : i })),
    pullRequests: [
      pr('octo/game', '2025-12-01T00:00:00Z', 'MERGED', '2025-12-02T00:00:00Z'),
      pr('acme/platform', '2024-01-01T00:00:00Z', 'MERGED', '2024-01-02T00:00:00Z'),
      pr('acme/platform', '2026-01-01T00:00:00Z', 'OPEN'),
      pr('big/project', '2026-09-01T00:00:00Z', 'MERGED', '2026-09-10T00:00:00Z'),
      pr('mid/project', '2026-10-01T00:00:00Z', 'OPEN'),
      pr('tiny/project', '2020-05-01T00:00:00Z', 'MERGED', '2020-05-03T00:00:00Z'),
      pr('old/archive', '2018-10-01T00:00:00Z', 'CLOSED'),
      pr('old/archive', '2018-11-01T00:00:00Z', 'CLOSED'),
      pr('hidden/private', '2026-02-01T00:00:00Z', 'MERGED', '2026-02-02T00:00:00Z'),
    ],
    avatars: { big: 'data:image/png;base64,AAAA' },
  };
}
