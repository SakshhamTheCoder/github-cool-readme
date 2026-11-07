// About as a pinball-style display: your headline, lines and facts typed out one at a time.

import type { Config } from '../config.ts';
import { textWidth } from './font.ts';
import { COLS, H, W, drawDots, frame, type Style } from './dmd.ts';
import { fit, titleLine } from './languages.ts';
import { slideshow, type Item } from './slides.ts';

const WIDE = COLS - 8; // dot columns for text
const LINE = 10; // rows from one line of text to the next
const AREA = { top: 13, bottom: 67 }; // under the title line; each slide is centred in it
const MAX_LINES = 4;

/** Words in lines that fit `cols` dot columns; a word too long for a line is cut. */
export function wrap(text: string, cols: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next) <= cols) line = next;
    else {
      if (line) lines.push(line);
      line = fit(word, cols);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Text as large as fits: twice the size on one line, or wrapped at the normal size; rows from 0. */
function block(text: string, opts: { dim?: boolean; shine?: boolean } = {}): { items: Item[]; rows: number } {
  const upper = text.toUpperCase();
  if (textWidth(upper) * 2 <= WIDE) return { items: [{ text: upper, col: 4, row: 0, scale: 2, ...opts }], rows: 14 };
  const lines = wrap(upper, WIDE).slice(0, MAX_LINES);
  return { items: lines.map((line, i) => ({ text: line, col: 4, row: i * LINE, ...opts })), rows: lines.length * LINE - 3 };
}

/** Blocks one under the other, the whole centred in the area. */
function centred(...blocks: { items: Item[]; rows: number }[]): Item[] {
  const gap = 5;
  const height = blocks.reduce((h, b) => h + b.rows, 0) + gap * (blocks.length - 1);
  let row = Math.round(AREA.top + (AREA.bottom - AREA.top - height) / 2);
  const out: Item[] = [];
  for (const b of blocks) {
    for (const item of b.items) if ('text' in item) out.push({ ...item, row: item.row + row });
    row += b.rows + gap;
  }
  return out;
}

export function renderDisplayAbout(about: Config['about'], style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const { title, headline, lines, facts } = about;
  const header = titleLine(title, look);
  const entries = Object.entries(facts);

  const slides: Item[][] = [];
  if (headline) slides.push(centred(block(headline, { shine: true })));
  for (const line of lines) slides.push(centred(block(line)));
  for (const [label, text] of entries) {
    slides.push(centred({ items: [{ text: fit(label.toUpperCase(), WIDE), col: 4, row: 0, dim: true }], rows: 7 }, block(text)));
  }
  if (!slides.length) slides.push(centred(block('Nothing here yet')));
  const show = slideshow('b', slides, { col: 0, row: 15, cols: COLS, rows: 56 }, look, ['type', 'wipe']);

  return frame({
    width: W, height: H, title: title ?? 'About',
    desc: [headline, ...lines, ...entries.map(([label, text]) => `${label}: ${text}`)].filter(Boolean).join(' ') || 'Nothing here yet.',
    ...style,
    css: show.css,
    body: `<defs>${show.defs}</defs>\n${header}\n${show.markup}`,
  });
}
