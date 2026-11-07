import { readFileSync } from 'node:fs';
import { parseDocument, isScalar } from 'yaml';

export const CARDS = ['summary', 'languages', 'contributions', 'weekly', 'streaks', 'about'] as const;
export type Card = (typeof CARDS)[number];
/** The cards made when the settings don't list any; the others are there to turn on. */
export const DEFAULT_CARDS: Card[] = ['summary', 'languages', 'contributions', 'weekly'];

export interface Config {
  /** GitHub login. Defaults to the token's owner. */
  user: string | null;
  /** The cards to make; the others are left out. [] turns them all off: nothing is made. */
  cards: Card[];
  /** classic: GitHub-style cards. oled: pinball-style dot-matrix displays. */
  style: 'classic' | 'oled';
  /** oled only: round LEDs; false draws square pixels. */
  matrix: boolean;
  /** The cards' colour: github (the default) is GitHub's own blue and greens; amber and green colour everything that highlights. */
  color: 'amber' | 'green' | 'github';
  /**
   * Behind the cards: "none" lets the page show through; a colour ("#030506") is the same for every
   * viewer, and the text takes the shades that suit it. "solid" is what the old settings meant: the
   * style's own (classic: GitHub's page colour, following the viewer; oled: the colour's dark panel).
   */
  background: string;
  /** oled only, before `background`: false for the dark panel. */
  transparent: boolean;
  include: {
    /** Count private repositories in the summary and languages cards. */
    private: boolean;
    /** Count repositories of organizations you belong to. */
    orgs: boolean;
  };
  theme: {
    /** classic only, before `background`: "solid" for GitHub's page colour behind the card. */
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
  streaks: {
    title: string | null;
  };
  about: {
    title: string | null;
    /** Shown large; null for none. */
    headline: string | null;
    /** Each is one line of text: they are not wrapped. More than fit scroll past, like the contributions. */
    lines: string[];
    /** Label -> text, one per line under the lines, scrolling with them. */
    facts: Record<string, string>;
  };
}

export const DEFAULT_CONFIG: Config = {
  user: null,
  cards: [...DEFAULT_CARDS],
  style: 'classic',
  matrix: true,
  color: 'github',
  background: 'none',
  transparent: true,
  include: { private: true, orgs: true },
  theme: { background: 'transparent', border: false, animations: true },
  summary: { title: null, ring: 'percent' },
  languages: { title: 'Most used languages', count: 6, exclude: [], excludeRepos: [], repoWeights: {}, other: true },
  contributions: { title: 'Notable contributions', count: 6, includeOpen: true, pin: [], hide: [] },
  weekly: { title: 'Weekly rhythm' },
  streaks: { title: 'Streaks' },
  about: { title: 'About', headline: null, lines: [], facts: {} },
};

export class ConfigError extends Error {}

type Shape = { [key: string]: 'boolean' | 'string' | 'string?' | 'number' | 'string[]' | 'weights' | 'strings' | Shape };

const SHAPE: Shape = {
  user: 'string?',
  cards: 'string[]',
  style: 'string',
  matrix: 'boolean',
  color: 'string',
  background: 'string',
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
  streaks: { title: 'string?' },
  about: { title: 'string?', headline: 'string?', lines: 'string[]', facts: 'strings' },
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
      : expected === 'strings' ? typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((s) => typeof s === 'string')
      : typeof v === 'object' && v !== null && !Array.isArray(v) &&
        Object.values(v).every((n) => typeof n === 'number' && n >= 0);
    if (!ok) {
      const what = expected === 'weights' ? 'a mapping of repo to a number >= 0'
        : expected === 'strings' ? 'a mapping of label to text'
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
        && key !== 'repoWeights' && key !== 'facts'
        ? merge(b, v)
        : v;
  }
  return out as T;
}

/**
 * The background as written: "none", or a colour of six (or three) hex digits, with or without "#".
 * It's read from the file's text, as YAML makes numbers of some colours: 030506 would be 30506.
 */
function background(node: unknown): string {
  const text = isScalar(node) ? String(node.source ?? node.value ?? '') : '';
  if (!text) throw new ConfigError('"background" is empty: write none, or a colour without #, like background: 030506');
  const value = text.trim().toLowerCase().replace(/^#/, '');
  if (value === 'none') return 'none';
  if (/^([0-9a-f]{3}){1,2}$/.test(value)) return `#${value}`;
  throw new ConfigError(`"background" must be none or a colour like 030506, not "${text}"`);
}

export function parseConfig(text: string): Config {
  const doc = parseDocument(text);
  if (doc.errors.length) throw doc.errors[0];
  const raw: unknown = doc.toJS() ?? {};
  if (typeof raw === 'object' && raw !== null && 'background' in raw) {
    (raw as Record<string, unknown>).background = background(doc.get('background', true));
  }
  check(raw, SHAPE, '');
  const config = merge(DEFAULT_CONFIG, raw);
  // The settings before `background`: a dark panel for oled, GitHub's page colour for classic.
  const r = raw as { background?: unknown; color?: unknown; transparent?: unknown; theme?: { background?: unknown } };
  if (r.background === undefined) {
    const solid = config.style === 'oled' ? r.transparent === false : r.theme?.background === 'solid';
    config.background = solid ? 'solid' : 'none';
  }
  if (config.theme.background !== 'transparent' && config.theme.background !== 'solid') {
    throw new ConfigError('"theme.background" must be "transparent" or "solid"');
  }
  if (config.style !== 'classic' && config.style !== 'oled') {
    throw new ConfigError('"style" must be "classic" or "oled"');
  }
  if ((config.color as string) === 'theme') config.color = 'github'; // its name until v1.5
  // github for every style; but OLED cards were amber before `color` reached the classic ones, so
  // settings that leave it out keep that (until setup rewrites them in the new layout, with color set).
  if (r.color === undefined) config.color = config.style === 'oled' ? 'amber' : 'github';
  if (!['amber', 'green', 'github'].includes(config.color)) {
    throw new ConfigError('"color" must be "amber", "green" or "github"');
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
