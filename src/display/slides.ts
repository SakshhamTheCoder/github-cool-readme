// A slideshow for the display cards: slides take turns in one region of the card, each entering
// with a pinball-style effect, in an endless loop. All movement jumps a whole dot at a time.

import { charCells, textCells } from './font.ts';
import { H as height, PITCH, W as width, keyframes, maskPath, path, type Cell, type Look } from './dmd.ts';

export type Effect = 'sparkle' | 'push' | 'wipe' | 'flash' | 'type';
export const EFFECTS: Effect[] = ['sparkle', 'push', 'wipe', 'flash', 'type'];

export const HOLD = 3.6; // seconds per slide
export const ENTER = 0.6; // seconds an entrance takes

/** Something on a slide: text in the dot font, or ready-made cells (bars and such). */
export type Item =
  | { text: string; col: number; row: number; scale?: number; dim?: boolean; shine?: boolean; accent?: boolean }
  | { cells: Cell[]; dim?: boolean; fill?: string; opacity?: number };

export interface Region {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

const px = (cells: number) => cells * PITCH;

/** A random but repeatable split of a 16x16 tile into groups of cells, for the sparkle. */
export function sparkleTiles(parts: number): Cell[][] {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const groups: Cell[][] = Array.from({ length: parts }, () => []);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) groups[Math.floor(rand() * parts)].push([c, r]);
  return groups;
}

export interface Slideshow {
  markup: string;
  defs: string;
  css: string;
  /** Seconds for one loop. */
  total: number;
}

/**
 * Slides take turns in `region`, entering with `effects` in turn. `id` keeps the classes unique
 * within a card. A single slide shows still, without effects.
 */
export function slideshow(id: string, slides: Item[][], region: Region, look: Look, effects: Effect[] = EFFECTS): Slideshow {
  const total = slides.length * HOLD;
  const P = id; // class prefix
  let css = '';
  let defs = '';
  let overlays = '';
  const all = `maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"`;
  const pushRows = region.rows;
  const animated = slides.length > 1;

  const draw = (item: Item, fill?: string) =>
    'text' in item
      ? path(textCells(item.text, item.col, item.row, item.scale ?? 1), fill ?? (item.accent ? look.accent : look.lit), item.dim ? `fill-opacity="${look.dim}"` : '')
      : path(item.cells, item.fill ?? fill ?? look.lit, item.opacity !== undefined ? `fill-opacity="${item.opacity}"` : item.dim ? `fill-opacity="${look.dim}"` : '');

  const markup = slides.map((items, i) => {
    let content = items.map((it) => draw(it)).join('');
    if (!animated) return `<g>${content}</g>`;

    const effect = effects[i % effects.length];
    const next = i + 1 < slides.length ? effects[(i + 1) % effects.length] : null;
    const start = i * HOLD;
    const end = start + HOLD;

    // Visibility and movement of the whole slide.
    const frames: { t: number; css: string; ease?: string }[] = [];
    const show = (t: number, y = 0, ease?: string) => frames.push({ t, css: `opacity: 1; transform: translateY(${y}px);`, ease });
    const hide = (t: number) => frames.push({ t, css: 'opacity: 0; transform: translateY(0);' });
    if (start > 0) hide(0), hide(start - 0.001);
    if (effect === 'push') show(start, px(pushRows), `steps(${pushRows})`), show(start + ENTER);
    else if (effect === 'flash') {
      for (let k = 0; k < 5; k++) frames.push({ t: start + (k * ENTER) / 5, css: `opacity: ${k % 2 ? 0 : 1}; transform: translateY(0);`, ease: 'steps(1, end)' });
    } else show(start);
    if (next === 'push') show(end, 0, `steps(${pushRows})`), show(end + ENTER, -px(pushRows)), hide(end + ENTER + 0.001);
    else if (next === 'wipe') show(end + ENTER), hide(end + ENTER + 0.001);
    else if (next) show(end - 0.001), hide(end);
    else show(total - 0.001), hide(total);
    if (next) hide(total); // pin the end, or CSS animates towards the element's own (visible) state
    css += `\n  .${P}s${i} { animation: ${P}s${i} ${total}s infinite; }` + keyframes(`${P}s${i}`, total, frames);

    // Shine: shining text drawn again in a brighter tint, seen through a band that sweeps across.
    const shining = items.filter((it) => 'text' in it && it.shine);
    const shine = shining.length ? `<g mask="url(#${P}sh${i})">${shining.map((it) => draw(it, look.shine)).join('')}</g>` : '';
    if (shining.length) {
      // At rest (no animation) the band waits off the card.
      defs += `<mask id="${P}sh${i}" ${all}><rect class="${P}sh${i}" x="0" y="0" width="${px(5)}" height="${height}" fill="#fff" transform="translate(-${px(10)} 0)"/></mask>`;
      // The band leans: its foot trails its top by tan(25°) of the card's height, so it travels that much
      // further to leave the card entirely, or its lower part would stay over text at the right end.
      const sweep = start + ENTER + 0.5;
      const fromX = px(region.col) - 30;
      const toX = px(region.col + region.cols) + Math.ceil(height * Math.tan((25 * Math.PI) / 180));
      const from = `transform: translateX(${fromX}px) skewX(-25deg);`;
      const to = `transform: translateX(${toX}px) skewX(-25deg);`;
      const steps = Math.round((toX - fromX) / px(3)); // a step every three dots
      const takes = (0.6 * (toX - fromX)) / (px(region.cols) + 30); // at the speed it always had
      css += `\n  .${P}sh${i} { animation: ${P}sh${i} ${total}s infinite; }` + keyframes(`${P}sh${i}`, total, [
        { t: 0, css: from },
        { t: sweep, css: from, ease: `steps(${steps})` },
        { t: sweep + takes, css: to },
        { t: total, css: to },
      ]);
    }

    if (effect === 'type') {
      // Typewriter: text one character at a time; everything else appears straight away.
      const chars: { cells: Cell[]; dim: boolean; accent: boolean }[] = [];
      for (const it of items) {
        if ('text' in it) for (const cells of charCells(it.text, it.col, it.row, it.scale ?? 1)) chars.push({ cells, dim: !!it.dim, accent: !!it.accent });
      }
      const step = (ENTER * 1.6) / Math.max(1, chars.length);
      content =
        items.filter((it) => !('text' in it)).map((it) => draw(it)).join('') +
        chars
          .map((ch, j) => {
            css += `\n  .${P}t${i}c${j} { animation: ${P}t${i}c${j} ${total}s infinite; }` + keyframes(`${P}t${i}c${j}`, total, [
              { t: 0, css: 'opacity: 0;' },
              { t: start + j * step, css: 'opacity: 0;', ease: 'steps(1, end)' },
              { t: start + (j + 1) * step, css: 'opacity: 1;' },
              { t: total - 0.001, css: 'opacity: 1;', ease: 'steps(1, end)' },
              { t: total, css: 'opacity: 0;' },
            ]);
            return path(ch.cells, ch.accent ? look.accent : look.lit, `class="${P}t${i}c${j}"${ch.dim ? ` fill-opacity="${look.dim}"` : ''}`);
          })
          .join('');
    }
    content += shine;

    if (effect === 'sparkle') {
      // Sparkle: the slide lights up through random groups of dots, one group after another.
      const groups = sparkleTiles(6);
      defs += groups
        .map((g, k) => `<pattern id="${P}sp${i}p${k}" width="${px(16)}" height="${px(16)}" patternUnits="userSpaceOnUse">${maskPath(g)}</pattern>`)
        .join('');
      // Once all groups are on, one solid area takes over, so the groups' small squares leave no seams.
      defs += `<mask id="${P}sp${i}" ${all}>` +
        groups.map((_, k) => `<rect class="${P}sp${i}k${k}" x="0" y="0" width="${width}" height="${height}" fill="url(#${P}sp${i}p${k})"/>`).join('') +
        `<rect class="${P}sp${i}all" x="0" y="0" width="${width}" height="${height}" fill="#fff"/></mask>`;
      css += `\n  .${P}sp${i}all { animation: ${P}sp${i}all ${total}s infinite; }` + keyframes(`${P}sp${i}all`, total, [
        { t: 0, css: 'opacity: 0;' },
        { t: start + ENTER, css: 'opacity: 0;', ease: 'steps(1, end)' },
        { t: start + ENTER + 0.001, css: 'opacity: 1;' },
        { t: total - 0.001, css: 'opacity: 1;', ease: 'steps(1, end)' },
        { t: total, css: 'opacity: 0;' },
      ]);
      groups.forEach((_, k) => {
        css += `\n  .${P}sp${i}k${k} { animation: ${P}sp${i}k${k} ${total}s infinite; }` + keyframes(`${P}sp${i}k${k}`, total, [
          { t: 0, css: 'opacity: 0;' },
          { t: start + (k * ENTER) / 6, css: 'opacity: 0;', ease: 'steps(1, end)' },
          { t: start + ((k + 1) * ENTER) / 6, css: 'opacity: 1;' },
          { t: total - 0.001, css: 'opacity: 1;', ease: 'steps(1, end)' },
          { t: total, css: 'opacity: 0;' },
        ]);
      });
      content = `<g mask="url(#${P}sp${i})">${content}</g>`;
    }

    if (effect === 'wipe') {
      // Wipe in: revealed from the left behind a lit bar.
      defs += `<mask id="${P}wi${i}" ${all}><rect class="${P}wi${i}" x="${px(region.col)}" y="0" width="${px(region.cols)}" height="${height}" fill="#fff"/></mask>`;
      css += `\n  .${P}wi${i} { transform-box: fill-box; transform-origin: left; animation: ${P}wi${i} ${total}s infinite; }` + keyframes(`${P}wi${i}`, total, [
        { t: 0, css: 'transform: scaleX(0);' },
        { t: start, css: 'transform: scaleX(0);', ease: `steps(${region.cols})` },
        { t: start + ENTER, css: 'transform: scaleX(1);' },
        { t: total - 0.001, css: 'transform: scaleX(1);' },
        { t: total, css: 'transform: scaleX(0);' },
      ]);
      content = `<g mask="url(#${P}wi${i})">${content}</g>`;
      const bar: Cell[] = [];
      for (let r = region.row + 1; r < region.row + region.rows - 1; r++) bar.push([region.col, r], [region.col + 1, r]);
      overlays += path(bar, look.lit, `class="${P}wb${i}" opacity="0"`);
      const travel = px(region.cols - 2);
      css += `\n  .${P}wb${i} { animation: ${P}wb${i} ${total}s infinite; }` + keyframes(`${P}wb${i}`, total, [
        { t: 0, css: 'opacity: 0; transform: translateX(0);' },
        { t: start - 0.001, css: 'opacity: 0; transform: translateX(0);' },
        { t: start, css: 'opacity: 1; transform: translateX(0);', ease: `steps(${region.cols - 2})` },
        { t: start + ENTER, css: `opacity: 1; transform: translateX(${travel}px);` },
        { t: start + ENTER + 0.001, css: 'opacity: 0; transform: translateX(0);' },
        { t: total, css: 'opacity: 0; transform: translateX(0);' },
      ]);
    }
    if (next === 'wipe') {
      // Wiped out from the left, in step with the next slide coming in.
      defs += `<mask id="${P}wo${i}" ${all}><rect class="${P}wo${i}" x="${px(region.col)}" y="0" width="${px(region.cols)}" height="${height}" fill="#fff"/></mask>`;
      css += `\n  .${P}wo${i} { transform-box: fill-box; transform-origin: right; animation: ${P}wo${i} ${total}s infinite; }` + keyframes(`${P}wo${i}`, total, [
        { t: 0, css: 'transform: scaleX(1);' },
        { t: end, css: 'transform: scaleX(1);', ease: `steps(${region.cols})` },
        { t: end + ENTER, css: 'transform: scaleX(0);' },
        { t: total, css: 'transform: scaleX(1);' },
      ]);
      content = `<g mask="url(#${P}wo${i})">${content}</g>`;
    }

    return `<g class="${P}s${i}"${i === 0 ? '' : ' opacity="0"'}>${content}</g>`;
  });

  defs += `<clipPath id="${P}region"><rect x="${px(region.col)}" y="${px(region.row)}" width="${px(region.cols)}" height="${px(region.rows)}"/></clipPath>`;
  return {
    markup: `<g clip-path="url(#${P}region)">\n${markup.join('\n')}\n${overlays}\n</g>`,
    defs,
    css,
    total,
  };
}
