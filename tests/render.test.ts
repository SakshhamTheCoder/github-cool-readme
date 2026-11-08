import { describe, expect, it } from 'vitest';
import { compute, weekdayFacts } from '../src/compute.ts';
import { DEFAULT_CONFIG, type Config } from '../src/config.ts';
import { describe as describeItem, pageOffsets, renderContributions } from '../src/render/contributions.ts';
import { renderAll } from '../src/render/index.ts';
import { THEMES, formatCompact, truncate } from '../src/render/svg.ts';
import { fixture } from './fixtures/snapshot.ts';

/** Minimal well-formedness check: every opened tag is closed in order. */
function assertWellFormed(svg: string): void {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) expect(stack.pop(), `closing </${name}>`).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
}

const render = (patch: (c: Config) => void = () => {}) => {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return renderAll(compute(fixture(), c), c);
};

describe('cards', () => {
  it('writes a light and a dark variant of each card', () => {
    expect(Object.keys(render()).sort()).toEqual([
      'contributions-dark.svg', 'contributions-light.svg',
      'languages-dark.svg', 'languages-light.svg',
      'summary-dark.svg', 'summary-light.svg',
      'weekly-dark.svg', 'weekly-light.svg',
    ]);
  });

  it('makes only the cards in the show setting, in every style', () => {
    for (const style of ['classic', 'oled', 'dotmatrix'] as const) {
      const files = render((c) => { c.look.style = style; c.show = ['weekly', 'summary']; });
      expect(Object.keys(files).sort()).toEqual(['summary-dark.svg', 'summary-light.svg', 'weekly-dark.svg', 'weekly-light.svg']);
      // The same cards as when all are made: leaving some out changes nothing in the others.
      const all = render((c) => (c.look.style = style));
      expect(files['summary-dark.svg']).toBe(all['summary-dark.svg']);
    }
  });

  it('produces well-formed SVG with no missing values', () => {
    for (const [name, svg] of Object.entries(render())) {
      assertWellFormed(svg);
      expect(svg, name).not.toMatch(/NaN|undefined|null|Infinity/);
    }
  });

  it('makes the cards one size', () => {
    const size = (svg: string) => svg.match(/<svg [^>]*width="(\d+)" height="(\d+)"/)!.slice(1).join('x');
    const files = render();
    for (const card of ['summary', 'contributions', 'languages', 'weekly']) expect(size(files[`${card}-light.svg`])).toBe('400x195');
  });

  it('shows the summary numbers for the year and all time in turn, or all time without animations', () => {
    const files = render();
    expect(files['summary-light.svg']).toContain('<g class="year"');
    expect(files['summary-light.svg']).toContain('@keyframes all');
    const still = render((c) => { c.look.animations = false; })['summary-light.svg'];
    expect(still).not.toContain('class="year"');
    expect(still).toContain('ALL TIME');
    expect(still).not.toContain('>YEAR<');
  });

  it('scrolls the contributions in a loop when more than 3 are shown', () => {
    const c = structuredClone(DEFAULT_CONFIG);
    const item = (n: number) => ({ repo: `o${n}/r${n}`, owner: `o${n}`, stars: 10 - n, avatar: null, merged: 1, open: 0, lastDate: '2026-01-01T00:00:00Z' });
    const three = renderContributions([1, 2, 3].map(item), THEMES.light, c);
    expect(three).not.toContain('@keyframes scroll');
    const six = renderContributions([1, 2, 3, 4, 5, 6].map(item), THEMES.light, c);
    expect(six).toContain('class="scroll"');
    expect(six).toMatch(/@keyframes scroll \{.*translateY\(-138px\).*100% \{ transform: translateY\(0\); \} \}/);
    assertWellFormed(six);
    c.look.animations = false;
    expect(renderContributions([1, 2, 3, 4, 5, 6].map(item), THEMES.light, c)).not.toContain('class="scroll"');
  });

  it('pages the contributions 3 at a time, with a full last page', () => {
    expect(pageOffsets(3)).toEqual([0]);
    expect(pageOffsets(6)).toEqual([0, 138]);
    expect(pageOffsets(7)).toEqual([0, 138, 184]);
  });

  it('puts card titles on the header line, and hides them with null', () => {
    const files = render();
    expect(files['languages-light.svg']).toContain('>MOST USED LANGUAGES<');
    expect(files['contributions-light.svg']).toContain('>NOTABLE CONTRIBUTIONS<');
    expect(files['weekly-light.svg']).toContain('>WEEKLY RHYTHM<');
    const untitled = render((c) => { c.cards.languages.title = null; c.cards.contributions.title = null; });
    expect(untitled['languages-light.svg']).not.toContain('class="col"');
    expect(untitled['contributions-light.svg']).not.toContain('class="col"');
  });

  it('escapes text', () => {
    const svg = render((c) => (c.cards.summary.title = 'Tom & <Jerry>'))['summary-light.svg'];
    expect(svg).toContain('Tom &#38; &#60;Jerry&#62;');
    assertWellFormed(svg);
  });

  it('puts the numbers in the summary', () => {
    const svg = render()['summary-light.svg'];
    for (const n of ['160', '350', '23', '123', '60%']) expect(svg).toContain(`>${n}<`);
  });

  it('can put the GitHub logo in the ring and the percentage below it', () => {
    const svg = render((c) => (c.cards.summary.ring = 'github'))['summary-dark.svg'];
    expect(svg).toContain('class="logo"');
    expect(svg).toContain('>60% ACTIVE DAYS<');
    expect(svg).not.toContain('>60%<');
    assertWellFormed(svg);
  });

  it('drops all animation when disabled', () => {
    for (const svg of Object.values(render((c) => (c.look.animations = false)))) {
      expect(svg).not.toContain('@keyframes');
      expect(svg).not.toContain('animation-delay');
    }
  });

  it('puts the busiest and quietest day and the weekdays share beside the weekly bars, in every style', () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => ({ day, count: [4, 5, 6, 7, 8, 9, 1][i] }));
    expect(weekdayFacts(days)).toMatchObject({ busiest: { day: 'Sat' }, quietest: { day: 'Sun' }, weekdays: 75 }); // 30 of 40
    expect(weekdayFacts(days.map((d) => ({ ...d, count: 0 }))).weekdays).toBe(0);
    const svg = render()['weekly-light.svg']; // the fixture: Mon 4 to Sat 9, Sun 0
    expect(svg).toContain('>Saturday<');
    expect(svg).toContain('>Busiest day · 9<');
    expect(svg).toContain('>On weekdays<');
    for (const style of ['oled', 'dotmatrix'] as const) {
      const display = render((c) => (c.look.style = style))['weekly-dark.svg'];
      expect(display).toContain('Busiest: Sat.');
      assertWellFormed(display);
    }
  });

  it('renders empty states', () => {
    const c = structuredClone(DEFAULT_CONFIG);
    const model = compute({ ...fixture(), allTime: [], pullRequests: [] }, c);
    const files = renderAll(model, c);
    expect(files['languages-light.svg']).toContain('No language data yet');
    expect(files['contributions-light.svg']).toContain('No contributions to other projects yet');
    const quiet = renderAll(compute({ ...fixture(), calendar: [] }, c), c);
    expect(quiet['weekly-light.svg']).toContain('No contributions in the last 12 months');
  });
});

describe('formatting', () => {
  it('describes a contribution', () => {
    const base = { repo: 'a/b', owner: 'a', stars: 1, avatar: null, merged: 0, open: 0, lastDate: '2026-09-10T00:00:00Z' };
    expect(describeItem({ ...base, merged: 1 })).toBe('1 PR merged · Sep 2026');
    expect(describeItem({ ...base, merged: 3, open: 1 })).toBe('3 PRs merged, 1 open · Sep 2026');
    expect(describeItem({ ...base, open: 2 })).toBe('2 PRs open · Sep 2026');
  });

  it('shortens numbers and names', () => {
    expect([999, 1000, 1834, 27570, 1_250_000].map(formatCompact)).toEqual(['999', '1k', '1.8k', '28k', '1.3M']);
    expect(truncate('short', 100, 13)).toBe('short');
    expect(truncate('a-really-long-repository-name', 80, 13)).toMatch(/…$/);
  });
});
