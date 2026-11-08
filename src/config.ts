import { readFileSync } from 'node:fs';
import { parseDocument, isScalar } from 'yaml';

export const CARDS = ['summary', 'languages', 'contributions', 'weekly', 'streaks', 'about'] as const;
export type Card = (typeof CARDS)[number];
/** The cards made when the settings don't list any; the others are there to turn on. */
export const DEFAULT_CARDS: Card[] = ['summary', 'languages', 'contributions', 'weekly'];

export const STYLES = ['classic', 'oled', 'dotmatrix'] as const;
export type Style = (typeof STYLES)[number];
export const COLORS = ['github', 'amber', 'green', 'purple', 'cyan', 'red', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export interface Config {
  /** GitHub login. Defaults to the token's owner. */
  user: string | null;
  /** The cards to make, in README order; the others are left out. [] turns them all off: nothing is made. */
  show: Card[];
  /** Which repositories count in the numbers. */
  count: {
    /** Private repositories. */
    private: boolean;
    /** Repositories of organizations you belong to. */
    orgs: boolean;
  };
  look: {
    /** classic: GitHub-style cards. oled: displays of square pixels. dotmatrix: of round LEDs. */
    style: Style;
    /** github: GitHub's own blue and greens. amber, green, purple, cyan, red, blue: everything that highlights in that colour. */
    color: Color;
    animations: boolean;
    /**
     * Behind the cards: "none" lets the page show through; a colour ("#030506") is the same for every
     * viewer, and the text takes the shades that suit it. "solid" only comes from the old settings: the
     * style's own (classic: GitHub's page colour, following the viewer; the displays: the colour's panel).
     */
    background: string;
    /** classic only: a thin outline. */
    border: boolean;
  };
  cards: {
    summary: {
      /** Shown small and uppercase on the card's header line; null for none. */
      title: string | null;
      /** What sits inside the activity ring: the percentage, or the GitHub logo (the percentage moves to the header). */
      ring: 'percent' | 'github';
    };
    languages: {
      title: string | null;
      count: number;
      /** Languages left out: their share is dropped. */
      hide: string[];
      /** Weight per repo; 1 is neutral, 0 leaves it out. */
      repos: Record<string, number>;
      /** Fold the remaining languages into an "Other" entry. */
      other: boolean;
    };
    contributions: {
      title: string | null;
      /** How many repos to show; 3 are in view at a time, the rest scroll past in a loop. */
      count: number;
      /** Count open pull requests too, not only merged ones. */
      open: boolean;
      /** Shown before the others, if they have a merged (or open) pull request of yours. */
      pin: string[];
      hide: string[];
    };
    weekly: { title: string | null };
    streaks: { title: string | null };
    about: {
      title: string | null;
      /** Shown large; null for none. */
      headline: string | null;
      /** Each is one line of text: they are not wrapped. More than fit scroll past, like the contributions. */
      lines: string[];
      /** Label -> text, one per line under the lines, scrolling with them. */
      facts: Record<string, string>;
    };
  };
}

export const DEFAULT_CONFIG: Config = {
  user: null,
  show: [...DEFAULT_CARDS],
  count: { private: true, orgs: true },
  look: { style: 'classic', color: 'github', animations: true, background: 'none', border: false },
  cards: {
    summary: { title: null, ring: 'percent' },
    languages: { title: 'Most used languages', count: 6, hide: [], repos: {}, other: true },
    contributions: { title: 'Notable contributions', count: 6, open: true, pin: [], hide: [] },
    weekly: { title: 'Weekly rhythm' },
    streaks: { title: 'Streaks' },
    about: { title: 'About', headline: null, lines: [], facts: {} },
  },
};

export class ConfigError extends Error {}

type Shape = { [key: string]: 'boolean' | 'string' | 'string?' | 'number' | 'string[]' | 'weights' | 'strings' | Shape };

const SHAPE: Shape = {
  user: 'string?',
  show: 'string[]',
  count: { private: 'boolean', orgs: 'boolean' },
  look: { style: 'string', color: 'string', animations: 'boolean', background: 'string', border: 'boolean' },
  cards: {
    summary: { title: 'string?', ring: 'string' },
    languages: { title: 'string?', count: 'number', hide: 'string[]', repos: 'weights', other: 'boolean' },
    contributions: { title: 'string?', count: 'number', open: 'boolean', pin: 'string[]', hide: 'string[]' },
    weekly: { title: 'string?' },
    streaks: { title: 'string?' },
    about: { title: 'string?', headline: 'string?', lines: 'string[]', facts: 'strings' },
  },
};

/** The layout before v1.5, still read: everything at the top, the look spread over several keys. */
const OLD_SHAPE: Shape = {
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
  languages: { title: 'string?', count: 'number', exclude: 'string[]', excludeRepos: 'string[]', repoWeights: 'weights', other: 'boolean' },
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
        && key !== 'repos' && key !== 'facts'
        ? merge(b, v)
        : v;
  }
  return out as T;
}

/**
 * The background as written: "none", or a colour of six (or three) hex digits, with or without "#".
 * It's read from the file's text, as YAML makes numbers of some colours: 030506 would be 30506.
 */
function background(node: unknown, where: string): string {
  const text = isScalar(node) ? String(node.source ?? node.value ?? '') : '';
  if (!text) throw new ConfigError(`"${where}" is empty: write none, or a colour without #, like ${where.split('.').pop()}: 030506`);
  const value = text.trim().toLowerCase().replace(/^#/, '');
  if (value === 'none') return 'none';
  if (/^([0-9a-f]{3}){1,2}$/.test(value)) return `#${value}`;
  throw new ConfigError(`"${where}" must be none or a colour like 030506, not "${text}"`);
}

type Raw = Record<string, unknown>;
const isMap = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Settings in the layout before v1.5, moved to the new one: the same cards, looking the same. */
function fromOld(o: Raw): Raw {
  check(o, OLD_SHAPE, '');
  const theme = (o.theme ?? {}) as Raw;
  const style = o.style ?? 'classic';
  if (style !== 'classic' && style !== 'oled') throw new ConfigError('"style" must be "classic" or "oled"');
  if (theme.background !== undefined && theme.background !== 'transparent' && theme.background !== 'solid') {
    throw new ConfigError('"theme.background" must be "transparent" or "solid"');
  }
  const look: Raw = {
    // oled was round LEDs unless matrix was false: now the dotmatrix style, and oled is the square pixels.
    style: style === 'oled' ? (o.matrix === false ? 'oled' : 'dotmatrix') : 'classic',
    // The displays were amber unless set; color: theme is github's old name.
    color: o.color === 'theme' ? 'github' : (o.color ?? (style === 'oled' ? 'amber' : 'github')),
    // Before background: the displays' dark panel unless transparent, GitHub's page colour behind classic if solid.
    background: o.background ?? ((style === 'oled' ? o.transparent === false : theme.background === 'solid') ? 'solid' : 'none'),
  };
  if (theme.animations !== undefined) look.animations = theme.animations;
  if (theme.border !== undefined) look.border = theme.border;
  const out: Raw = { look };
  if ('user' in o) out.user = o.user;
  if ('cards' in o) out.show = o.cards;
  if ('include' in o) out.count = o.include;
  const cards: Raw = {};
  for (const card of ['summary', 'weekly', 'streaks', 'about']) if (card in o) cards[card] = o[card];
  if (isMap(o.languages)) {
    const { exclude, excludeRepos, repoWeights, ...rest } = o.languages;
    // Left out was the same as a weight of 0.
    const repos = { ...((repoWeights as Raw) ?? {}), ...Object.fromEntries(((excludeRepos as string[]) ?? []).map((r) => [r, 0])) };
    cards.languages = { ...rest, ...(exclude ? { hide: exclude } : {}), ...(excludeRepos || repoWeights ? { repos } : {}) };
  }
  if (isMap(o.contributions)) {
    const { includeOpen, ...rest } = o.contributions;
    cards.contributions = { ...rest, ...(includeOpen !== undefined ? { open: includeOpen } : {}) };
  }
  if (Object.keys(cards).length) out.cards = cards;
  return out;
}

const OLD_KEYS = ['style', 'matrix', 'color', 'background', 'transparent', 'include', 'theme', 'summary', 'languages', 'contributions', 'weekly', 'streaks', 'about'];
const NEW_KEYS = ['show', 'count', 'look'];

/** Settings files in the layout before v1.5; they still work, and setup moves them to the new one. */
const OLD_LAYOUT = new WeakSet<Config>();
export const usesOldLayout = (config: Config): boolean => OLD_LAYOUT.has(config);

export function parseConfig(text: string): Config {
  const doc = parseDocument(text);
  if (doc.errors.length) throw doc.errors[0];
  const parsed: unknown = doc.toJS() ?? {};
  if (!isMap(parsed)) throw new ConfigError('config must be a mapping');
  let raw: Raw = parsed;

  // The old layout had everything at the top, and the cards as a list.
  const old = OLD_KEYS.filter((k) => k in raw).concat(Array.isArray(raw.cards) ? ['cards'] : []);
  const current = NEW_KEYS.filter((k) => k in raw).concat(isMap(raw.cards) ? ['cards'] : []);
  if (old.length && current.length) {
    throw new ConfigError(`"${current[0]}" is in the new layout of the settings, "${old[0]}" in the old one: use the new one (run setup again to move them)`);
  }
  if (old.length) {
    if ('background' in raw) raw.background = background(doc.get('background', true), 'background');
    raw = fromOld(raw);
  } else if (isMap(raw.look) && 'background' in raw.look) {
    (raw.look as Raw).background = background(doc.getIn(['look', 'background'], true), 'look.background');
  }

  check(raw, SHAPE, '');
  const config = merge(DEFAULT_CONFIG, raw);
  if (!(STYLES as readonly string[]).includes(config.look.style)) {
    throw new ConfigError(`"look.style" must be ${STYLES.map((s) => `"${s}"`).join(', ').replace(/, ([^,]*)$/, ' or $1')}`);
  }
  if (!(COLORS as readonly string[]).includes(config.look.color)) {
    throw new ConfigError(`"look.color" must be ${COLORS.map((c) => `"${c}"`).join(', ').replace(/, ([^,]*)$/, ' or $1')}`);
  }
  for (const card of config.show) {
    if (!(CARDS as readonly string[]).includes(card)) {
      throw new ConfigError(`"show" has "${card}"; the cards are ${CARDS.join(', ')}`);
    }
  }
  if (new Set(config.show).size !== config.show.length) throw new ConfigError('"show" names a card twice');
  if (config.cards.summary.ring !== 'percent' && config.cards.summary.ring !== 'github') {
    throw new ConfigError('"cards.summary.ring" must be "percent" or "github"');
  }
  if (old.length) OLD_LAYOUT.add(config);
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
