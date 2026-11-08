import type { Config } from '../config.ts';

export type Mode = 'light' | 'dark';

export interface Theme {
  background: string;
  border: string;
  text: string;
  secondary: string;
  muted: string;
  accent: string;
  track: string;
  /** Fallback for languages without a GitHub color, and "Other". */
  neutral: string;
  /** The contribution graph's greens, from least to most active: darker on light, brighter on dark. */
  heat: [string, string, string, string];
  /** GitHub's success green, readable as text: what a graph highlights, and its number. */
  highlight: string;
  /** Words marked *like this* in the about card's text. */
  emphasis: string;
}

// GitHub's own Primer colors, so the cards sit naturally on the profile page.
export const THEMES: Record<Mode, Theme> = {
  light: {
    background: '#ffffff',
    border: '#d1d9e0',
    text: '#1f2328',
    secondary: '#59636e',
    muted: '#818b98',
    accent: '#0969da',
    track: '#d1d9e0',
    neutral: '#8c959f',
    heat: ['#9be9a8', '#40c463', '#30a14e', '#216e39'],
    highlight: '#2da44e',
    emphasis: '#0969da',
  },
  dark: {
    background: '#0d1117',
    border: '#3d444d',
    text: '#f0f6fc',
    secondary: '#9198a1',
    muted: '#7d8590',
    accent: '#4493f8',
    track: '#3d444d',
    neutral: '#6e7681',
    heat: ['#0e4429', '#006d32', '#26a641', '#39d353'],
    highlight: '#3fb950',
    emphasis: '#4493f8',
  },
};

/** What a colour changes on the classic cards: the ring, the weekly bars, the streaks highlight. */
type Tint = Pick<Theme, 'accent' | 'heat' | 'highlight'>;
const TINTS: Record<'amber' | 'green' | 'purple' | 'cyan' | 'red' | 'blue', Record<Mode, Tint>> = {
  // Like the greens: deep to pale on a light page, dim to bright on a dark one; the highlight dark
  // enough to read as text on white.
  amber: {
    light: { accent: '#e08a00', heat: ['#ffd58a', '#f0a020', '#c26a00', '#9a4d00'], highlight: '#b35c00' },
    dark: { accent: '#ffab1a', heat: ['#5c3300', '#8f5200', '#d98a00', '#ffab1a'], highlight: '#ffab1a' },
  },
  // GitHub's purple, cyan, red and blue the same way: deep to pale on light, dim to bright on dark.
  purple: {
    light: { accent: '#8250df', heat: ['#d8b9ff', '#a475f9', '#6639ba', '#4c2889'], highlight: '#8250df' },
    dark: { accent: '#a371f7', heat: ['#2e1a4f', '#553098', '#8957e5', '#c297ff'], highlight: '#a371f7' },
  },
  cyan: {
    light: { accent: '#0e8a9a', heat: ['#a5e8ef', '#3fb8c6', '#0a7b8a', '#054952'], highlight: '#0a7b8a' },
    dark: { accent: '#39c5cf', heat: ['#0a3a40', '#0e6b75', '#1fa3b0', '#56d4dd'], highlight: '#39c5cf' },
  },
  red: {
    light: { accent: '#cf222e', heat: ['#ffc1bd', '#f2706f', '#cf222e', '#82071e'], highlight: '#cf222e' },
    dark: { accent: '#f85149', heat: ['#4d1215', '#8e1b20', '#da3633', '#ff7b72'], highlight: '#f85149' },
  },
  blue: {
    light: { accent: '#0969da', heat: ['#b6e3ff', '#54aeff', '#0969da', '#0a3069'], highlight: '#0969da' },
    dark: { accent: '#4493f8', heat: ['#0c2d6b', '#1158c7', '#388bfd', '#79c0ff'], highlight: '#4493f8' },
  },
  // GitHub's greens, with the ring green too.
  green: {
    light: { accent: '#2da44e', heat: THEMES.light.heat, highlight: THEMES.light.highlight },
    dark: { accent: '#3fb950', heat: THEMES.dark.heat, highlight: THEMES.dark.highlight },
  },
};

/** The classic cards' colours for a mode, in `color`: github leaves GitHub's own. */
export function themeFor(mode: Mode, color: keyof typeof TINTS | 'github'): Theme {
  // A colour's marked words are in its highlight, which reads as text on either page.
  return color === 'github' ? THEMES[mode] : { ...THEMES[mode], ...TINTS[color][mode], emphasis: TINTS[color][mode].highlight };
}

// One size for every card: two side by side fill a profile README's 800px, shown at their real
// size so the text isn't scaled down. Every card has the same header line: small uppercase text
// (a title, column names) at HEADER_Y, with the content starting at CONTENT_TOP.
export const WIDTH = 400;
export const CARD_HEIGHT = 195;
export const PAD = 20;
export const HEADER_Y = 28;
export const CONTENT_TOP = 46;

// Font sizes, the same on every card: main text, secondary text, header line.
export const TEXT = 14;
export const SMALL = 12;
export const CAPS = 11;

/** Small uppercase text on the header line, e.g. a card title or a column name. */
export function headerText(text: string, x: number, anchor: 'start' | 'middle' | 'end' = 'start'): string {
  return `<text x="${x}" y="${HEADER_Y}" class="col"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${esc(text.toUpperCase())}</text>`;
}

export const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Rough text width for the card fonts, to truncate long names. */
export function textWidth(s: string, fontSize: number, bold = false): number {
  return s.length * fontSize * (bold ? 0.6 : 0.56);
}

export function truncate(s: string, maxWidth: number, fontSize: number, bold = false): string {
  if (textWidth(s, fontSize, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && textWidth(`${out}…`, fontSize, bold) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** Text with parts marked *like this*: the parts in order, the marked ones flagged. A lone * stays as it is. */
export function marked(text: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\*([^*]+)\*/g)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), mark: false });
    parts.push({ text: m[1], mark: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

/** Text without its marks. */
export function unmarked(text: string): string {
  return marked(text).map((p) => p.text).join('');
}

/**
 * Text wrapped by words into rows that `fits`, each row with its own marks, so a marked phrase
 * split over two rows is marked on both. A word longer than a row gets one to itself.
 */
export function wrapMarked(text: string, fits: (row: string) => boolean): string[] {
  const chars: { ch: string; mark: boolean }[] = [];
  for (const part of marked(text.trim().replace(/\s+/g, ' '))) for (const ch of part.text) chars.push({ ch, mark: part.mark });
  const plain = chars.map((c) => c.ch).join('');
  // Rows as [start, end) in plain, broken at spaces.
  const rows: [number, number][] = [];
  let start = 0;
  let end = 0;
  for (const word of plain.matchAll(/\S+/g)) {
    const wordEnd = word.index + word[0].length;
    if (end > start && !fits(plain.slice(start, wordEnd))) {
      rows.push([start, end]);
      start = word.index;
    }
    end = wordEnd;
  }
  if (end > start) rows.push([start, end]);
  // Each row's text again, with * around its marked runs.
  return rows.map(([from, to]) => {
    let out = '';
    for (let i = from; i < to; i++) {
      const c = chars[i];
      if (c.mark && (i === from || !chars[i - 1].mark)) out += '*';
      out += c.ch;
      if (c.mark && (i === to - 1 || !chars[i + 1].mark)) out += '*';
    }
    return out;
  });
}

/** A text element's content: the text cut to fit like `truncate`, its marked parts in `colour`. */
export function markedText(text: string, maxWidth: number, fontSize: number, colour: string, bold = false): string {
  const parts = marked(text);
  const whole = parts.map((p) => p.text).join('');
  const cut = truncate(whole, maxWidth, fontSize, bold);
  let left = cut === whole ? whole.length : cut.length - 1; // the characters that stay, before the …
  let out = '';
  for (const p of parts) {
    if (left <= 0) break;
    const t = esc(p.text.slice(0, left));
    left -= p.text.length;
    out += p.mark ? `<tspan fill="${colour}">${t}</tspan>` : t;
  }
  return cut === whole ? out : `${out}…`;
}

const ANIMATIONS = `
  .fade { animation: fade 0.45s ease-out both; }
  .grow { transform-box: fill-box; transform-origin: left center; animation: grow 0.9s cubic-bezier(.2,.7,.2,1) 0.15s both; }
  .ring { animation: ring 1.2s cubic-bezier(.2,.7,.2,1) 0.2s both; }
  .pop { transform-box: fill-box; transform-origin: center; animation: pop 0.4s ease-out 0.5s both; }
  @keyframes fade { from { opacity: 0; transform: translateY(4px); } }
  @keyframes grow { from { transform: scaleX(0); } }
  @keyframes pop { from { opacity: 0; transform: scale(0.6); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`;

export interface CardOptions {
  width: number;
  height: number;
  title: string;
  desc: string;
  theme: Theme;
  config: Config;
  /** Extra CSS, e.g. the ring keyframes that depend on the data. */
  css?: string;
  body: string;
}

/** Whether text on `colour` ("#rrggbb" or "#rgb") reads best in the light theme's shades or the dark one's. */
export function surfaceOf(colour: string): Mode {
  const hex = colour.length === 4 ? colour.replace(/[0-9a-f]/gi, (d) => d + d) : colour;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Dark text where it contrasts more than light text would.
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? 'light' : 'dark';
}

export function card(o: CardOptions): string {
  const { theme: t, config } = o;
  const bg = config.look.background === 'none' ? 'none' : config.look.background === 'solid' ? t.background : config.look.background;
  const stroke = config.look.border ? t.border : 'none';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" fill="none" role="img" aria-labelledby="title desc">
<title id="title">${esc(o.title)}</title>
<desc id="desc">${esc(o.desc)}</desc>
<style>
  text { font-family: ${FONT}; fill: ${t.text}; }
  .label { font-size: ${TEXT}px; }
  .value { font-size: ${TEXT}px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .small { font-size: ${SMALL}px; }
  .col { font-size: ${CAPS}px; fill: ${t.muted}; letter-spacing: 0.04em; }
  .secondary { fill: ${t.secondary}; }
  .muted { fill: ${t.muted}; }
  .icon { fill: ${t.secondary}; }${config.look.animations ? ANIMATIONS : ''}${o.css ?? ''}
</style>
<rect x="0.5" y="0.5" width="${o.width - 1}" height="${o.height - 1}" rx="6" fill="${bg}" stroke="${stroke}"/>
${o.body}
</svg>
`;
}

/** How long a page of a scrolling list stays in view, and how long it takes to scroll to the next. */
export const PAGE_HOLD = 3.5;
export const PAGE_MOVE = 0.8;

/** Scroll offsets of the pages of `count` rows, `visible` at a time; the last page is moved up so it's full. */
export function pageOffsets(count: number, visible: number, row: number): number[] {
  const offsets = [0];
  for (let first = visible; offsets.at(-1)! < (count - visible) * row; first += visible) {
    offsets.push(Math.min(first, count - visible) * row);
  }
  return offsets;
}

/** CSS for `.name`: hold each page, scroll to the next, and from the last back to the top. */
export function scrolling(name: string, offsets: number[]): string {
  const step = PAGE_HOLD + PAGE_MOVE;
  const seconds = offsets.length * step;
  const pct = (t: number) => `${((t / seconds) * 100).toFixed(2)}%`;
  const frames = offsets.map((y, i) => `${pct(i * step)}, ${pct(i * step + PAGE_HOLD)} { transform: translateY(-${y}px); }`);
  frames.push('100% { transform: translateY(0); }');
  return `\n  .${name} { animation: ${name} ${seconds}s ease-in-out infinite; }\n  @keyframes ${name} { ${frames.join(' ')} }`;
}

/** Staggered fade-in wrapper; the transform lives on an outer group so CSS can animate the inner one. */
export function fadeIn(x: number, y: number, index: number, content: string, config: Config, step = 90): string {
  const delay = config.look.animations ? ` style="animation-delay: ${200 + index * step}ms"` : '';
  return `<g transform="translate(${x} ${y})"><g class="fade"${delay}>${content}</g></g>`;
}
