// The streaks and about cards.
import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { CARDS, DEFAULT_CONFIG, parseConfig, type Config } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import { wrap } from '../src/display/about.ts';
import { textCells } from '../src/display/font.ts';
import { streakDays, streakLengths, streakStats } from '../src/stats.ts';
import { fixture } from './fixtures/snapshot.ts';

const render = (card: 'streaks' | 'about', patch: (c: Config) => void = () => {}) => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.show = [card];
  patch(c);
  return renderAll(compute(fixture(), c), c)[`${card}-light.svg`];
};
const days = (start: string, counts: number[]) =>
  counts.map((count, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10), count }));
const tile = (items: { label: string; value: number | string }[], label: string) => items.find((t) => t.label === label)?.value;

describe('streaks', () => {
  it('finds the longest run and the one reaching the last day', () => {
    expect(streakLengths(days('2026-01-01', [1, 1, 1, 0, 1, 1]))).toEqual({ current: 2, longest: 3 });
  });

  it('keeps the streak alive through a quiet last day, but not two', () => {
    expect(streakLengths(days('2026-01-01', [1, 1, 1, 0]))).toEqual({ current: 3, longest: 3 });
    expect(streakLengths(days('2026-01-01', [1, 1, 0, 0]))).toEqual({ current: 0, longest: 2 });
  });

  it('runs across a year, ignores a day listed twice, and doesn\'t join runs across a missing day', () => {
    expect(streakLengths([...days('2025-12-30', [1, 1, 1, 1]), { date: '2026-01-02', count: 1 }])).toEqual({ current: 4, longest: 4 });
    expect(streakLengths([{ date: '2026-01-01', count: 1 }, { date: '2026-01-03', count: 1 }])).toEqual({ current: 1, longest: 1 });
  });

  it('copes with no data', () => {
    expect(streakLengths([])).toEqual({ current: 0, longest: 0 });
    expect(tile(streakStats([]), 'Current streak')).toBe('0 days');
  });

  it('reports the streaks, active days and the best day and month', () => {
    const stats = compute(fixture(), DEFAULT_CONFIG).streaks;
    // The last 12 months' calendar, Oct 1-10: 0 0 0 0 4 5 6 7 8 9.
    expect(tile(stats, 'Current streak')).toBe('6 days');
    expect(tile(stats, 'Longest streak')).toBe('6 days');
    expect(tile(stats, 'Active days')).toBe(6);
    expect(tile(stats, 'Per active day')).toBe('7'); // 39 / 6, rounded
    expect(tile(stats, 'Best day · Oct 10, 2026')).toBe(9);
    expect(tile(stats, 'Best month · Oct 2026')).toBe(39);
  });

  it('knows where the runs, the best day and the best month are, for the oled strips', () => {
    const sd = streakDays([...days('2026-01-01', [2, 9, 1, 0]), ...days('2026-02-27', [3, 3, 0])]);
    expect(sd.days.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-02-27', '2026-02-28', '2026-03-01']);
    expect(sd.longest).toEqual([0, 2]);
    expect(sd.current).toEqual([4, 5]);
    expect(sd.best).toBe(1);
    expect(sd.bestMonth).toBe('2026-01');
    expect(streakDays([])).toEqual({ days: [], current: null, longest: null, best: null, bestMonth: null });
  });

  it('gives each oled slide its own strip of days', () => {
    const c = parseConfig('style: oled\ncards: [streaks]\n');
    const calendar = [...days('2026-01-01', [2, 9, 1, 0]), ...days('2026-02-27', [3, 3, 0])];
    const svg = renderAll(compute({ ...fixture(), calendar }, c), c)['streaks-dark.svg'];
    expect(svg.match(/-opacity="0.25"/g)?.length).toBeGreaterThanOrEqual(5); // the days a slide isn't about, slide by slide
    expect(svg).toMatch(/-opacity="0.6"/); // the average line
  });

  it('slides on through three pages on the classic card, the green moving over the bars, or stays on the first', () => {
    const svg = render('streaks');
    // Always left, a column at a time, ending on page 1 again (its columns repeated) to start over unseen.
    expect(svg).toMatch(/@keyframes cols \{.*translateX\(-180px\).*translateX\(-360px\).*100% \{ transform: translateX\(-540px\); \} \}/);
    expect(svg.match(/>6 days</g)?.length).toBe(4); // the current and longest streaks (both 6 days), and their copies
    // The bottom-left number is green while the graph is about it: longest streak, best month, per active day.
    for (const [p, value] of [[0, '6 days'], [1, '39'], [2, '7'], [3, '6 days']]) expect(svg).toContain(`class="lit${p}" style="font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;">${value}<`);
    // The green bars show through rects that move between the pages; one per run of days above the average (Oct 8-10).
    expect(svg).toContain('mask="url(#lit)"');
    expect(svg.match(/<rect class="h\d+"/g)?.length).toBe(1);
    expect(svg).toContain('class="avg"');
    const still = render('streaks', (c) => (c.look.animations = false));
    expect(still).not.toContain('class="cols"');
    expect(still).not.toContain('@keyframes');
    expect(still).not.toContain('class="avg"');
    expect(still.match(/fill: #2da44e;/g)?.length).toBe(1);
    expect(still).toMatch(/fill: #2da44e;">6 days</); // the longest streak's number
    expect(still).toContain('transform="translate(374 0) scale(6 1)"'); // over its days
  });

  it('is a 400 by 195 card', () => {
    const svg = render('streaks');
    expect(svg).toMatch(/<svg [^>]*width="400" height="195"/);
    expect(svg).toContain('STREAKS');
    expect(svg).toContain('Longest streak');
  });
});

describe('about', () => {
  it('reads its text from the settings, keeping the order of the facts', () => {
    const c = parseConfig('cards: [about]\nabout:\n  headline: Hello\n  lines: [One, Two]\n  facts: { Focus: Tools, Stack: Rust }\n');
    expect(c.cards.about.headline).toBe('Hello');
    expect(c.cards.about.lines).toEqual(['One', 'Two']);
    expect(Object.keys(c.cards.about.facts)).toEqual(['Focus', 'Stack']);
    expect(() => parseConfig('about:\n  facts: { Focus: 3 }\n')).toThrow('"about.facts" must be a mapping of label to text');
  });

  it('shows the headline, the lines and the facts on a 400 by 195 card', () => {
    const svg = render('about', (c) => { c.cards.about.headline = 'Hello'; c.cards.about.lines = ['Line one']; c.cards.about.facts = { Focus: 'Tools' }; });
    for (const text of ['Hello', 'Line one', 'FOCUS', 'Tools']) expect(svg).toContain(text);
    expect(svg).toMatch(/<svg [^>]*width="400" height="195"/);
  });

  it('scrolls the lines and facts that don\'t fit a page at a time, the headline staying', () => {
    const many = (c: Config) => { c.cards.about.headline = 'Hi'; c.cards.about.lines = ['1', '2', '3', '4', '5', '6', '7']; };
    const svg = render('about', many);
    expect(svg).toContain('>7<');
    // 4 rows in view under a headline: two pages, the second moved up so it's full (rows 4-7)
    expect(svg).toMatch(/@keyframes scroll \{ 0.00%, [\d.]+% \{ transform: translateY\(-0px\); \} [\d.]+%, [\d.]+% \{ transform: translateY\(-66px\); \} 100%/);
    expect(svg).toMatch(/<desc[^>]*>Hi 1 2 3 4 5 6 7</);
    expect(render('about', (c) => { c.cards.about.lines = ['1', '2', '3']; })).not.toContain('@keyframes scroll');
    expect(render('about', (c) => { many(c); c.look.animations = false; })).not.toContain('class="scroll"');
  });

  it('escapes the text, and says so when empty', () => {
    expect(render('about', (c) => (c.cards.about.lines = ['a <b> & c']))).toContain('a &#60;b&#62; &#38; c');
    const empty = render('about');
    expect(empty).toContain('Nothing here yet');
    expect(empty).not.toMatch(/NaN|undefined|null|Infinity/);
  });
});

describe('the new cards', () => {
  it('are off unless listed', () => {
    expect(CARDS).toEqual(expect.arrayContaining(['streaks', 'about']));
    expect(DEFAULT_CONFIG.show).toEqual(['summary', 'languages', 'contributions', 'weekly']);
    expect(Object.keys(renderAll(compute(fixture(), DEFAULT_CONFIG), DEFAULT_CONFIG))).not.toContain('streaks-light.svg');
  });

  it('come as dot-matrix displays with the oled style, the shape of the others', () => {
    const c = parseConfig('style: oled\ncards: [summary, streaks, about]\nabout:\n  headline: Hi\n  lines: [One line]\n  facts: { Focus: Tools }\n');
    const files = renderAll(compute(fixture(), c), c);
    for (const card of ['streaks', 'about']) {
      const svg = files[`${card}-light.svg`];
      expect(svg).toMatch(/<svg [^>]*width="450" height="219"/);
      expect(svg).not.toContain('<text'); // drawn in dots, not set in a font
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(files['streaks-light.svg']).toContain('Longest streak: 6 days');
    expect(files['about-light.svg']).toContain('Hi One line Focus: Tools');
    expect(files['about-light.svg']).toContain('@keyframes'); // the slides take turns
  });
});

describe('the oled about card', () => {
  it('wraps a long line by words, and cuts a word too long for a line', () => {
    expect(wrap('ONE TWO THREE', 30)).toEqual(['ONE', 'TWO', 'THREE']);
    expect(wrap('ONE TWO', 100)).toEqual(['ONE TWO']);
    expect(wrap('ABCDEFGHIJKLMNOP', 30)[0].length).toBeLessThan(16);
  });

  it('draws the marks people write, and says so when empty', () => {
    for (const ch of [...'&@#";=:\'']) expect(textCells(ch, 0, 0)).not.toEqual(textCells('?', 0, 0));
    const c = parseConfig('style: oled\ncards: [about]\n');
    expect(renderAll(compute(fixture(), c), c)['about-dark.svg']).toContain('Nothing here yet');
  });

  it('sweeps the headline shine right off the card, so none of it stays over the text', () => {
    const c = parseConfig('style: oled\ncards: [about]\nabout:\n  headline: HI I AM PEDRO\n  lines: [one]\n');
    const svg = renderAll(compute(fixture(), c), c)['about-dark.svg'];
    const ends = [...svg.matchAll(/100\.000% \{ transform: translateX\((-?[\d.]+)px\) skewX\(-25deg\)/g)].map((m) => Number(m[1]));
    expect(ends.length).toBeGreaterThan(0);
    // The band leans back by tan(25°) of the card's 219px height: its foot must be past the 450px card too.
    for (const x of ends) expect(x - 219 * Math.tan((25 * Math.PI) / 180)).toBeGreaterThanOrEqual(450);
  });
});
