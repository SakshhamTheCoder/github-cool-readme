// Preview of the OLED cards: every look, laid out like a profile README.
//   npm run preview:oled   ->  out/display/index.html (from .cache/snapshot.json)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compute } from '../src/compute.ts';
import { loadConfig } from '../src/config.ts';
import { renderDisplayContributions } from '../src/display/contributions.ts';
import { look, type Color, type Mode, type Style } from '../src/display/dmd.ts';
import { renderDisplayLanguages } from '../src/display/languages.ts';
import { renderDisplaySummary } from '../src/display/summary.ts';
import { renderDisplayWeekly } from '../src/display/weekly.ts';

const config = loadConfig('examples/cool-readme.yml');
const model = compute(JSON.parse(readFileSync('.cache/snapshot.json', 'utf8')), config);
mkdirSync('out/display', { recursive: true });

const looks: { color: Color; dots: boolean }[] = [];
for (const color of ['amber', 'green', 'github'] as Color[]) for (const dots of [true, false]) looks.push({ color, dots });

const block = (mode: Mode, color: Color, dots: boolean) => {
  const l: Style = { look: look(color, mode, true), dots, animations: true, background: look(color, mode, true).panel };
  const tag = `${color}-${dots ? 'dots' : 'pixels'}-${mode}`;
  const cards: [string, string, number][] = [
    ['summary', renderDisplaySummary(model.summary, l), 400],
    ['languages', renderDisplayLanguages(model.languages, config.cards.languages.title, l), 400],
    ['contributions', renderDisplayContributions(model.contributions, config.cards.contributions.title, l), 400],
    ['weekly', renderDisplayWeekly(model.weekly, config.cards.weekly.title, l), 400],
  ];
  const img = ([name, svg, width]: [string, string, number]) => {
    writeFileSync(`out/display/${name}-${tag}.svg`, svg);
    return `<img src="${name}-${tag}.svg" width="${width}">`;
  };
  return `<h3>${color}, ${dots ? 'matrix' : 'no matrix'}</h3>
<p align="center">${img(cards[0])} ${img(cards[1])}</p>
<p align="center">${img(cards[2])} ${img(cards[3])}</p>`;
};

const section = (mode: Mode) => looks.map(({ color, dots }) => block(mode, color, dots)).join('\n');

writeFileSync(
  'out/display/index.html',
  `<!doctype html><meta charset="utf-8"><title>OLED cards</title>
<style>
  body { margin: 0; font: 13px -apple-system, 'Segoe UI', sans-serif; }
  section { padding: 8px 16px 24px; } .readme { max-width: 830px; margin: 0 auto; }
  .light { background: #fff; color: #59636e; } .dark { background: #0d1117; color: #9198a1; }
  h3 { font-weight: 600; margin: 20px 0 4px; } img { max-width: 100%; }
</style>
<section class="light"><div class="readme">${section('light')}</div></section>
<section class="dark"><div class="readme">${section('dark')}</div></section>`,
);
console.log('Wrote out/display/index.html');
