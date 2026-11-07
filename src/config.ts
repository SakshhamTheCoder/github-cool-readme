import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const CARDS = ['summary', 'languages', 'contributions', 'weekly'] as const;
export type Card = (typeof CARDS)[number];

export interface Config {
  /** GitHub login. Defaults to the token's owner. */
  user: string | null;
  /** The cards to make; the others are left out. [] turns them all off: nothing is made. */
  cards: Card[];
  /** classic: GitHub-style cards. oled: pinball-style dot-matrix displays. */
  style: 'classic' | 'oled';
  /** oled only: round LEDs; false draws square pixels. */
  matrix: boolean;
  /** oled only: theme uses GitHub's colours and follows the viewer's light or dark theme. */
  color: 'amber' | 'green' | 'theme';
  /** oled only: no dark panel behind the dots, so the page shows through. */
  transparent: boolean;
  include: {
    /** Count private repositories in the summary and languages cards. */
    private: boolean;
    /** Count repositories of organizations you belong to. */
    orgs: boolean;
  };
  theme: {
    /** Card background; "transparent" blends into GitHub's page. */
    background: 'transparent' | 'solid';
    border: boolean;
    animations: boolean;
  };
  summary: {
    /** Shown small and uppercase on the card's header line; null for none. */
    title: string | null;
    /** What sits inside the activity ring: the percentage, or the GitHub logo (the percentage moves to the header). */
    ring: 'percent' | 'github';
  };
  languages: {
    title: string | null;
    count: number;
    exclude: string[];
    excludeRepos: string[];
    /** Multiplier per repo; 1 is neutral, 0 excludes it. */
    repoWeights: Record<string, number>;
    /** Fold the remaining languages into an "Other" entry. */
    other: boolean;
  };
  contributions: {
    title: string | null;
    /** How many repos to show; 3 are in view at a time, the rest scroll past in a loop. */
    count: number;
    includeOpen: boolean;
    /** Shown before the others, if they have a merged (or open) pull request of yours. */
    pin: string[];
    hide: string[];
  };
  weekly: {
    title: string | null;
  };
}

export const DEFAULT_CONFIG: Config = {
  user: null,
  cards: [...CARDS],
  style: 'classic',
  matrix: true,
  color: 'amber',
  transparent: false,
  include: { private: true, orgs: true },
  theme: { background: 'transparent', border: false, animations: true },
  summary: { title: null, ring: 'percent' },
  languages: { title: 'Most used languages', count: 6, exclude: [], excludeRepos: [], repoWeights: {}, other: true },
  contributions: { title: 'Notable contributions', count: 6, includeOpen: true, pin: [], hide: [] },
  weekly: { title: 'Weekly rhythm' },
};

export class ConfigError extends Error {}

type Shape = { [key: string]: 'boolean' | 'string' | 'string?' | 'number' | 'string[]' | 'weights' | Shape };

const SHAPE: Shape = {
  user: 'string?',
  cards: 'string[]',
  style: 'string',
  matrix: 'boolean',
  color: 'string',
  transparent: 'boolean',
  include: { private: 'boolean', orgs: 'boolean' },
  theme: { background: 'string', border: 'boolean', animations: 'boolean' },
  summary: { title: 'string?', ring: 'string' },
  languages: {
    title: 'string?',
    count: 'number',
    exclude: 'string[]',
    excludeRepos: 'string[]',
    repoWeights: 'weights',
    other: 'boolean',
  },
  contributions: { title: 'string?', count: 'number', includeOpen: 'boolean', pin: 'string[]', hide: 'string[]' },
  weekly: { title: 'string?' },
};

function check(value: unknown, shape: Shape, path: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${path || 'config'} must be a mapping`);
  }
  for (const [key, v] of Object.entries(value)) {
    const where = path ? `${path}.${key}` : key;
    const expected = shape[key];
    if (expected === undefined) {
      throw new ConfigError(`unknown setting "${where}"`);
    }
    if (typeof expected === 'object') {
      check(v, expected, where);
      continue;
    }
    const ok =
      expected === 'boolean' ? typeof v === 'boolean'
      : expected === 'string' ? typeof v === 'string'
      : expected === 'string?' ? v === null || typeof v === 'string'
      : expected === 'number' ? typeof v === 'number' && Number.isInteger(v) && v > 0
      : expected === 'string[]' ? Array.isArray(v) && v.every((s) => typeof s === 'string')
      : typeof v === 'object' && v !== null && !Array.isArray(v) &&
        Object.values(v).every((n) => typeof n === 'number' && n >= 0);
    if (!ok) {
      const what = expected === 'weights' ? 'a mapping of repo to a number >= 0'
        : expected === 'number' ? 'a positive whole number'
        : expected === 'string[]' ? 'a list of strings'
        : expected === 'string?' ? 'a string'
        : `a ${expected}`;
      throw new ConfigError(`"${where}" must be ${what}`);
    }
  }
}

function merge<T>(base: T, override: unknown): T {
  if (typeof override !== 'object' || override === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, v] of Object.entries(override)) {
    const b = out[key];
    out[key] =
      typeof b === 'object' && b !== null && !Array.isArray(b) && typeof v === 'object' && v !== null && !Array.isArray(v)
        && key !== 'repoWeights'
        ? merge(b, v)
        : v;
  }
  return out as T;
}

export function parseConfig(text: string): Config {
  const raw: unknown = parse(text) ?? {};
  check(raw, SHAPE, '');
  const config = merge(DEFAULT_CONFIG, raw);
  if (config.theme.background !== 'transparent' && config.theme.background !== 'solid') {
    throw new ConfigError('"theme.background" must be "transparent" or "solid"');
  }
  if (config.style !== 'classic' && config.style !== 'oled') {
    throw new ConfigError('"style" must be "classic" or "oled"');
  }
  if (!['amber', 'green', 'theme'].includes(config.color)) {
    throw new ConfigError('"color" must be "amber", "green" or "theme"');
  }
  for (const card of config.cards) {
    if (!(CARDS as readonly string[]).includes(card)) {
      throw new ConfigError(`"cards" has "${card}"; the cards are ${CARDS.join(', ')}`);
    }
  }
  if (new Set(config.cards).size !== config.cards.length) throw new ConfigError('"cards" names a card twice');
  if (config.summary.ring !== 'percent' && config.summary.ring !== 'github') {
    throw new ConfigError('"summary.ring" must be "percent" or "github"');
  }
  return config;
}

export function loadConfig(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`cannot read config file ${path}`);
  }
  return parseConfig(text);
}

/** "repo" means a repo of the user; "owner/repo" is taken as is. Lowercased for matching. */
export function repoKey(ref: string, login: string): string {
  const name = ref.includes('/') ? ref : `${login}/${ref}`;
  return name.toLowerCase();
}
