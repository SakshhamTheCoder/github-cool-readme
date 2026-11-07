// Summary as a pinball-style display: the activity ring stays on, the stats take turns.

import { createRequire } from 'node:module';
import type { SummaryModel } from '../compute.ts';
import { textCells, textWidth } from './font.ts';
import { H, PITCH, TITLE_ROW, W, drawDots, frame, path, ringCells, type Look, type Style } from './dmd.ts';
import { rasterize } from './raster.ts';
import { slideshow, type Item } from './slides.ts';

const require = createRequire(import.meta.url);
const octicons = require('@primer/octicons/build/data.json') as Record<string, { heights: Record<string, { path: string }> }>;
/** The GitHub mark's outline (24 x 24 units), from the Octicons we already use for the classic cards. */
const MARK = octicons['mark-github'].heights['24'].path.match(/ d="([^"]+)"/)![1];
const LOGO = 35; // cells across; the ring's inside is 43

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const px = (cells: number) => cells * PITCH;

export function renderDisplaySummary(m: SummaryModel, style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const stats = [
    ...m.rows.map((r) => ({ label: r.label.toUpperCase(), year: r.last12Months, total: r.allTime })),
    { label: 'STARS EARNED', year: m.stars.last12Months, total: m.stars.allTime },
  ];
  // The stat's name sits on the title line, like the other cards' titles.
  const slides: Item[][] = stats.map((s) => [
    { text: s.label, col: 4, row: TITLE_ROW },
    { text: fmt(s.year), col: 4, row: 23, scale: 2, shine: true },
    { text: `TOTAL ${fmt(s.total)}`, col: 4, row: 45, dim: true },
  ]);
  const show = slideshow('a', slides, { col: 0, row: 1, cols: 80, rows: 71 }, look); // every effect

  // The ring: always on, filling up once to the share of active days. Its title is above it.
  const cx = 113.5;
  const cy = 41.5;
  const outer = 24.5;
  const ring = ringCells(cx, cy, outer, 3);
  const mid = px(outer - 1.5);
  const circumference = 2 * Math.PI * mid;
  const offset = circumference * (1 - m.activity.percent / 100);
  const ringDefs = `<mask id="fill" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><circle class="fill" cx="${px(cx)}" cy="${px(cy)}" r="${mid}" stroke="#fff" stroke-width="${px(5)}" fill="none" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${px(cx)} ${px(cy)})"/></mask>`;
  const ringCss = `\n  .fill { animation: fill 1.4s steps(40) 0.2s both; }\n  @keyframes fill { from { stroke-dashoffset: ${circumference.toFixed(1)}; } }`;
  const pct = `${m.activity.percent}%`;
  // With the GitHub mark in the ring, the percentage moves to the title.
  const logo = m.ring === 'github';
  const title = logo ? `${pct} ACTIVE` : 'ACTIVE DAYS';
  // The mark is a circle cut off at the bottom; in its 24-unit drawing that circle's centre is (12, 12.5).
  const centre = logo
    ? path(rasterize(MARK, 24, LOGO, Math.round(cx - (12 * LOGO) / 24), Math.round(cy - (12.5 * LOGO) / 24)), look.lit)
    : path(textCells(pct, Math.round(cx - textWidth(pct)), Math.round(cy - 7), 2), look.lit);
  const ringPart =
    path(textCells(title, Math.round(cx - textWidth(title) / 2), TITLE_ROW), look.lit, `fill-opacity="${look.dim}"`) +
    path(ring, look.accent, 'fill-opacity="0.22"') +
    `<g mask="url(#fill)">${path(ring, look.accent)}</g>` +
    centre;

  const desc = [
    ...stats.map((s) => `${s.label}: ${s.year} in the last 12 months, ${s.total} in total.`),
    `Active on ${m.activity.percent}% of the last 12 months.`,
  ].join(' ');
  return frame({
    width: W, height: H, title: 'GitHub stats', desc, ...style,
    css: show.css + ringCss,
    body: `<defs>${show.defs}${ringDefs}</defs>\n${show.markup}\n${ringPart}`,
  });
}
