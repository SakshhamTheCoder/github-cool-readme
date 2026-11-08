// About: a headline, then lines of your own text and facts, all from the settings. Lines wrap. When
// everything fits, it all shows at once; when not, the bottom row is kept for the facts, taking
// turns there, and the lines above come in one by one, stay, scroll up slowly just as far as the
// last one, stay again, and crossfade back to the start. The headline stays. Words marked
// *like this* are in the colour's emphasis. An SVG in a README can't hold working links, so those
// go under the card.
import type { Config } from '../config.ts';
import { CAPS, CARD_HEIGHT, CONTENT_TOP, PAD, PAGE_HOLD, PAGE_MOVE, TEXT, WIDTH, card, esc, fadeIn, headerText, markedText, textWidth, unmarked, wrapMarked, type Theme } from './svg.ts';

const ROOM = 430; // in textWidth's estimate, which runs wide: the card's 360px of text
const HEADLINE = 22;
const LINE = 22;
const BOTTOM = CARD_HEIGHT - 14; // the last baseline that fits
const FADE = 0.4; // seconds a fact takes to fade in or out
const START = 3; // seconds the lines stay before they scroll
const ROW_TIME = 1.6; // seconds to scroll up a row
const END = 3; // seconds the last lines stay before starting over
const CROSS = 0.8; // seconds to crossfade back to the start

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
  // Capitals, letter-spaced, run wider than textWidth's estimate: about 0.72em each.
  const gap = Math.max(0, ...entries.map(([label]) => label.length * CAPS * 0.72)) + 10;
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
    // The lines' room: all of it, or all but the bottom row, kept for the facts. The lines that
    // don't fit come up slowly, just as far as the last one, which stays a while; then they
    // crossfade to a copy of the start, which the loop takes over from unseen.
    const room = entries.length ? visible - 1 : visible;
    const rows = wrapped.flat();
    const over = rows.length - room;
    const scrolls = over > 0 && animate;
    const rowsMarkup = rows.map((row, i) => fadeIn(PAD, top + i * LINE, Math.min(i, room) + 1, lineRow(row), config)).join('\n');
    const startCopy = rows.slice(0, room).map((row, i) => `<g transform="translate(${PAD} ${top + i * LINE})">${lineRow(row)}</g>`).join('\n');
    body =
      `<clipPath id="about"><rect x="0" y="${top - 16}" width="${WIDTH}" height="${room * LINE}"/></clipPath>` +
      `<g clip-path="url(#about)"><g${scrolls ? ' class="scroll"' : ''}>\n${rowsMarkup}\n</g>` +
      (scrolls ? `<g class="again">\n${startCopy}\n</g>` : '') +
      '</g>';
    if (scrolls) {
      const at = [START, over * ROW_TIME, END, CROSS].reduce<number[]>((t, d) => [...t, (t.at(-1) ?? 0) + d], []);
      const total = at.at(-1)!;
      const pct = (t: number) => `${+((t / total) * 100).toFixed(2)}%`;
      const to = `translateY(-${over * LINE}px)`;
      const loop = `${+total.toFixed(2)}s ease-in-out infinite`;
      css +=
        `\n  .scroll { animation: scroll ${loop}; }` +
        `\n  @keyframes scroll { 0%, ${pct(at[0])} { transform: translateY(0); } ${pct(at[1])} { transform: ${to}; } ${pct(at[2])} { opacity: 1; } 100% { opacity: 0; transform: ${to}; } }` +
        `\n  .again { opacity: 0; animation: again ${loop}; }` +
        `\n  @keyframes again { 0%, ${pct(at[2])} { opacity: 0; } 100% { opacity: 1; } }`;
    }

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
