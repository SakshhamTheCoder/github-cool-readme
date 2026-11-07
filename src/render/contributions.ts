import type { Config } from '../config.ts';
import type { ContributionItem } from '../compute.ts';
import { icon } from './icons.ts';
import {
  CARD_HEIGHT, CONTENT_TOP, PAD, SMALL, TEXT, WIDTH, card, esc, fadeIn, formatCompact, formatMonth, headerText, plural,
  textWidth, truncate, type Theme,
} from './svg.ts';

const VISIBLE = 3; // rows in view; more scroll past in a loop
const ROW = 46;
const AVATAR = 30;
const TOP = CONTENT_TOP - 2;
const HOLD = 3.5; // seconds each page stays in view
const MOVE = 0.8; // seconds to scroll to the next page

export function describe(i: ContributionItem): string {
  const parts: string[] = [];
  if (i.merged) parts.push(`${plural(i.merged, 'PR')} merged`);
  if (i.open) parts.push(i.merged ? `${i.open} open` : `${plural(i.open, 'PR')} open`);
  return `${parts.join(', ')} · ${formatMonth(i.lastDate)}`;
}

/** Scroll offsets of the pages, VISIBLE rows apart; the last page is moved up so it's full. */
export function pageOffsets(count: number): number[] {
  const offsets = [0];
  for (let first = VISIBLE; offsets.at(-1)! < (count - VISIBLE) * ROW; first += VISIBLE) {
    offsets.push(Math.min(first, count - VISIBLE) * ROW);
  }
  return offsets;
}

/** Keyframes that hold each page, scroll to the next, and from the last back to the top. */
function scrollKeyframes(offsets: number[]): { css: string; seconds: number } {
  const step = HOLD + MOVE;
  const seconds = offsets.length * step;
  const pct = (t: number) => `${((t / seconds) * 100).toFixed(2)}%`;
  const frames = offsets.map((y, i) => `${pct(i * step)}, ${pct(i * step + HOLD)} { transform: translateY(-${y}px); }`);
  frames.push('100% { transform: translateY(0); }');
  return { css: `\n  @keyframes scroll { ${frames.join(' ')} }`, seconds };
}

export function renderContributions(items: ContributionItem[], theme: Theme, config: Config): string {
  const title = config.contributions.title;
  const header = title ? headerText(title, PAD) : '';
  if (!items.length) {
    return card({
      width: WIDTH, height: CARD_HEIGHT, title: title ?? 'Notable contributions', desc: 'No contributions to other projects yet.', theme, config,
      body: header + `<text x="${PAD}" y="${CONTENT_TOP + 14}" class="label muted">No contributions to other projects yet</text>`,
    });
  }

  const nameX = AVATAR + 12;
  const right = WIDTH - 2 * PAD;
  const rows = items
    .map((item, i) => {
      const [owner, repo] = item.repo.split('/');
      const stars = formatCompact(item.stars);
      const room = right - nameX - textWidth(stars, SMALL) - 30;
      // Show "owner/" in a softer color; shorten the repo name first, then the owner.
      let ownerText = `${owner}/`;
      let repoText = truncate(repo, room - textWidth(ownerText, TEXT), TEXT, true);
      if (repoText.endsWith('…') && repoText.length < 10) {
        ownerText = truncate(ownerText, room / 3, TEXT);
        repoText = truncate(repo, room - textWidth(ownerText, TEXT), TEXT, true);
      }
      const r = AVATAR / 2;
      const avatar = item.avatar
        ? `<clipPath id="av${i}"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath>` +
          `<image href="${item.avatar}" width="${AVATAR}" height="${AVATAR}" clip-path="url(#av${i})"/>` +
          `<circle cx="${r}" cy="${r}" r="${r - 0.5}" stroke="${theme.border}" fill="none"/>`
        : `<circle cx="${r}" cy="${r}" r="${r}" fill="${theme.track}"/>` +
          `<text x="${r}" y="${r + 5}" text-anchor="middle" class="value secondary">${esc(owner[0]?.toUpperCase() ?? '?')}</text>`;
      return fadeIn(
        PAD,
        TOP + i * ROW,
        i,
        avatar +
          `<text x="${nameX}" y="13" class="label"><tspan class="secondary">${esc(ownerText)}</tspan><tspan style="font-weight: 600;">${esc(repoText)}</tspan></text>` +
          `<text x="${nameX}" y="30" class="small muted">${esc(describe(item))}</text>` +
          icon('star', right - textWidth(stars, SMALL) - 20, 8, 14) +
          `<text x="${right}" y="20" class="small secondary" style="font-weight: 600;" text-anchor="end">${stars}</text>`,
        config,
      );
    })
    .join('\n');

  // Only VISIBLE rows fit; with more, they scroll up a page at a time, then back to the top.
  const scrolls = items.length > VISIBLE && config.theme.animations;
  const keyframes = scrolls ? scrollKeyframes(pageOffsets(items.length)) : null;
  const css = keyframes ? `\n  .scroll { animation: scroll ${keyframes.seconds}s ease-in-out infinite; }${keyframes.css}` : '';
  const view = `<clipPath id="rows"><rect x="0" y="${TOP - 4}" width="${WIDTH}" height="${VISIBLE * ROW}"/></clipPath>`;

  return card({
    width: WIDTH,
    height: CARD_HEIGHT,
    title: title ?? 'Notable contributions',
    desc: items.map((i) => `${i.repo} (${i.stars} stars): ${describe(i)}`).join('. '),
    theme,
    config,
    css,
    body: header + view + `<g clip-path="url(#rows)"><g${scrolls ? ' class="scroll"' : ''}>\n${rows}\n</g></g>`,
  });
}
