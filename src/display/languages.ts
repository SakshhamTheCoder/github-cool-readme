// Languages as a pinball-style display: one language at a time, one bar that grows and shrinks.

import type { LanguageItem } from '../compute.ts';
import { textCells, textWidth } from './font.ts';
import { COLS, H, PITCH, TITLE_ROW, W, drawDots, frame, keyframes, path, type Cell, type Look, type Style } from './dmd.ts';
import { ENTER, HOLD, slideshow, type Item } from './slides.ts';

const BAR = { col: 4, row: 54, cols: COLS - 8, rows: 6 };
const px = (cells: number) => cells * PITCH;

/** Text cut to fit `cols` cells of the dot font. */
export function fit(text: string, cols: number): string {
  let out = text;
  while (out.length > 1 && textWidth(out) > cols) out = out.slice(0, -1);
  return out;
}

/** A card title on the title line, in the dim colour. */
export function titleLine(title: string | null, look: Look): string {
  return title ? path(textCells(fit(title.toUpperCase(), COLS - 8), 4, TITLE_ROW), look.lit, `fill-opacity="${look.dim}"`) : '';
}

export function renderDisplayLanguages(items: LanguageItem[], title: string | null, style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const header = titleLine(title, look);
  if (!items.length) {
    return frame({
      width: W, height: H, title: title ?? 'Languages', desc: 'No language data.', ...style, css: '',
      body: header + path(textCells('NO DATA YET', 4, 24), look.lit),
    });
  }

  const slides: Item[][] = items.map((l, i) => {
    const counter = `${i + 1}/${items.length}`;
    const counterCol = COLS - 4 - textWidth(counter);
    return [
      { text: fit(l.name.toUpperCase(), counterCol - 8), col: 4, row: 21 },
      { text: counter, col: counterCol, row: 21, dim: true },
      { text: `${l.percent.toFixed(1)}%`, col: 4, row: 32, scale: 2, shine: true },
    ];
  });
  const show = slideshow('l', slides, { col: 0, row: 18, cols: COLS, rows: 31 }, look, ['push', 'wipe']);

  // One bar for all languages: it grows or shrinks to each language's share, a dot at a time.
  const bar: Cell[] = [];
  for (let r = BAR.row; r < BAR.row + BAR.rows; r++) for (let c = BAR.col; c < BAR.col + BAR.cols; c++) bar.push([c, r]);
  const widths = items.map((l) => Math.max(1, Math.round((l.percent / 100) * BAR.cols)));
  const frames: { t: number; css: string; ease?: string }[] = [];
  widths.forEach((w, i) => {
    const prev = i === 0 ? 0 : widths[i - 1];
    frames.push({ t: i * HOLD, css: `transform: scaleX(${prev / BAR.cols});`, ease: `steps(${Math.max(1, Math.abs(w - prev))})` });
    frames.push({ t: i * HOLD + ENTER, css: `transform: scaleX(${w / BAR.cols});` });
  });
  frames.push({ t: show.total, css: `transform: scaleX(${widths.at(-1)! / BAR.cols});` });
  // At rest (no animation) the bar shows the first language's share.
  const rest = `translate(${px(BAR.col)} 0) scale(${widths[0] / BAR.cols} 1) translate(-${px(BAR.col)} 0)`;
  const barDefs = `<mask id="lbar" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect class="lbar" x="${px(BAR.col)}" y="0" width="${px(BAR.cols)}" height="${H}" fill="#fff" transform="${rest}"/></mask>`;
  const barCss = `\n  .lbar { transform-box: fill-box; transform-origin: left; animation: lbar ${show.total}s infinite; }` + keyframes('lbar', show.total, frames);
  const barPart = path(bar, look.accent, 'fill-opacity="0.22"') + `<g mask="url(#lbar)">${path(bar, look.accent)}</g>`;

  return frame({
    width: W, height: H, title: title ?? 'Most used languages',
    desc: items.map((l) => `${l.name} ${l.percent.toFixed(1)}%`).join(', '),
    ...style,
    css: show.css + barCss,
    body: `<defs>${show.defs}${barDefs}</defs>\n${header}\n${show.markup}\n${barPart}`,
  });
}
