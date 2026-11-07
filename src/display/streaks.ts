// Streaks as a pinball-style display: one number at a time, like the summary, each over a strip of
// days that shows what the number is about: the current run, the longest one wherever it was, the
// active days, how they compare with the average, the best day, the best month.

import type { StreakDays, Tile } from '../stats.ts';
import { textWidth } from './font.ts';
import { COLS, H, W, drawDots, frame, path, type Cell, type Style } from './dmd.ts';
import { fit, titleLine } from './languages.ts';
import { slideshow, type Item } from './slides.ts';

/** How many days a strip shows: one dot column each, across the card. */
export const STRIP_DAYS = COLS - 8;
const STRIP = { col: 4, bottom: 64, rows: 7 }; // the bars stand on row `bottom`
const FAINT = 0.25; // the days a slide isn't about

type Lit = (index: number, count: number) => boolean;

/** The first day of a window of STRIP_DAYS around days first..last, kept within the days there are. */
function windowAround(total: number, first: number, last: number): number {
  const centre = (first + last) / 2;
  return Math.max(0, Math.min(total - STRIP_DAYS, Math.round(centre - STRIP_DAYS / 2)));
}

/**
 * A strip of days from `start`: a bar as tall as the day was busy (by square root, so a few very busy
 * days don't flatten the rest), lit where `lit` says and faint elsewhere; a dotted line at `line`.
 */
function strip(sd: StreakDays, start: number, lit: Lit, accent: string, line?: number): Item[] {
  const days = sd.days.slice(Math.max(0, start), Math.max(0, start) + STRIP_DAYS);
  const max = Math.max(1, ...days.map((d) => d.count));
  const height = (count: number) => (count ? Math.max(1, Math.round(Math.sqrt(count / max) * STRIP.rows)) : 0);
  const on: Cell[] = [];
  const off: Cell[] = [];
  days.forEach((d, i) => {
    const col = STRIP.col + STRIP_DAYS - days.length + i;
    const cells = lit(Math.max(0, start) + i, d.count) ? on : off;
    for (let r = 0; r < height(d.count); r++) cells.push([col, STRIP.bottom - 1 - r]);
  });
  const items: Item[] = [{ cells: on, fill: accent }, { cells: off, fill: accent, opacity: FAINT }];
  if (line !== undefined && line > 0) {
    const row = STRIP.bottom - 1 - Math.max(0, height(line) - 1);
    const dots: Cell[] = [];
    for (let c = STRIP.col; c < STRIP.col + STRIP_DAYS; c += 2) dots.push([c, row]);
    items.push({ cells: dots, fill: accent, opacity: 0.6 });
  }
  return items;
}

export function renderDisplayStreaks(tiles: Tile[], sd: StreakDays, title: string | null, style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const header = titleLine(title, look);
  const n = sd.days.length;
  const recent = Math.max(0, n - STRIP_DAYS);
  const within = (range: [number, number] | null): Lit => (i) => !!range && i >= range[0] && i <= range[1];
  const active = sd.days.filter((d) => d.count > 0);
  const average = active.length ? active.reduce((s, d) => s + d.count, 0) / active.length : 0;
  const month = sd.bestMonth ? sd.days.map((d, i) => (d.date.startsWith(sd.bestMonth!) ? i : -1)).filter((i) => i >= 0) : [];

  // Each slide's strip, in the order of the tiles.
  const strips: Item[][] = [
    strip(sd, recent, within(sd.current), look.accent), // current streak, at the right end
    strip(sd, sd.longest ? windowAround(n, ...sd.longest) : recent, within(sd.longest), look.accent), // longest, wherever it was
    strip(sd, recent, (_, count) => count > 0, look.accent), // active days
    strip(sd, recent, (_, count) => count > average, look.accent, average), // above the average, and the average
    strip(sd, sd.best !== null ? windowAround(n, sd.best, sd.best) : recent, (i) => i === sd.best, look.accent), // best day
    strip(sd, month.length ? windowAround(n, month[0], month[month.length - 1]) : recent, (i) => month.includes(i), look.accent), // best month
  ];

  // A tile's label can carry a detail after " · " (the best day's date): it goes under the number.
  const slides: Item[][] = tiles.map((t, i) => {
    const [label, detail] = t.label.split(' · ');
    const counter = `${i + 1}/${tiles.length}`;
    const counterCol = COLS - 4 - textWidth(counter);
    const value = (typeof t.value === 'number' ? Math.round(t.value).toLocaleString('en-US') : t.value).toUpperCase();
    const items: Item[] = [
      { text: fit(label.toUpperCase(), counterCol - 8), col: 4, row: 17 },
      { text: counter, col: counterCol, row: 17, dim: true },
      { text: fit(value, (COLS - 8) / 2), col: 4, row: 28, scale: 2, shine: true },
      ...(strips[i] ?? []),
    ];
    if (detail) items.push({ text: fit(detail.toUpperCase(), COLS - 8), col: 4, row: 45, dim: true });
    return items;
  });
  const show = slideshow('s', slides, { col: 0, row: 14, cols: COLS, rows: 52 }, look, ['push', 'wipe', 'flash']);

  // The baseline under the strips stays put.
  const base: Cell[] = [];
  for (let c = STRIP.col; c < STRIP.col + STRIP_DAYS; c++) base.push([c, STRIP.bottom]);

  return frame({
    width: W, height: H, title: title ?? 'Streaks',
    desc: tiles.map((t) => `${t.label}: ${t.value}`).join('. ') + '.',
    ...style,
    css: show.css,
    body: `<defs>${show.defs}</defs>\n${header}\n${show.markup}\n${path(base, look.accent, 'fill-opacity="0.22"')}`,
  });
}
