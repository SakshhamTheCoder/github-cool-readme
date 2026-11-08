import type { Config } from '../config.ts';
import { DAY_NAMES, weekdayFacts, type WeekdayItem } from '../compute.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, WIDTH, card, esc, fadeIn, formatNumber, headerText, truncate, type Theme } from './svg.ts';

// The bars on the left, three numbers about them on the right, one under the other.
const BASELINE = 166;
const MAX_BAR = 112; // the busiest day's bar
const BAR_WIDTH = 18;
const DAY_Y = 184;
const BARS_WIDTH = 220; // from PAD
const STATS_X = PAD + BARS_WIDTH + 18;
// Each number has its label above it; the three together are centred on the bars, from the
// tallest one's top to the baseline. A pair runs from its label's top (2px down) to its number's
// baseline (34px down).
const STAT_ROW = 46;
const STAT_TOP = Math.round((2 * BASELINE - MAX_BAR) / 2 - (2 + 2 * STAT_ROW + 34) / 2);

/** A bar with rounded top corners, standing on the baseline. */
function bar(x: number, height: number): string {
  const top = BASELINE - height;
  const r = Math.min(4, height, BAR_WIDTH / 2);
  const right = x + BAR_WIDTH;
  return `M${x} ${BASELINE}V${top + r}Q${x} ${top} ${x + r} ${top}H${right - r}Q${right} ${top} ${right} ${top + r}V${BASELINE}Z`;
}

export function renderWeekly(days: WeekdayItem[], theme: Theme, config: Config): string {
  const title = config.cards.weekly.title;
  const header = title ? headerText(title, PAD) : '';
  const max = Math.max(0, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  if (!max) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Weekly rhythm', desc: 'No contributions in the last 12 months.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No contributions in the last 12 months</text>`,
    });
  }

  const busiest = days.findIndex((d) => d.count === max);
  // Shaded with the contribution graph's greens: the busier the day, the brighter the green.
  const shade = (count: number) => theme.heat[Math.min(3, Math.ceil((count / max) * 4) - 1)];
  const slot = BARS_WIDTH / days.length;
  const animate = config.look.animations;
  const bars = days
    .map((d, i) => {
      const x = PAD + i * slot + (slot - BAR_WIDTH) / 2;
      const cx = x + BAR_WIDTH / 2;
      const height = d.count ? Math.max(2, (d.count / max) * MAX_BAR) : 0;
      const delay = animate ? ` style="animation-delay: ${200 + i * 60}ms"` : '';
      return (
        (height ? `<path class="rise"${delay} d="${bar(x, height)}" fill="${shade(d.count)}"/>` : '') +
        `<text x="${cx}" y="${DAY_Y}" text-anchor="middle" class="small secondary">${esc(d.day)}</text>`
      );
    })
    .join('\n');

  // The numbers: the busiest day, the quietest, and how much is on weekdays.
  const facts = weekdayFacts(days);
  const width = WIDTH - PAD - STATS_X;
  const stats = [
    { value: DAY_NAMES[facts.busiest.day], label: `Busiest day · ${formatNumber(facts.busiest.count)}` },
    { value: DAY_NAMES[facts.quietest.day], label: `Quietest day · ${formatNumber(facts.quietest.count)}` },
    { value: `${facts.weekdays}%`, label: 'On weekdays' },
  ]
    .map((t, i) =>
      fadeIn(
        STATS_X,
        STAT_TOP + i * STAT_ROW,
        i + 3,
        `<text y="11" class="small secondary">${esc(truncate(t.label, width, SMALL))}</text>` +
          `<text y="34" style="font-size: 20px; font-weight: 700;">${esc(truncate(t.value, width, 20))}</text>`,
        config,
      ),
    )
    .join('\n');

  const css = animate
    ? `\n  .rise { transform-box: fill-box; transform-origin: bottom; animation: rise 0.7s cubic-bezier(.2,.7,.2,1) both; }` +
      `\n  @keyframes rise { from { transform: scaleY(0); } }`
    : '';

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Weekly rhythm',
    desc:
      `Contributions per weekday over the last 12 months (${formatNumber(total)} in total): ` +
      days.map((d) => `${d.day} ${d.count}`).join(', ') + `. Busiest: ${days[busiest].day}. Quietest: ${weekdayFacts(days).quietest.day}. ` +
      `On weekdays: ${weekdayFacts(days).weekdays}%.`,
    theme,
    config,
    css,
    body:
      header +
      `\n<line x1="${PAD}" y1="${BASELINE + 0.5}" x2="${PAD + BARS_WIDTH}" y2="${BASELINE + 0.5}" stroke="${theme.track}"/>\n` +
      bars +
      '\n' +
      stats,
  });
}
