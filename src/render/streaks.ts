// Streaks: three columns of numbers, two in view at a time, over the year's daily bars. The columns
// slide left one at a time, always the same way, so each page brings in one more column:
//   page 1: the streaks and the bests; the bars light the longest streak
//   page 2: the bests and the active days; the bars light the best month
//   page 3: the active days and the streaks again; the bars light the active days
// then on to page 1. The graph is always about the number at the bottom left, which is in green, and
// its green moves over the bars to the next page's days, spreading out or gathering in.
import type { Config } from '../config.ts';
import type { StreakDays, Tile } from '../stats.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, WIDTH, card, esc, fadeIn, formatNumber, headerText, truncate, type Theme } from './svg.ts';

const COLUMN = (WIDTH - 2 * PAD) / 2; // two in view
const ROW = 46;
const BARS = { width: WIDTH - 2 * PAD, base: CARD_HEIGHT - 16, height: 30 };
const HOLD = 4; // seconds a page stays
const MOVE = 0.8; // seconds to slide to the next page
/**
 * The columns left to right, each the tiles top and bottom: the streaks, the bests, and per active
 * day over the active days, so the bottom one is what the bars show.
 */
const ORDER: [number, number][] = [[0, 1], [4, 5], [3, 2]];

/** Where a highlight is over the bars: a left edge and a width, in px. */
type Span = { x: number; w: number };

export function renderStreaks(tiles: Tile[], sd: StreakDays, theme: Theme, config: Config): string {
  const title = config.cards.streaks.title;
  const animate = config.look.animations;
  const n = sd.days.length;

  // The bars: every day of the calendar across the card, as tall as the day was busy (by square
  // root, so a few very busy days don't flatten the rest).
  const day = BARS.width / Math.max(n, BARS.width); // a day's width: 1px, or less for over a year
  const left = PAD + BARS.width - n * day;
  const max = Math.max(1, ...sd.days.map((d) => d.count));
  const height = (count: number) => Math.max(1, Math.round(Math.sqrt(count / max) * BARS.height));
  const px = (v: number) => +v.toFixed(2);
  const path = sd.days.map((d, i) => (d.count ? `M${px(left + i * day)} ${BARS.base}v-${height(d.count)}h${px(day)}v${height(d.count)}z` : '')).join('');
  const span = (first: number, last: number): Span => ({ x: px(left + first * day), w: px((last - first + 1) * day) });
  const nowhere: Span = { x: px(PAD + BARS.width), w: 0 };

  // What each page lights: the longest streak, the best month, the active days. The
  // last can be many runs of days; on the other pages they all sit on the one run.
  const month = sd.bestMonth ? sd.days.map((d, i) => (d.date.startsWith(sd.bestMonth!) ? i : -1)).filter((i) => i >= 0) : [];
  const runs: Span[] = [];
  sd.days.forEach((d, i) => {
    if (!d.count) return;
    const previous = runs.at(-1);
    if (previous && i > 0 && sd.days[i - 1].count) previous.w = px(previous.w + day);
    else runs.push(span(i, i));
  });
  const longest = sd.longest ? span(...sd.longest) : nowhere;
  const best = month.length ? span(month[0], month[month.length - 1]) : nowhere;
  const spreads = runs.length ? runs : [{ x: px(best.x + best.w / 2), w: 0 }];

  // The numbers, column by column; with animations the first two columns again after the third, so
  // the slide can go on to page 1 and start over unseen.
  const positions = animate ? [...ORDER, ORDER[0], ORDER[1]] : ORDER.slice(0, 2);
  const numbers = positions
    .flatMap((column, p) =>
      [0, 1].map((row) => {
        const t = tiles[column[row]];
        if (!t) return '';
        // The bottom number of each column the graph is about at some page: in green while it is.
        const graphed = row === 1 && p <= 3;
        const lit = graphed && animate ? ` class="lit${p}"` : '';
        const still = graphed && !animate && p === 0 ? ` fill: ${theme.highlight};` : '';
        return fadeIn(
          PAD + p * COLUMN,
          CONTENT_TOP + row * ROW,
          p * 2 + row,
          `<text y="18"${lit} style="font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;${still}">${typeof t.value === 'number' ? formatNumber(t.value) : esc(t.value)}</text>` +
            `<text y="35" class="small secondary">${esc(truncate(t.label, COLUMN - 12, SMALL))}</text>`,
          config,
        );
      }),
    )
    .join('\n');

  // The bars in grey, then again in green through a mask: one rect per run of days lit on page 3.
  const top = BARS.base - BARS.height - 1;
  const at = (s: Span) => `translateX(${s.x}px) scaleX(${s.w})`;
  const rects = spreads
    .map((_, r) => `<rect${animate ? ` class="h${r}"` : ''} y="${top}" width="1" height="${BARS.height + 2}" fill="#fff" transform="translate(${longest.x} 0) scale(${longest.w} 1)"/>`)
    .join('');
  let body =
    `<clipPath id="cols"><rect x="${PAD}" y="0" width="${BARS.width}" height="${CARD_HEIGHT}"/></clipPath>` +
    `<mask id="lit" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${CARD_HEIGHT}">${rects}</mask>` +
    `<g clip-path="url(#cols)"><g${animate ? ' class="cols"' : ''}>\n${numbers}\n</g></g>\n` +
    (path ? `<path d="${path}" fill="${theme.track}"/><path d="${path}" fill="${theme.highlight}" mask="url(#lit)"/>` : '');

  let css = '';
  if (animate) {
    const total = 3 * (HOLD + MOVE);
    const pct = (t: number) => `${+((t / total) * 100).toFixed(2)}%`;
    // When each page starts and stops: page k holds from at[2k] to at[2k+1].
    const [a, b, c, d, e] = [HOLD, HOLD + MOVE, 2 * HOLD + MOVE, 2 * (HOLD + MOVE), 3 * HOLD + 2 * MOVE].map(pct);
    const green = `{ fill: ${theme.highlight}; }`;
    const plain = `{ fill: ${theme.text}; }`;
    const ease = `${total}s ease-in-out infinite`;
    css =
      `\n  .cols { animation: cols ${ease}; }` +
      `\n  @keyframes cols { 0%, ${a} { transform: translateX(0); } ${b}, ${c} { transform: translateX(-${COLUMN}px); } ${d}, ${e} { transform: translateX(-${2 * COLUMN}px); } 100% { transform: translateX(-${3 * COLUMN}px); } }` +
      `\n  .lit0 { animation: lit0 ${ease}; } @keyframes lit0 { 0%, ${a} ${green} ${b}, 100% ${plain} }` +
      `\n  .lit1 { animation: lit1 ${ease}; } @keyframes lit1 { 0%, ${a} ${plain} ${b}, ${c} ${green} ${d}, 100% ${plain} }` +
      `\n  .lit2 { animation: lit2 ${ease}; } @keyframes lit2 { 0%, ${c} ${plain} ${d}, ${e} ${green} 100% ${plain} }` +
      `\n  .lit3 { animation: lit3 ${ease}; } @keyframes lit3 { 0%, ${e} ${plain} 100% ${green} }` +
      spreads
        .map(
          (s, r) =>
            `\n  .h${r} { animation: h${r} ${ease}; } @keyframes h${r} { 0%, ${a} { transform: ${at(longest)}; } ${b}, ${c} { transform: ${at(best)}; } ${d}, ${e} { transform: ${at(s)}; } 100% { transform: ${at(longest)}; } }`,
        )
        .join('');
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
