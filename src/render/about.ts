// About: a headline, then lines of your own text and facts, all from the settings. Lines wrap. When
// everything fits, it all shows at once; when not, the bottom row is kept for the facts, taking
// turns there, and the lines above scroll up a page at a time, like the notable contributions,
// each page starting with a line of its own. The headline stays. Words marked *like this* are in
// the colour's emphasis. An SVG in a README can't hold working links, so those go under the card.
import type { Config } from '../config.ts';
import { CAPS, CARD_HEIGHT, CONTENT_TOP, PAD, PAGE_HOLD, PAGE_MOVE, TEXT, WIDTH, card, esc, fadeIn, headerText, markedText, scrolling, textWidth, unmarked, wrapMarked, type Theme } from './svg.ts';

const ROOM = 430; // in textWidth's estimate, which runs wide: the card's 360px of text
const HEADLINE = 22;
const LINE = 22;
const BOTTOM = CARD_HEIGHT - 14; // the last baseline that fits
const FADE = 0.4; // seconds a fact takes to fade in or out

export function renderAbout(theme: Theme, config: Config): string {
  const { title, headline, lines, facts } = config.cards.about;
  const header = title ? headerText(title, PAD) : '';
  const entries = Object.entries(facts);
  const animate = config.look.animations;
  if (!headline && !lines.length && !entries.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'About', desc: 'Nothing here yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">Nothing here yet</text>`,
    });
  }

  // The headline, if any, stays at the top.
  const top = CONTENT_TOP + (headline ? 48 : 14); // the first row's baseline
  const head = headline
    ? fadeIn(PAD, CONTENT_TOP + 20, 0, `<text style="font-size: ${HEADLINE}px; font-weight: 700;">${markedText(headline, ROOM * (TEXT / HEADLINE), HEADLINE, theme.emphasis, true)}</text>`, config)
    : '';

  // The lines, wrapped into rows; the facts a row each, their text lined up after the longest label.
  const wrapped = lines.map((line) => wrapMarked(line, (row) => textWidth(row, TEXT) <= ROOM));
  const lineRow = (text: string) => `<text class="label secondary">${markedText(text, ROOM, TEXT, theme.emphasis)}</text>`;
  const gap = Math.max(0, ...entries.map(([label]) => textWidth(label.toUpperCase(), CAPS))) + 12;
  const factRow = ([label, text]: [string, string]) =>
    `<text class="col">${esc(label.toUpperCase())}</text>` + `<text x="${gap.toFixed(0)}" class="label">${markedText(text, ROOM - gap, TEXT, theme.emphasis)}</text>`;
  const visible = Math.floor((BOTTOM - top) / LINE) + 1;
  const rowCount = wrapped.reduce((n, rows) => n + rows.length, 0);

  let body = '';
  let css = '';
  if (rowCount + entries.length <= visible) {
    // Everything fits: the lines' rows, then the facts.
    body = [...wrapped.flat().map(lineRow), ...entries.map(factRow)].map((row, i) => fadeIn(PAD, top + i * LINE, i + 1, row, config)).join('\n');
  } else {
    // The lines' room: all of it, or all but the bottom row, kept for the facts. A line that would
    // run over onto the next page starts it instead, unless it's longer than a page itself.
    const room = entries.length ? visible - 1 : visible;
    const placed: (string | null)[] = [];
    for (const rows of wrapped) {
      const used = placed.length % room;
      if (used && used + rows.length > room && rows.length <= room) while (placed.length % room) placed.push(null);
      placed.push(...rows);
    }
    const pages = Math.ceil(placed.length / room);
    const scrolls = pages > 1 && animate;
    const rowsMarkup = placed
      .map((row, i) => (row === null ? '' : fadeIn(PAD, top + i * LINE, Math.min(i, room) + 1, lineRow(row), config)))
      .filter(Boolean)
      .join('\n');
    body =
      `<clipPath id="about"><rect x="0" y="${top - 16}" width="${WIDTH}" height="${room * LINE}"/></clipPath>` +
      `<g clip-path="url(#about)"><g${scrolls ? ' class="scroll"' : ''}>\n${rowsMarkup}\n</g></g>`;
    if (scrolls) css += scrolling('scroll', Array.from({ length: pages }, (_, p) => p * room * LINE));

    // The facts take turns in the bottom row, fading out and in; one stays.
    if (entries.length) {
      const y = top + room * LINE;
      const turns = entries.length > 1 && animate;
      const hold = PAGE_HOLD + PAGE_MOVE;
      body +=
        '\n' +
        (turns ? entries : entries.slice(0, 1))
          .map((entry, i) => {
            const fact = fadeIn(PAD, y, room + 1, factRow(entry), config);
            return turns ? `<g class="fact" style="animation-delay: ${(i * hold).toFixed(2)}s">${fact}</g>` : fact;
          })
          .join('\n');
      if (turns) {
        const total = entries.length * hold;
        const pct = (t: number) => `${+((t / total) * 100).toFixed(2)}%`;
        css +=
          `\n  .fact { opacity: 0; animation: fact ${total}s linear infinite backwards; }` +
          `\n  @keyframes fact { 0% { opacity: 0; } ${pct(FADE)}, ${pct(hold - FADE)} { opacity: 1; } ${pct(hold)}, 100% { opacity: 0; } }`;
      }
    }
  }

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'About',
    desc: [headline, ...lines, ...entries.map(([label, text]) => `${label}: ${text}`)].filter(Boolean).map((t) => unmarked(t!)).join(' '),
    theme,
    config,
    css,
    body: header + '\n' + head + '\n' + body,
  });
}
