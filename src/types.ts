// Raw data collected from GitHub. Nothing in here is filtered by the config's
// include/exclude rules, so a snapshot can be re-rendered with different settings.
// A snapshot names private repositories: never publish it.

export interface Language {
  name: string;
  color: string | null;
  size: number;
}

export interface Repo {
  nameWithOwner: string;
  owner: string;
  ownerIsOrg: boolean;
  isPrivate: boolean;
  isFork: boolean;
  stars: number;
  /** Only filled for repos you committed to. */
  languages: Language[];
}

export interface RepoCounts {
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
}

/** One contributionsCollection call: GitHub allows at most one year per call. */
export interface ContributionWindow {
  from: string;
  to: string;
  totals: RepoCounts;
  /** Contributions the token cannot see (e.g. repos you lost access to), of unknown type. */
  restricted: number;
  /** Lowercase nameWithOwner -> counts. GitHub lists at most 100 repos per type and window. */
  byRepo: Record<string, RepoCounts>;
}

export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED';

export interface PullRequest {
  /** Lowercase nameWithOwner, key into Snapshot.repos. */
  repo: string;
  state: PullRequestState;
  createdAt: string;
  mergedAt: string | null;
}

export interface Snapshot {
  version: 5;
  generatedAt: string;
  user: { login: string; name: string | null; createdAt: string };
  /** Organizations the user belongs to (lowercase logins). */
  orgs: string[];
  /** Keyed by lowercase nameWithOwner. */
  repos: Record<string, Repo>;
  /** Repos owned by the user, for stars. */
  ownedRepos: string[];
  /** Stars your repos received in the last 12 months (and still have). */
  recentStars: Record<string, number>;
  last12Months: ContributionWindow;
  /** Calendar-year windows from account creation until now. */
  allTime: ContributionWindow[];
  /** Contribution calendar for the last 12 months. */
  calendar: { date: string; count: number }[];
  /** Every pull request you opened, for the notable contributions card. */
  pullRequests: PullRequest[];
  /** Owner login (lowercase) -> data: URI of the avatar. */
  avatars: Record<string, string>;
}
