import type { Config } from '../config.ts';
import type { LanguageItem } from '../compute.ts';
import { CARD_HEIGHT, CONTENT_TOP, PAD, WIDTH, TEXT, card, esc, fadeIn, headerText, truncate, type Theme } from './svg.ts';

const BAR_Y = CONTENT_TOP + 2;
const BAR_H = 10;
const GAP = 2;
const LEGEND_TOP = BAR_Y + BAR_H + 26;
const LEGEND_ROW = 32;

const pct = (p: number) => `${p < 0.1 ? '<0.1' : p.toFixed(1)}%`;

export function renderLanguages(items: LanguageItem[], theme: Theme, config: Config): string {
  const title = config.cards.languages.title;
  const header = title ? headerText(title, PAD) : '';
  const barWidth = WIDTH - 2 * PAD;
  const colorOf = (l: LanguageItem) => l.color ?? theme.neutral;

  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Languages', desc: 'No language data.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No language data yet</text>`,
    });
  }

  // Segments share the bar minus the gaps between them; a mask gives the bar its rounded ends.
  const usable = barWidth - GAP * (items.length - 1);
  let x = PAD;
  const segments = items
    .map((l) => {
      const w = Math.max(0, (l.percent / 100) * usable);
      const rect = `<rect x="${x.toFixed(2)}" y="${BAR_Y}" width="${w.toFixed(2)}" height="${BAR_H}" fill="${colorOf(l)}"/>`;
      x += w + GAP;
      return rect;
    })
    .join('');

  const bar = `
<mask id="bar"><rect class="grow" x="${PAD}" y="${BAR_Y}" width="${barWidth}" height="${BAR_H}" rx="${BAR_H / 2}" fill="#fff"/></mask>
<g mask="url(#bar)">${segments}</g>`;

  const colWidth = barWidth / 2;
  const legend = items
    .map((l, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      // The percentage follows the name, as on the old card.
      const name = truncate(l.name, colWidth - 70, TEXT);
      return fadeIn(
        PAD + col * colWidth,
        LEGEND_TOP + row * LEGEND_ROW,
        i,
        `<circle cx="5" cy="6" r="5" fill="${colorOf(l)}"/>` +
          `<text x="16" y="11" class="label">${esc(name)} ` +
          `<tspan class="secondary">${pct(l.percent)}</tspan></text>`,
        config,
        70,
      );
    })
    .join('\n');

  const rows = Math.ceil(items.length / 2);
  return card({
    width: WIDTH,
    height: Math.max(CARD_HEIGHT, LEGEND_TOP + (rows - 1) * LEGEND_ROW + 26),
    title: title ?? 'Most used languages',
    desc: items.map((l) => `${l.name} ${pct(l.percent)}`).join(', '),
    theme,
    config,
    body: header + bar + '\n' + legend,
  });
}
