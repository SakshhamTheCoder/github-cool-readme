// Weekly rhythm as a pinball-style display: all seven days in a row, three in view, scrolling
// slowly from Monday to Sunday, then snapping off and dissolving back in at the start, like the
// summary's slides. Bars without numbers.

import type { WeekdayItem } from '../compute.ts';
import { textCells, textWidth } from './font.ts';
import { COLS, H, PITCH, W, drawDots, frame, keyframes, maskPath, path, type Cell, type Look, type Style } from './dmd.ts';
import { titleLine } from './languages.ts';
import { sparkleTiles } from './slides.ts';

const SLOT = COLS / 3; // columns per day: three days in view
const BAR_COLS = 16;
const BASE = 52; // the bars stand on this row
const MAX_ROWS = 35;
const LABEL_ROW = 57;

// The loop, in seconds.
const SPARKLE = 0.6; // dots switching on in random order
const HOLD_START = 2.5;
const SCROLL = 6; // one dot column every 30ms
const HOLD_END = 2;
const GROUPS = 6;

export function renderDisplayWeekly(days: WeekdayItem[], title: string | null, style: Style): string {
  const { look } = style;
  drawDots(style.dots);
  const header = titleLine(title, look);
  const max = Math.max(0, ...days.map((d) => d.count));
  if (!max) {
    return frame({
      width: W, height: H, title: title ?? 'Weekly rhythm', desc: 'No contributions in the last 12 months.', ...style, css: '',
      body: header + path(textCells('NO ACTIVITY YET', 4, 32), look.lit),
    });
  }

  const bars: Cell[] = [];
  const labels: Cell[] = [];
  days.forEach((d, k) => {
    const center = k * SLOT + SLOT / 2;
    const rows = d.count ? Math.max(1, Math.round((d.count / max) * MAX_ROWS)) : 0;
    for (let r = BASE - rows; r < BASE; r++) for (let c = 0; c < BAR_COLS; c++) bars.push([Math.round(center - BAR_COLS / 2) + c, r]);
    const label = d.day.toUpperCase();
    labels.push(...textCells(label, Math.round(center - textWidth(label) / 2), LABEL_ROW));
  });

  const distance = Math.round((days.length - 3) * SLOT) * PITCH;
  const total = SPARKLE + HOLD_START + SCROLL + HOLD_END;
  const scrollStart = SPARKLE + HOLD_START;
  let css =
    `\n  .strip { animation: strip ${total}s infinite; }` +
    keyframes('strip', total, [
      { t: 0, css: 'transform: translateX(0);' },
      { t: scrollStart, css: 'transform: translateX(0);', ease: `steps(${distance / PITCH})` },
      { t: scrollStart + SCROLL, css: `transform: translateX(-${distance}px);` },
      { t: total, css: `transform: translateX(-${distance}px);` },
    ]);

  // Dissolve in: random groups of dots switch on one after another; at the end all switch off at once.
  const groups = sparkleTiles(GROUPS);
  const patterns = groups
    .map((g, k) => `<pattern id="wsp${k}" width="${16 * PITCH}" height="${16 * PITCH}" patternUnits="userSpaceOnUse">${maskPath(g)}</pattern>`)
    .join('');
  // Once all groups are on, one solid area takes over: the groups' many small squares would
  // otherwise leave faint seams where they meet when the card is shown scaled.
  const sparkle = `<mask id="wsp" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
    groups.map((_, k) => `<rect class="wsp${k}" x="0" y="0" width="${W}" height="${H}" fill="url(#wsp${k})"/>`).join('') +
    `<rect class="wspall" x="0" y="0" width="${W}" height="${H}" fill="#fff"/></mask>`;
  css += `\n  .wspall { animation: wspall ${total}s infinite; }` + keyframes('wspall', total, [
    { t: 0, css: 'opacity: 0;' },
    { t: SPARKLE, css: 'opacity: 0;', ease: 'steps(1, end)' },
    { t: SPARKLE + 0.001, css: 'opacity: 1;' },
    { t: total - 0.001, css: 'opacity: 1;', ease: 'steps(1, end)' },
    { t: total, css: 'opacity: 0;' },
  ]);
  groups.forEach((_, k) => {
    const on = (k * SPARKLE) / GROUPS;
    css += `\n  .wsp${k} { animation: wsp${k} ${total}s infinite; }` + keyframes(`wsp${k}`, total, [
      { t: 0, css: 'opacity: 0;' },
      { t: on, css: 'opacity: 0;', ease: 'steps(1, end)' },
      { t: on + SPARKLE / GROUPS, css: 'opacity: 1;' },
      { t: total - 0.001, css: 'opacity: 1;', ease: 'steps(1, end)' },
      { t: total, css: 'opacity: 0;' },
    ]);
  });
  const clip = `<clipPath id="wview"><rect x="0" y="${12 * PITCH}" width="${W}" height="${H - 12 * PITCH}"/></clipPath>`;

  return frame({
    width: W, height: H, title: title ?? 'Weekly rhythm',
    desc: `Contributions per weekday over the last 12 months: ${days.map((d) => `${d.day} ${d.count}`).join(', ')}.`,
    ...style, css,
    body: `<defs>${clip}${patterns}${sparkle}</defs>\n${header}\n<g clip-path="url(#wview)" mask="url(#wsp)"><g class="strip">${path(bars, look.accent)}${path(labels, look.lit, `fill-opacity="${look.dim}"`)}</g></g>`,
  });
}
