// About as a pinball-style display: your headline, lines and facts typed out one at a time. Words
// marked *like this* are in the accent colour; on a one-colour display, where the text is that
// colour already, they're at full brightness and the rest of their text dimmed.

import type { Config } from '../config.ts';
import { marked, unmarked } from '../render/svg.ts';
import { textWidth } from './font.ts';
import { COLS, H, W, drawDots, frame, type Style } from './dmd.ts';
import { fit, titleLine } from './languages.ts';
import { slideshow, type Item } from './slides.ts';

const WIDE = COLS - 8; // dot columns for text
const LINE = 10; // rows from one line of text to the next
const AREA = { top: 13, bottom: 67 }; // under the title line; each slide is centred in it
const MAX_LINES = 5;

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

/**
 * A line of text as items: one per run of marked or unmarked characters (`marks`, one per
 * character), each where it falls in the whole line.
 */
function runs(line: string, marks: boolean[], row: number, scale: number, opts: { dim?: boolean; shine?: boolean }, oneColour: boolean): Item[] {
  const any = marks.some(Boolean);
  const items: Item[] = [];
  for (let start = 0; start < line.length; ) {
    let end = start + 1;
    while (end < line.length && marks[end] === marks[start]) end++;
    const text = line.slice(start, end);
    // From the line's start to this run: the width before it, and the space between two characters.
    const col = 4 + (start ? textWidth(`${line.slice(0, start)}I`) - textWidth('I') : 0) * scale;
    const dim = opts.dim || (any && oneColour && !marks[start]);
    if (text.trim()) items.push({ text, col, row, scale, ...opts, dim, accent: marks[start] });
    start = end;
  }
  return items;
}

/** Text as large as fits: twice the size on one line, or wrapped at the normal size; rows from 0. */
function block(text: string, oneColour: boolean, opts: { dim?: boolean; shine?: boolean } = {}): { items: Item[]; rows: number } {
  // The text in capitals with single spaces, as wrap leaves it, and whether each character is marked.
  const chars: { ch: string; mark: boolean }[] = [];
  for (const part of marked(text.trim().replace(/\s+/g, ' '))) for (const ch of part.text.toUpperCase()) chars.push({ ch, mark: part.mark });
  const upper = chars.map((c) => c.ch).join('');
  if (textWidth(upper) * 2 <= WIDE) return { items: runs(upper, chars.map((c) => c.mark), 0, 2, opts, oneColour), rows: 14 };
  const lines = wrap(upper, WIDE).slice(0, MAX_LINES);
  let from = 0;
  const items = lines.flatMap((line, i) => {
    const at = upper.indexOf(line, from); // -1 only for a word cut to fit, which then goes unmarked
    if (at >= 0) from = at + line.length;
    const marks = at >= 0 ? chars.slice(at, at + line.length).map((c) => c.mark) : line.split('').map(() => false);
    return runs(line, marks, i * LINE, 1, opts, oneColour);
  });
  return { items, rows: lines.length * LINE - 3 };
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

export function renderDisplayAbout(about: Config['cards']['about'], style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const { title, headline, lines, facts } = about;
  const header = titleLine(title, look);
  const entries = Object.entries(facts);

  const one = look.lit === look.accent;
  const slides: Item[][] = [];
  if (headline) slides.push(centred(block(headline, one, { shine: true })));
  for (const line of lines) slides.push(centred(block(line, one)));
  for (const [label, text] of entries) {
    slides.push(centred({ items: [{ text: fit(label.toUpperCase(), WIDE), col: 4, row: 0, dim: true }], rows: 7 }, block(text, one)));
  }
  if (!slides.length) slides.push(centred(block('Nothing here yet', one)));
  const show = slideshow('b', slides, { col: 0, row: 15, cols: COLS, rows: 56 }, look, ['type', 'wipe']);

  return frame({
    width: W, height: H, title: title ?? 'About',
    desc: [headline, ...lines, ...entries.map(([label, text]) => `${label}: ${text}`)].filter(Boolean).map((t) => unmarked(t!)).join(' ') || 'Nothing here yet.',
    ...style,
    css: show.css,
    body: `<defs>${show.defs}</defs>\n${header}\n${show.markup}`,
  });
}
