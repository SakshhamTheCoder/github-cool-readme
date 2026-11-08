import { repoKey, type Config } from './config.ts';
import { fetchDataUri, type Client } from './github.ts';
import type { ContributionWindow, PullRequest, PullRequestState, Repo, RepoCounts, Snapshot } from './types.ts';

// Commits, pull requests, issues, reviews and the calendar come from GitHub's contributions API,
// with the same rules as the contribution graph on your profile. It only includes private and
// organization work when the token has the read:user scope; without it that work is reported as
// an anonymous "restricted" count.

const REPO_FIELDS = `nameWithOwner isPrivate isFork stargazerCount owner { login __typename }`;
const LANGUAGES = `languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }`;

export class ScopeError extends Error {}

interface RawRepo {
  nameWithOwner: string;
  isPrivate: boolean;
  isFork: boolean;
  stargazerCount: number;
  owner: { login: string; __typename: string; avatarUrl?: string };
  languages?: { edges: { size: number; node: { name: string; color: string | null } }[] };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

interface ByRepo {
  contributions: { totalCount: number };
  repository: RawRepo | null;
}

const CONTRIBUTIONS_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!, $calendar: Boolean!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      restrictedContributionsCount
      contributionCalendar @include(if: $calendar) {
        weeks { contributionDays { date contributionCount } }
      }
      commitContributionsByRepository(maxRepositories: 100) {
        contributions { totalCount } repository { ${REPO_FIELDS} ${LANGUAGES} }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        contributions { totalCount } repository { ${REPO_FIELDS} }
      }
      pullRequestReviewContributionsByRepository(maxRepositories: 100) {
        contributions { totalCount } repository { ${REPO_FIELDS} }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        contributions { totalCount } repository { ${REPO_FIELDS} }
      }
    }
  }
}`;

interface ContributionsResult {
  user: {
    contributionsCollection: {
      totalCommitContributions: number;
      totalPullRequestContributions: number;
      totalPullRequestReviewContributions: number;
      totalIssueContributions: number;
      restrictedContributionsCount: number;
      contributionCalendar?: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] };
      commitContributionsByRepository: ByRepo[];
      pullRequestContributionsByRepository: ByRepo[];
      pullRequestReviewContributionsByRepository: ByRepo[];
      issueContributionsByRepository: ByRepo[];
    };
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** The last 365 days, today included. */
export function last12MonthsRange(now: Date): { from: Date; to: Date } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - 364 * DAY), to: now };
}

/** One window per calendar year, from account creation until now. */
export function yearRanges(createdAt: Date, now: Date): { from: Date; to: Date }[] {
  const ranges = [];
  for (let year = createdAt.getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    ranges.push({ from: start < createdAt ? createdAt : start, to: end > now ? now : end });
  }
  return ranges;
}

async function inBatches<T, R>(items: T[], size: number, fn: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await fn(items.slice(i, i + size))));
  return out;
}

async function inParallel<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  return inBatches(items, size, (batch) => Promise.all(batch.map(fn)));
}

export async function collect(client: Client, config: Config, log: (msg: string) => void = () => {}): Promise<Snapshot> {
  const now = new Date();
  const repos: Record<string, Repo> = {};
  const avatarUrls: Record<string, string> = {};

  const remember = (raw: RawRepo): string => {
    const key = raw.nameWithOwner.toLowerCase();
    const languages = raw.languages?.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size }));
    repos[key] = {
      nameWithOwner: raw.nameWithOwner,
      owner: raw.owner.login,
      ownerIsOrg: raw.owner.__typename === 'Organization',
      isPrivate: raw.isPrivate,
      isFork: raw.isFork,
      stars: raw.stargazerCount,
      languages: languages ?? repos[key]?.languages ?? [],
    };
    if (raw.owner.avatarUrl) avatarUrls[raw.owner.login.toLowerCase()] = raw.owner.avatarUrl;
    return key;
  };

  // Who.
  let login = config.user;
  const { viewer } = await client.query<{ viewer: { login: string } }>('query { viewer { login } }');
  const scopes = client.scopes();
  if (scopes && !scopes.includes('read:user') && !scopes.includes('user')) {
    throw new ScopeError(
      `the token lacks the "read:user" scope (it has: ${scopes.join(', ') || 'none'}). Without it GitHub hides your ` +
        'private and organization contributions. Add the scope to the token on GitHub (Settings > Developer settings > ' +
        'Tokens (classic)); the token value stays the same.',
    );
  }
  login ??= viewer.login;
  if (login.toLowerCase() !== viewer.login.toLowerCase()) {
    log(`note: the token belongs to ${viewer.login}, so only ${login}'s public work is visible`);
  }
  const { user } = await client.query<{
    user: { login: string; name: string | null; createdAt: string; organizations: { nodes: { login: string }[] } } | null;
  }>(`query($login: String!) { user(login: $login) { login name createdAt organizations(first: 100) { nodes { login } } } }`, { login });
  if (!user) throw new Error(`GitHub user "${login}" not found`);
  login = user.login;
  const orgs = user.organizations.nodes.map((o) => o.login.toLowerCase());
  log(`User ${login}, member of ${orgs.length} organization(s), joined ${user.createdAt.slice(0, 10)}`);

  // Owned repos, for stars.
  const ownedRepos: string[] = [];
  for (let after: string | null = null; ; ) {
    const res: { user: { repositories: { pageInfo: PageInfo; nodes: RawRepo[] } } } = await client.query(
      `query($login: String!, $after: String) { user(login: $login) {
        repositories(first: 100, after: $after, ownerAffiliations: OWNER) { pageInfo { hasNextPage endCursor } nodes { ${REPO_FIELDS} } } } }`,
      { login, after },
    );
    ownedRepos.push(...res.user.repositories.nodes.map(remember));
    if (!res.user.repositories.pageInfo.hasNextPage) break;
    after = res.user.repositories.pageInfo.endCursor;
  }

  // Projects you maintain in an organization are not "owned" by you, so they are listed in the settings.
  for (const full of config.count.extraRepos) {
    const [owner, name] = full.split('/');
    const res = await client.query<{ repository: RawRepo | null }>(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${REPO_FIELDS} } }`,
      { owner, name },
    );
    if (!res.repository) {
      log(`note: count.extraRepos: "${full}" was not found or is not visible to the token`);
      continue;
    }
    const key = remember(res.repository);
    if (!ownedRepos.includes(key)) ownedRepos.push(key);
  }

  // Contributions: the last 12 months, and every calendar year since you joined.
  let calendar: Snapshot['calendar'] = [];
  const fetchWindow = async (range: { from: Date; to: Date }, withCalendar: boolean): Promise<ContributionWindow> => {
    const res = await client.query<ContributionsResult>(CONTRIBUTIONS_QUERY, {
      login,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      calendar: withCalendar,
    });
    const c = res.user.contributionsCollection;
    const byRepo: Record<string, RepoCounts> = {};
    const add = (list: ByRepo[], field: keyof RepoCounts) => {
      for (const item of list) {
        if (!item.repository) continue;
        const key = remember(item.repository);
        byRepo[key] ??= { commits: 0, pullRequests: 0, reviews: 0, issues: 0 };
        byRepo[key][field] += item.contributions.totalCount;
      }
    };
    add(c.commitContributionsByRepository, 'commits');
    add(c.pullRequestContributionsByRepository, 'pullRequests');
    add(c.pullRequestReviewContributionsByRepository, 'reviews');
    add(c.issueContributionsByRepository, 'issues');
    if (c.contributionCalendar) {
      calendar = c.contributionCalendar.weeks
        .flatMap((w) => w.contributionDays)
        .map((d) => ({ date: d.date, count: d.contributionCount }));
    }
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      totals: {
        commits: c.totalCommitContributions,
        pullRequests: c.totalPullRequestContributions,
        reviews: c.totalPullRequestReviewContributions,
        issues: c.totalIssueContributions,
      },
      restricted: c.restrictedContributionsCount,
      byRepo,
    };
  };

  const last12 = last12MonthsRange(now);
  const last12Months = await fetchWindow(last12, true);
  const years = yearRanges(new Date(user.createdAt), now);
  log(`Fetching contributions for ${years.length} year(s)`);
  const allTime = await inParallel(years, 3, (range) => fetchWindow(range, false));
  const restricted = allTime.reduce((s, w) => s + w.restricted, 0);
  if (restricted) {
    log(`note: ${restricted} contributions are in repositories the token cannot see (e.g. ones you lost access to); they are not counted`);
  }

  // Every pull request you opened: the list is complete, unlike search.
  const pullRequests: PullRequest[] = [];
  for (let after: string | null = null; ; ) {
    const res: {
      user: {
        pullRequests: {
          pageInfo: PageInfo;
          nodes: { state: PullRequestState; createdAt: string; mergedAt: string | null; repository: RawRepo | null }[];
        };
      };
    } = await client.query(
      `query($login: String!, $after: String) { user(login: $login) {
        pullRequests(first: 100, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
          pageInfo { hasNextPage endCursor }
          nodes { state createdAt mergedAt repository { ${REPO_FIELDS} owner { avatarUrl(size: 80) } } } } } }`,
      { login, after },
    );
    for (const n of res.user.pullRequests.nodes) {
      if (!n.repository) continue;
      pullRequests.push({ repo: remember(n.repository), state: n.state, createdAt: n.createdAt, mergedAt: n.mergedAt });
    }
    if (!res.user.pullRequests.pageInfo.hasNextPage) break;
    after = res.user.pullRequests.pageInfo.endCursor;
  }
  log(`${pullRequests.length} pull requests`);

  // Stars received in the last 12 months: stargazers newest first, until one is older than the window.
  const since = last12.from.toISOString();
  const recentStars: Record<string, number> = {};
  const starred = ownedRepos.filter((k) => !repos[k].isFork && repos[k].stars > 0);
  type Stargazers = { edges: { starredAt: string }[]; pageInfo: PageInfo };
  const stargazers = (after: string | null) =>
    `stargazers(first: 100, after: ${after ? JSON.stringify(after) : 'null'}, orderBy: { field: STARRED_AT, direction: DESC }) {
      edges { starredAt } pageInfo { hasNextPage endCursor } }`;
  const repoRef = (key: string) => {
    const [owner, name] = repos[key].nameWithOwner.split('/');
    return `repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)})`;
  };
  await inBatches(starred, 20, async (batch) => {
    const data = await client.query<Record<string, { stargazers: Stargazers } | null>>(
      `query {\n${batch.map((k, i) => `r${i}: ${repoRef(k)} { ${stargazers(null)} }`).join('\n')}\n}`,
    );
    for (const [i, key] of batch.entries()) {
      let page = data[`r${i}`]?.stargazers;
      let count = 0;
      while (page) {
        const recent = page.edges.filter((e) => e.starredAt >= since);
        count += recent.length;
        if (recent.length < page.edges.length || !page.pageInfo.hasNextPage) break;
        const next: Record<string, { stargazers: Stargazers } | null> = await client.query(
          `query { r: ${repoRef(key)} { ${stargazers(page.pageInfo.endCursor)} } }`,
        );
        page = next.r?.stargazers;
      }
      if (count) recentStars[key] = count;
    }
    return [];
  });

  // Avatars of the owners most likely to be on the contributions card: the most starred, plus pins.
  const outside = [...new Set(pullRequests.map((p) => p.repo))].filter((k) => {
    const r = repos[k];
    return !r.isPrivate && r.owner.toLowerCase() !== login.toLowerCase() && !orgs.includes(r.owner.toLowerCase());
  });
  const wanted = new Set([
    ...outside.sort((a, b) => repos[b].stars - repos[a].stars).slice(0, config.cards.contributions.count + 10),
    ...config.cards.contributions.pin.map((p) => repoKey(p, login)),
  ]);
  const owners = [...new Set([...wanted].filter((r) => repos[r]).map((r) => repos[r].owner.toLowerCase()))];
  const avatars: Record<string, string> = {};
  await inParallel(owners, 6, async (owner) => {
    const url = avatarUrls[owner];
    const uri = url ? await fetchDataUri(url) : null;
    if (uri) avatars[owner] = uri;
  });

  for (const w of client.warnings) log(`warning: ${w}`);

  return {
    version: 5,
    generatedAt: now.toISOString(),
    user: { login, name: user.name, createdAt: user.createdAt },
    orgs,
    repos,
    ownedRepos,
    recentStars,
    last12Months,
    allTime,
    calendar,
    pullRequests,
    avatars,
  };
}
