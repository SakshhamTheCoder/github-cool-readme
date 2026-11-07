// Streaks: three columns of numbers, two in view at a time, over a year of daily bars.
//   page 1: current and longest streak, active days and per active day; the bars around the
//           longest streak, with it highlighted
//   page 2: the columns slide left: active days and per active day, best day and best month; the
//           bars around the best month, with it highlighted
// then back to page 1.
import type { Config } from '../config.ts';
import type { StreakDays, Tile } from '../stats.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, WIDTH, card, esc, fadeIn, formatNumber, headerText, truncate, type Theme } from './svg.ts';

const COLUMN = (WIDTH - 2 * PAD) / 2; // two in view
const ROW = 46;
const BARS = { days: WIDTH - 2 * PAD, base: CARD_HEIGHT - 16, height: 30 }; // a 1px bar a day
const HOLD = 3.5; // seconds a page stays, like a page of the contributions card
const MOVE = 0.8; // seconds to slide to the other page

/** The first day of a window of BARS.days around days first..last, kept within the days there are. */
function windowAround(total: number, first: number, last: number): number {
  return Math.max(0, Math.min(total - BARS.days, Math.round((first + last) / 2 - BARS.days / 2)));
}

/** A year of daily bars from `start`, as tall as the day was busy (by square root); the `lit` ones in green. */
function bars(sd: StreakDays, start: number, lit: (i: number) => boolean, theme: Theme): string {
  const days = sd.days.slice(start, start + BARS.days);
  const max = Math.max(1, ...days.map((d) => d.count));
  let plain = '';
  let bright = '';
  days.forEach((d, i) => {
    if (!d.count) return;
    const h = Math.max(1, Math.round(Math.sqrt(d.count / max) * BARS.height));
    const x = PAD + BARS.days - days.length + i;
    const bar = `M${x} ${BARS.base}v-${h}h1v${h}z`;
    if (lit(start + i)) bright += bar;
    else plain += bar;
  });
  return (plain ? `<path d="${plain}" fill="${theme.track}"/>` : '') + (bright ? `<path d="${bright}" fill="${theme.highlight}"/>` : '');
}

export function renderStreaks(tiles: Tile[], sd: StreakDays, theme: Theme, config: Config): string {
  const title = config.streaks.title;
  const animate = config.theme.animations;

  // The tiles go in three columns: the streaks, the active days, the bests. The number the bars
  // highlight is in their green: the longest streak on page 1, the best month on page 2. Each is in a
  // column the other page doesn't show, so they can stay green.
  const HIGHLIGHTED = [1, 5];
  const numbers = tiles
    .map((t, i) =>
      fadeIn(
        PAD + Math.floor(i / 2) * COLUMN,
        CONTENT_TOP + (i % 2) * ROW,
        i,
        `<text y="18" style="font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;${HIGHLIGHTED.includes(i) ? ` fill: ${theme.highlight};` : ''}">${typeof t.value === 'number' ? formatNumber(t.value) : esc(t.value)}</text>` +
          `<text y="35" class="small secondary">${esc(truncate(t.label, COLUMN - 12, SMALL))}</text>`,
        config,
      ),
    )
    .join('\n');

  // Each page's bars: the year around the longest streak, then around the best month.
  const n = sd.days.length;
  const recent = Math.max(0, n - BARS.days);
  const longest = sd.longest;
  const month = sd.bestMonth ? sd.days.map((d, i) => (d.date.startsWith(sd.bestMonth!) ? i : -1)).filter((i) => i >= 0) : [];
  const page1 = bars(sd, longest ? windowAround(n, ...longest) : recent, (i) => !!longest && i >= longest[0] && i <= longest[1], theme);
  const page2 = bars(sd, month.length ? windowAround(n, month[0], month[month.length - 1]) : recent, (i) => month.includes(i), theme);

  const view = `<clipPath id="cols"><rect x="${PAD}" y="0" width="${WIDTH - 2 * PAD}" height="${CARD_HEIGHT}"/></clipPath>`;
  let css = '';
  let body = view + `<g clip-path="url(#cols)"><g${animate ? ' class="cols"' : ''}>\n${numbers}\n</g></g>\n`;
  if (animate) {
    const total = 2 * (HOLD + MOVE);
    const pct = (t: number) => `${((t / total) * 100).toFixed(2)}%`;
    const [a, b, c] = [HOLD, HOLD + MOVE, 2 * HOLD + MOVE];
    css =
      `\n  .cols { animation: cols ${total}s ease-in-out infinite; }` +
      `\n  @keyframes cols { 0%, ${pct(a)} { transform: translateX(0); } ${pct(b)}, ${pct(c)} { transform: translateX(-${COLUMN}px); } 100% { transform: translateX(0); } }` +
      `\n  .page1 { animation: page1 ${total}s ease-in-out infinite; }` +
      `\n  @keyframes page1 { 0%, ${pct(a)} { opacity: 1; } ${pct(b)}, ${pct(c)} { opacity: 0; } 100% { opacity: 1; } }` +
      `\n  .page2 { opacity: 0; animation: page2 ${total}s ease-in-out infinite; }` +
      `\n  @keyframes page2 { 0%, ${pct(a)} { opacity: 0; } ${pct(b)}, ${pct(c)} { opacity: 1; } 100% { opacity: 0; } }`;
    body += `<g class="page1">${page1}</g><g class="page2">${page2}</g>`;
  } else {
    body += page1; // without animations, page 1 stays
  }

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Streaks',
    desc: tiles.map((t) => `${t.label}: ${t.value}`).join('. ') + '.',
    theme,
    config,
    css,
    body: (title ? headerText(title, PAD) : '') + '\n' + body,
  });
}
