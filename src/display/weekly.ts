// Weekly rhythm as a pinball-style display, like the classic card: the seven days' bars on the left,
// and on the right the busiest day, the quietest and how much is on weekdays. It dissolves in,
// stays, and snaps off to dissolve in again.

import { weekdayFacts, type WeekdayItem } from '../compute.ts';
import { textCells, textWidth } from './font.ts';
import { H, PITCH, W, drawDots, frame, keyframes, maskPath, path, type Cell, type Style } from './dmd.ts';
import { titleLine } from './languages.ts';
import { sparkleTiles } from './slides.ts';

const SLOT = 12; // columns per day
const BAR_COLS = 8;
const BASE = 58; // the bars stand on this row
const MAX_ROWS = 43;
const LABEL_ROW = 61;
const STATS_COL = 4 + 7 * SLOT + 8;
const STAT_ROWS = [12, 29, 46]; // each a label, and its value 8 rows under it: the three centred on the bars

// The loop, in seconds.
const SPARKLE = 0.6; // dots switching on in random order
const HOLD = 10;
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

  // The bars, each with its day's first letter under it.
  const bars: Cell[] = [];
  const labels: Cell[] = [];
  days.forEach((d, k) => {
    const center = 4 + k * SLOT + SLOT / 2;
    const rows = d.count ? Math.max(1, Math.round((d.count / max) * MAX_ROWS)) : 0;
    for (let r = BASE - rows; r < BASE; r++) for (let c = 0; c < BAR_COLS; c++) bars.push([Math.round(center - BAR_COLS / 2) + c, r]);
    const label = d.day[0].toUpperCase();
    labels.push(...textCells(label, Math.round(center - textWidth(label) / 2), LABEL_ROW));
  });

  // The numbers: what each is, dimmed, and the value under it.
  const facts = weekdayFacts(days);
  const values: Cell[] = [];
  const names: Cell[] = [];
  [
    [facts.busiest.day, 'BUSIEST'],
    [facts.quietest.day, 'QUIETEST'],
    [`${facts.weekdays}%`, 'WEEKDAYS'],
  ].forEach(([value, name], i) => {
    names.push(...textCells(name, STATS_COL, STAT_ROWS[i]));
    values.push(...textCells(value.toUpperCase(), STATS_COL, STAT_ROWS[i] + 8));
  });

  const total = SPARKLE + HOLD;
  let css = '';

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

  return frame({
    width: W, height: H, title: title ?? 'Weekly rhythm',
    desc:
      `Contributions per weekday over the last 12 months: ${days.map((d) => `${d.day} ${d.count}`).join(', ')}. ` +
      `Busiest: ${facts.busiest.day}. Quietest: ${facts.quietest.day}. On weekdays: ${facts.weekdays}%.`,
    ...style, css,
    body:
      `<defs>${patterns}${sparkle}</defs>\n${header}\n<g mask="url(#wsp)">${path(bars, look.accent)}` +
      `${path(labels, look.lit, `fill-opacity="${look.dim}"`)}${path(values, look.lit)}${path(names, look.lit, `fill-opacity="${look.dim}"`)}</g>`,
  });
}
