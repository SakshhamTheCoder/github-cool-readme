// About: a headline, then lines of your own text and facts, all from the settings. When there
// are more lines and facts than fit, they scroll up a page at a time, like the notable
// contributions; the headline stays. An SVG in a README can't hold working links, so those go
// under the card.
import type { Config } from '../config.ts';
import { CAPS, CARD_HEIGHT, CONTENT_TOP, PAD, TEXT, WIDTH, card, esc, fadeIn, headerText, pageOffsets, scrolling, textWidth, truncate, type Theme } from './svg.ts';

const ROOM = 430; // in textWidth's estimate, which runs wide: the card's 360px of text
const HEADLINE = 22;
const LINE = 22;
const BOTTOM = CARD_HEIGHT - 14; // the last baseline that fits

export function renderAbout(theme: Theme, config: Config): string {
  const { title, headline, lines, facts } = config.cards.about;
  const header = title ? headerText(title, PAD) : '';
  const entries = Object.entries(facts);
  if (!headline && !lines.length && !entries.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'About', desc: 'Nothing here yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">Nothing here yet</text>`,
    });
  }

  // The headline, if any, stays at the top.
  const top = CONTENT_TOP + (headline ? 48 : 14); // the first row's baseline
  const head = headline
    ? fadeIn(PAD, CONTENT_TOP + 20, 0, `<text style="font-size: ${HEADLINE}px; font-weight: 700;">${esc(truncate(headline, ROOM * (TEXT / HEADLINE), HEADLINE, true))}</text>`, config)
    : '';

  // Then a row each: the lines, then the facts, their text lined up after the longest label.
  const gap = Math.max(0, ...entries.map(([label]) => textWidth(label.toUpperCase(), CAPS))) + 12;
  const rows = [
    ...lines.map((line) => `<text class="label secondary">${esc(truncate(line, ROOM, TEXT))}</text>`),
    ...entries.map(
      ([label, text]) =>
        `<text class="col">${esc(label.toUpperCase())}</text>` +
        `<text x="${gap.toFixed(0)}" class="label">${esc(truncate(text, ROOM - gap, TEXT))}</text>`,
    ),
  ].map((row, i) => fadeIn(PAD, top + i * LINE, i + 1, row, config));

  // As many rows as fit are in view; with more, they scroll up a page at a time, then back to the top.
  const visible = Math.floor((BOTTOM - top) / LINE) + 1;
  const scrolls = rows.length > visible && config.look.animations;
  const view = `<clipPath id="about"><rect x="0" y="${top - 16}" width="${WIDTH}" height="${visible * LINE}"/></clipPath>`;

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'About',
    desc: [headline, ...lines, ...entries.map(([label, text]) => `${label}: ${text}`)].filter(Boolean).join(' '),
    theme,
    config,
    css: scrolls ? scrolling('scroll', pageOffsets(rows.length, visible, LINE)) : '',
    body: header + '\n' + head + '\n' + view + `<g clip-path="url(#about)"><g${scrolls ? ' class="scroll"' : ''}>\n${rows.join('\n')}\n</g></g>`,
  });
}
