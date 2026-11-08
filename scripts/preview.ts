// Every card in every look in preview/*.yml, light and dark, on one page, to compare after a change:
//   npm run preview           ->  out/preview/index.html, from made-up data that's the same every run
//   npm run preview -- --real ->  the same from .cache/snapshot.json (your own data, from npm run dev)
// The made-up data is the tests' fixture with a year of daily contributions added, so the
// calendar cards have something to show.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { compute } from '../src/compute.ts';
import { CARDS, loadConfig } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import type { Snapshot } from '../src/types.ts';
import { fixture } from '../tests/fixtures/snapshot.ts';

/** A year of days to 2026-11-04, the fixture's date: busier on weekdays, with quiet spells, the same every run. */
function calendar(): Snapshot['calendar'] {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const end = Date.parse('2026-11-04T00:00:00Z');
  return Array.from({ length: 365 }, (_, i) => {
    const time = end - (364 - i) * 864e5;
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    const quiet = rand() < (weekday >= 5 ? 0.35 : 0.12) || (i > 200 && i < 215); // the odd day off, and a holiday
    const count = quiet ? 0 : Math.round(rand() ** 2 * (weekday >= 5 ? 25 : 40)) + 1;
    return { date: new Date(time).toISOString().slice(0, 10), count };
  });
}

const real = process.argv.includes('--real');
const snapshot: Snapshot = real ? JSON.parse(readFileSync('.cache/snapshot.json', 'utf8')) : { ...fixture(), calendar: calendar() };
const looks = readdirSync('preview').filter((f) => f.endsWith('.yml')).sort();

rmSync('out/preview', { recursive: true, force: true });
const sections: string[] = [];
for (const file of looks) {
  const name = file.replace(/\.yml$/, '');
  const config = loadConfig(`preview/${file}`);
  const files = renderAll(compute(snapshot, config), config);
  mkdirSync(`out/preview/${name}`, { recursive: true });
  for (const [path, svg] of Object.entries(files)) writeFileSync(`out/preview/${name}/${path}`, svg);
  const cards = CARDS.filter((card) => files[`${card}-light.svg`]);
  const side = (mode: 'light' | 'dark') =>
    `<div class="${mode}">${cards.map((card) => `<img src="${name}/${card}-${mode}.svg" width="400" alt="${card}">`).join('')}</div>`;
  sections.push(`<h2>${name}</h2>\n<div class="pair">${side('light')}${side('dark')}</div>`);
}

writeFileSync(
  'out/preview/index.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Card preview</title>
<style>
  body { margin: 0; padding: 16px; font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f8fa; color: #1f2328; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  .pair { display: flex; flex-wrap: wrap; gap: 12px; }
  .pair > div { flex: 1 1 820px; display: flex; flex-wrap: wrap; gap: 10px; padding: 16px; border-radius: 8px; }
  img { max-width: 100%; }
  .light { background: #ffffff; }
  .dark { background: #0d1117; }
</style>
</head>
<body>
<p>${real ? 'From .cache/snapshot.json' : 'From made-up data'}; press r to play the animations again.</p>
${sections.join('\n')}
<script>
  addEventListener('keydown', (e) => {
    if (e.key === 'r') document.querySelectorAll('img').forEach((i) => (i.src = i.src.split('?')[0] + '?' + Date.now()));
  });
</script>
</body>
</html>
`,
);
console.log(`Wrote ${looks.length} looks to out/preview/index.html`);
