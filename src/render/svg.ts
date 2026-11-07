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
  /** The contribution graph's greens, from least to most active: the brighter, the busier. */
  heat: [string, string, string, string];
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
    heat: ['#216e39', '#30a14e', '#40c463', '#9be9a8'],
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
  },
};

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

export function card(o: CardOptions): string {
  const { theme: t, config } = o;
  const bg = config.theme.background === 'solid' ? t.background : 'none';
  const stroke = config.theme.border ? t.border : 'none';
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
  .icon { fill: ${t.secondary}; }${config.theme.animations ? ANIMATIONS : ''}${o.css ?? ''}
</style>
<rect x="0.5" y="0.5" width="${o.width - 1}" height="${o.height - 1}" rx="6" fill="${bg}" stroke="${stroke}"/>
${o.body}
</svg>
`;
}

/** Staggered fade-in wrapper; the transform lives on an outer group so CSS can animate the inner one. */
export function fadeIn(x: number, y: number, index: number, content: string, config: Config, step = 90): string {
  const delay = config.theme.animations ? ` style="animation-delay: ${200 + index * step}ms"` : '';
  return `<g transform="translate(${x} ${y})"><g class="fade"${delay}>${content}</g></g>`;
}
