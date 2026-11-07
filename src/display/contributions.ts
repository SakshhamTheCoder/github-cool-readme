// Notable contributions as a pinball-style display: one repo at a time.

import type { ContributionItem } from '../compute.ts';
import { describe } from '../render/contributions.ts';
import { formatCompact } from '../render/svg.ts';
import { textCells, textWidth } from './font.ts';
import { COLS, H, W, drawDots, frame, path, type Look, type Style } from './dmd.ts';
import { fit, titleLine } from './languages.ts';
import { slideshow, type Item } from './slides.ts';

export function renderDisplayContributions(items: ContributionItem[], title: string | null, style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const header = titleLine(title, look);
  if (!items.length) {
    return frame({
      width: W, height: H, title: title ?? 'Notable contributions', desc: 'No contributions to other projects yet.', ...style, css: '',
      body: header + path(textCells('NO CONTRIBUTIONS YET', 4, 24), look.lit),
    });
  }

  const slides: Item[][] = items.map((item, i) => {
    const [owner, repo] = item.repo.split('/');
    const counter = `${i + 1}/${items.length}`;
    const counterCol = COLS - 4 - textWidth(counter);
    return [
      { text: `*${formatCompact(item.stars).toUpperCase()}`, col: 4, row: 18, scale: 2, shine: true },
      { text: counter, col: counterCol, row: 18, dim: true },
      { text: fit(`${owner}/`.toUpperCase(), COLS - 8), col: 4, row: 37, dim: true },
      { text: fit(repo.toUpperCase(), COLS - 8), col: 4, row: 46 },
      { text: fit(describe(item).toUpperCase(), COLS - 8), col: 4, row: 57, dim: true },
    ];
  });
  const show = slideshow('c', slides, { col: 0, row: 16, cols: COLS, rows: 51 }, look, ['push', 'type', 'wipe']);

  return frame({
    width: W, height: H, title: title ?? 'Notable contributions',
    desc: items.map((i) => `${i.repo} (${i.stars} stars): ${describe(i)}`).join('. '),
    ...style,
    css: show.css,
    body: `<defs>${show.defs}</defs>\n${header}\n${show.markup}`,
  });
}
