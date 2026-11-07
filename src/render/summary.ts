import type { Config } from '../config.ts';
import type { CountKey, SummaryModel } from '../compute.ts';
import { icon, type IconName } from './icons.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, WIDTH, card, esc, fadeIn, formatNumber, headerText, type Theme } from './svg.ts';

const ICONS: Record<CountKey, IconName> = {
  commits: 'git-commit',
  pullRequests: 'git-pull-request',
  reviews: 'code-review',
  issues: 'issue-opened',
};

const ROW = 28;
const COL = 222; // right edge of the numbers: the year's and the all-time ones take turns there
const RING_X = 306; // centred in the space right of the numbers
const STILL = 3.5; // seconds each of the two stays still, as long as a page of the contributions card
const HALF_FLIP = 0.18; // seconds to fold one away, and again to unfold the other
const STAGGER = 70; // ms between the rows as they flip
const RADIUS = 40;
const LOGO = 66; // GitHub mark: nearly fills the ring, as on the old github-readme-stats card

export function renderSummary(m: SummaryModel, theme: Theme, config: Config): string {
  const rows = [
    ...m.rows.map((r) => ({ icon: ICONS[r.key], label: r.label, last12: formatNumber(r.last12Months), all: formatNumber(r.allTime) })),
    { icon: 'star' as IconName, label: 'Stars earned', last12: formatNumber(m.stars.last12Months), all: formatNumber(m.stars.allTime) },
  ];
  const tableTop = CONTENT_TOP;
  const height = tableTop + rows.length * ROW + 8;

  // One column of numbers, the last 12 months and all time in turn; without animations, all time.
  const turns = config.look.animations;
  // They flip: the header first, then each row a little after the one above it.
  const roll = (cls: string, row: number, content: string) =>
    `<g class="${cls}" style="animation-delay: ${row * STAGGER}ms">${content}</g>`;
  const year = (row: number, content: string) => (turns ? roll('year', row, content) : '');
  const allTime = (row: number, content: string) => (turns ? roll('all', row, content) : content);
  const header =
    (m.title ? headerText(m.title, PAD) : '') +
    year(0, headerText('Year', COL, 'end')) +
    allTime(0, headerText('All time', COL, 'end')) +
    headerText(`${m.ring === 'github' ? `${m.activity.percent}% ` : ''}Active days`, RING_X, 'middle');

  const body = rows
    .map((r, i) =>
      fadeIn(
        0,
        tableTop + i * ROW,
        i,
        icon(r.icon, PAD, 3) +
          `<text x="${PAD + 26}" y="15" class="label">${esc(r.label)}</text>` +
          (r.last12 ? year(i + 1, `<text x="${COL}" y="15" class="value" text-anchor="end">${r.last12}</text>`) : '') +
          allTime(i + 1, `<text x="${COL}" y="15" class="value" text-anchor="end">${r.all}</text>`),
        config,
      ),
    )
    .join('\n');

  // Activity ring: share of days with at least one contribution. Its caption sits on the header
  // line, and the ring is centred on the rows below it.
  const cy = tableTop + ((rows.length - 1) * ROW) / 2 + 10;
  const circumference = 2 * Math.PI * RADIUS;
  const offset = circumference * (1 - m.activity.percent / 100);
  const ring = `
<circle cx="${RING_X}" cy="${cy}" r="${RADIUS}" stroke="${theme.track}" stroke-width="7" fill="none"/>
<circle class="ring" cx="${RING_X}" cy="${cy}" r="${RADIUS}" stroke="${theme.accent}" stroke-width="7" fill="none" stroke-linecap="round"
  stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${RING_X} ${cy})"/>
${
  m.ring === 'github'
    ? // The mark is a circle cut off at the bottom; in its 24px drawing that circle's centre is (12, 12.5).
      `<g class="pop">${icon('mark-github', RING_X - (12 * LOGO) / 24, cy - (12.5 * LOGO) / 24, LOGO, 'logo')}</g>`
    : `<g class="pop"><text x="${RING_X}" y="${cy + 7}" text-anchor="middle" style="font-size: 20px; font-weight: 700;">${m.activity.percent}%</text></g>`
}`;

  // Each stays still for STILL seconds, then flips: it folds to a line and the other unfolds from it.
  // Without motion (reduced motion), all time.
  const seconds = 2 * STILL + 4 * HALF_FLIP;
  const at = (t: number) => `${((t / seconds) * 100).toFixed(2)}%`;
  const [s, h] = [STILL, HALF_FLIP];
  const cycle = `${seconds.toFixed(2)}s ease-in-out infinite`;
  const css =
    `\n  .logo { fill: ${theme.text}; }` +
    (turns
      ? `\n  @keyframes ring { from { stroke-dashoffset: ${circumference.toFixed(2)}; } }` +
        `\n  .year, .all { transform-box: fill-box; transform-origin: center; }` +
        `\n  .year { opacity: 0; animation: year ${cycle} both; }` +
        `\n  .all { animation: all ${cycle} both; }` +
        `\n  @keyframes year { 0%, ${at(s)} { opacity: 1; transform: scaleY(1); } ${at(s + h)}, ${at(2 * s + 3 * h)} { opacity: 1; transform: scaleY(0); }` +
        ` 100% { opacity: 1; transform: scaleY(1); } }` +
        `\n  @keyframes all { 0%, ${at(s + h)} { transform: scaleY(0); } ${at(s + 2 * h)}, ${at(2 * s + 2 * h)} { transform: scaleY(1); }` +
        ` ${at(2 * s + 3 * h)}, 100% { transform: scaleY(0); } }`
      : '');

  const desc = [
    ...m.rows.map((r) => `${r.label}: ${r.last12Months} in the last 12 months, ${r.allTime} all time.`),
    `Stars earned: ${m.stars.last12Months} in the last 12 months, ${m.stars.allTime} all time.`,
    `Active on ${m.activity.activeDays} of the last ${m.activity.totalDays} days (${m.activity.percent}%).`,
  ].join(' ');

  return card({
    width: WIDTH,
    height: Math.max(CARD_HEIGHT, height, cy + RADIUS + 10),
    title: m.title ?? 'GitHub stats',
    desc,
    theme,
    config,
    css,
    body: header + '\n' + body + ring,
  });
}
