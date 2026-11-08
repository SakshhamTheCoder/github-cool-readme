import { describe, expect, it } from 'vitest';
import { compute } from '../src/compute.ts';
import { COLORS, DEFAULT_CONFIG, parseConfig, type Config } from '../src/config.ts';
import { cellsPath, dotsPath, look, ringCells } from '../src/display/dmd.ts';
import { textCells, textWidth } from '../src/display/font.ts';
import { rasterize } from '../src/display/raster.ts';
import { renderDisplayContributions } from '../src/display/contributions.ts';
import { slideshow } from '../src/display/slides.ts';
import { cardWidths, renderAll } from '../src/render/index.ts';
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

const display = (patch: (c: Config) => void = () => {}) => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.look.style = 'dotmatrix';
  c.look.color = 'amber';
  patch(c);
  return renderAll(compute(fixture(), c), c);
};

describe('dot font', () => {
  it('measures and draws text on the grid', () => {
    expect(textWidth('A')).toBe(5);
    expect(textWidth('AB')).toBe(11); // 5 + 1 space + 5
    expect(textWidth('1.5')).toBe(5 + 1 + 2 + 1 + 5); // the dot is narrower
    expect(textCells('I', 0, 0)).toHaveLength(11); // 3 on top, 5 down the middle, 3 at the bottom
    expect(textCells('I', 0, 0, 2)).toHaveLength(44); // each dot becomes 2 x 2 cells
  });

  it('is uppercase, and falls back to ? for unknown characters', () => {
    expect(textCells('a', 0, 0)).toEqual(textCells('A', 0, 0));
    expect(textCells('€', 0, 0)).toEqual(textCells('?', 0, 0));
  });
});

describe('grid', () => {
  it('merges neighbouring cells in a row into one rectangle', () => {
    expect(cellsPath([[0, 0], [1, 0], [2, 0], [5, 1]])).toBe('M0 0h9v3h-9zM15 3h3v3h-3z');
  });

  it('draws LEDs as dotted lines along the longer side of each block', () => {
    const bar: [number, number][] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 2; c++) bar.push([c, r]); // 2 wide, 10 tall: two columns
    expect(dotsPath(bar)).toBe('M1.5 1.5v28.5M4.5 1.5v28.5'); // half a cell past the last dot
    expect(dotsPath([[3, 0]])).toBe('M10.5 1.5h1.5'); // a lone dot is a short line too
  });

  it('draws a block of cells as one rectangle, so bars have no seams', () => {
    const bar: [number, number][] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 4; c++) bar.push([c, r]);
    expect(cellsPath(bar)).toBe('M0 0h12v30h-12z');
    // Rows that differ stay separate, and a run that stops and starts again is two rectangles.
    expect(cellsPath([[0, 0], [1, 0], [0, 1], [0, 3], [1, 3]])).toBe('M0 0h6v3h-6zM0 3h3v3h-3zM0 9h6v3h-6z');
  });

  it('draws a ring of cells', () => {
    const ring = ringCells(10.5, 10.5, 8, 2);
    expect(ring.length).toBeGreaterThan(50);
    for (const [c, r] of ring) expect(Math.hypot(c + 0.5 - 10.5, r + 0.5 - 10.5)).toBeLessThanOrEqual(8);
  });
});

describe('shapes as dots', () => {
  it('fills a square completely', () => {
    expect(rasterize('M0 0H24V24H0Z', 24, 6, 0, 0)).toHaveLength(36);
  });

  it('follows arcs and curves, and leaves holes empty', () => {
    // A circle (two arcs) with a smaller circle cut out of it, drawn the other way round.
    const ring = 'M12 0a12 12 0 1 1 0 24a12 12 0 1 1 0-24ZM12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z';
    const cells = new Set(rasterize(ring, 24, 24, 0, 0).map(([c, r]) => `${c},${r}`));
    expect(cells.has('12,2')).toBe(true); // in the band
    expect(cells.has('12,12')).toBe(false); // in the hole
    expect(cells.has('0,0')).toBe(false); // outside the circle
    expect(cells.size).toBeGreaterThan(Math.PI * (144 - 36) * 0.9);
  });
});

describe('slideshow', () => {
  const style = look('amber', 'dark');
  const slides = [1, 2, 3].map((n) => [{ text: `S${n}`, col: 0, row: 0 }]);

  it('hides every slide but the last at the end of the loop', () => {
    const { css, total } = slideshow('x', slides, { col: 0, row: 0, cols: 50, rows: 20 }, style, ['push', 'wipe']);
    expect(total).toBeCloseTo(3 * 3.6);
    for (const i of [0, 1]) expect(css).toMatch(new RegExp(`@keyframes xs${i} \\{.*100\\.000% \\{ opacity: 0;`));
  });

  it('uses only the effects it is given', () => {
    const { css } = slideshow('x', slides, { col: 0, row: 0, cols: 50, rows: 20 }, style, ['push']);
    expect(css).not.toMatch(/xsp|xwi|xt\d/);
    expect(css).toContain('translateY(60px)'); // pushes up by the region height
  });

  it('shows a single slide still', () => {
    expect(slideshow('x', slides.slice(0, 1), { col: 0, row: 0, cols: 50, rows: 20 }, style).css).toBe('');
  });
});

describe('oled cards', () => {
  it('writes the same files as the classic cards, all one size', () => {
    const files = display();
    expect(Object.keys(files).sort()).toEqual(Object.keys(renderAll(compute(fixture(), DEFAULT_CONFIG), DEFAULT_CONFIG)).sort());
    for (const [name, svg] of Object.entries(files)) {
      expect(svg, name).toMatch(/<svg [^>]*width="450" height="219"/);
      expect(svg, name).not.toMatch(/NaN|undefined|Infinity/);
      assertWellFormed(svg);
    }
  });

  it('draws every look', () => {
    for (const color of COLORS) {
      for (const dots of [true, false]) {
        const files = display((c) => { c.look.color = color; c.look.style = dots ? 'dotmatrix' : 'oled'; });
        // LEDs are real circles (round-capped dashes), never a mask or a filter: Safari blurs those.
        expect(files['summary-dark.svg'].includes('stroke-dasharray="0 3"')).toBe(dots);
        expect(files['summary-dark.svg']).not.toMatch(/mask="url\(#dots\)"|filter=/);
      }
    }
    // On their dark panel, amber and green look the same on both themes; the github colours follow the viewer's.
    const amber = display((c) => (c.look.background = 'solid'));
    expect(amber['summary-light.svg']).toBe(amber['summary-dark.svg']);
    const github = display((c) => (c.look.color = 'github'));
    expect(github['summary-light.svg']).not.toBe(github['summary-dark.svg']);
    // Without the panel (the default), amber and green are darker on a light page, and the same as ever on a dark one.
    const clear = display();
    expect(clear['summary-light.svg']).toContain('#b35c00');
    expect(clear['summary-dark.svg']).toContain('#ffab1a');
    const green = display((c) => (c.look.color = 'green'));
    expect(green['summary-light.svg']).toContain('#1a7f37');
    expect(green['summary-dark.svg']).toContain('#3dff74');
  });

  it('can show the GitHub mark in the ring', () => {
    const percent = display()['summary-dark.svg'];
    const logo = display((c) => (c.cards.summary.ring = 'github'))['summary-dark.svg'];
    expect(logo).not.toBe(percent);
    expect(logo).toContain('Active on 60% of the last 12 months.'); // the description still has the number
    assertWellFormed(logo);
  });

  it('is transparent by default, or on its dark panel, or on a colour of your own', () => {
    const clear = display()['summary-dark.svg'];
    const panel = display((c) => (c.look.background = 'solid'))['summary-dark.svg'];
    expect(panel).toContain('fill="#0d0b07"'); // the amber panel
    expect(clear).not.toContain('fill="#0d0b07"');
    expect(clear).toContain('stroke-dasharray="0 3"'); // still LEDs, now on whatever is behind
    // A colour is the same for every viewer, with the shades that suit it.
    const dark = display((c) => ((c.look.color = 'github'), (c.look.background = '#030506')));
    expect(dark['summary-light.svg']).toBe(dark['summary-dark.svg']);
    expect(dark['summary-light.svg']).toContain('fill="#030506"');
    expect(dark['summary-light.svg']).toContain('#f0f6fc'); // github's light text, as on a dark page
    const light = display((c) => (c.look.background = '#fff8e7'))['summary-dark.svg'];
    expect(light).toContain('#b35c00'); // the darker amber
  });

  it('drops every animation when they are off', () => {
    for (const svg of Object.values(display((c) => (c.look.animations = false)))) expect(svg).not.toContain('@keyframes');
  });

  it('keeps the data in the description for screen readers', () => {
    const files = display();
    expect(files['summary-light.svg']).toContain('COMMITS: 160 in the last 12 months, 350 in total.');
    expect(files['weekly-light.svg']).toContain('Mon 4, Tue 5');
  });

  it('shows an empty contributions card', () => {
    expect(renderDisplayContributions([], 'Notable contributions', { look: look('green', 'dark'), dots: true, animations: true, background: null })).toContain('No contributions');
  });

  it('is shown at 400 wide so two fit a row', () => {
    expect(Object.values(cardWidths({ ...DEFAULT_CONFIG, look: { ...DEFAULT_CONFIG.look, style: 'oled' } }))).toEqual([400, 400, 400, 400, 400, 400]);
  });
});

describe('settings', () => {
  it('draws the displays square or round, by style', () => {
    const files = (style: string) => {
      const c = parseConfig(`look:\n  style: ${style}\n  color: green\n`);
      return renderAll(compute(fixture(), c), c)['summary-dark.svg'];
    };
    expect(files('dotmatrix')).toContain('stroke-dasharray="0 3"'); // round LEDs
    expect(files('oled')).not.toContain('stroke-dasharray="0 3"'); // square pixels
    expect(files('oled')).toContain('#3dff74');
  });

  it('has every colour, each with its own shades, in every style', () => {
    for (const color of COLORS) {
      for (const style of ['classic', 'dotmatrix'] as const) {
        const c = parseConfig(`show: [summary, weekly, streaks]\nlook:\n  style: ${style}\n  color: ${color}\n`);
        const files = renderAll(compute(fixture(), c), c);
        for (const svg of Object.values(files)) assertWellFormed(svg);
        const plain = parseConfig(`show: [summary, weekly]\nlook:\n  style: ${style}\n`);
        const github = renderAll(compute(fixture(), plain), plain);
        const both = (f: Record<string, string>) => f['summary-light.svg'] + f['weekly-light.svg'];
        if (color !== 'github') expect(both(files), `${style} ${color}`).not.toBe(both(github));
      }
    }
    // A display colour is darker on a light page without its panel, readable on white.
    const red = parseConfig('look:\n  style: dotmatrix\n  color: red\n');
    expect(renderAll(compute(fixture(), red), red)['summary-light.svg']).toContain('#cf222e');
    expect(renderAll(compute(fixture(), red), red)['summary-dark.svg']).toContain('#ff4d4d');
  });

  it('colours every style github by default, and the classic cards when asked', () => {
    expect(parseConfig('').look.color).toBe('github');
    expect(parseConfig('look:\n  style: dotmatrix\n').look.color).toBe('github');
    const amber = parseConfig('show: [summary, weekly, streaks]\nlook:\n  color: amber\n');
    const files = renderAll(compute(fixture(), amber), amber);
    expect(files['summary-light.svg']).toContain('stroke="#e08a00"'); // the ring
    expect(files['summary-dark.svg']).toContain('stroke="#ffab1a"');
    expect(files['weekly-dark.svg']).toMatch(/#ffab1a|#d98a00|#8f5200|#5c3300/); // the bars
    expect(files['streaks-light.svg']).toContain('fill: #b35c00;'); // the highlighted number
    expect(files['summary-light.svg']).not.toContain('#0969da'); // no GitHub blue left
  });
});
