// The README's example cards, in examples/, from the saved data (npm run dev first):
//   npm run examples
// The numbers are your own, with your settings in examples/cool-readme.yml, as the action would show
// them: totals and public projects only. The summary keeps its percentage, as by default, and the
// about card a short version of yours.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { compute } from '../src/compute.ts';
import { CARDS, parseConfig, type Card } from '../src/config.ts';
import { renderAll } from '../src/render/index.ts';
import type { Snapshot } from '../src/types.ts';

const snapshot: Snapshot = JSON.parse(readFileSync('.cache/snapshot.json', 'utf8'));
const base = parse(readFileSync('examples/cool-readme.yml', 'utf8'));
delete base.cards.summary;

// The dot font has no accents.
const about = (style: string) => ({
  headline: "Hi, I'm *Pedro*",
  lines: [
    "I'm a software architect with 20+ years of experience.",
    'Cloud infra, CI/CD and backend, mostly *Java*.',
    'Porting classic games natively, with extras.',
    'I fly airplanes and go wild camping offroad.',
    'I also race go-karts competitively.',
  ],
  facts: { 'Based in': style === 'classic' ? 'Santarém' : 'Santarem', Currently: 'Diving into emulators' },
});

/** Where each look goes, and which of its cards: a folder with light and dark files, or one file each when on a panel. */
const looks: { dir: string; look: Record<string, string>; cards: readonly Card[]; panel?: boolean }[] = [
  { dir: 'cards', look: { style: 'classic' }, cards: ['about', 'languages', 'summary', 'contributions'] },
  { dir: 'cards/amber', look: { style: 'classic', color: 'amber' }, cards: ['weekly', 'streaks'] },
  { dir: 'dotmatrix-cards', look: { style: 'dotmatrix', color: 'amber', background: '0d0b07' }, cards: ['summary', 'languages'], panel: true },
  { dir: 'dotmatrix-cards/github', look: { style: 'dotmatrix' }, cards: ['contributions', 'weekly'] },
  { dir: 'dotmatrix-cards/green', look: { style: 'dotmatrix', color: 'green' }, cards: ['streaks', 'about'] },
  { dir: 'oled-cards', look: { style: 'oled', color: 'purple', background: '0b0710' }, cards: ['summary', 'languages'], panel: true },
];

for (const { dir, look, cards, panel } of looks) {
  const config = parseConfig(stringify({ ...base, show: [...cards], look, cards: { ...base.cards, about: about(look.style) } }));
  const files = renderAll(compute(snapshot, config), config);
  const out = `examples/${dir}`;
  for (const card of CARDS) for (const name of [`${card}.svg`, `${card}-light.svg`, `${card}-dark.svg`]) rmSync(`${out}/${name}`, { force: true });
  mkdirSync(out, { recursive: true });
  for (const card of cards) {
    if (panel) writeFileSync(`${out}/${card}.svg`, files[`${card}-dark.svg`]);
    else for (const mode of ['light', 'dark']) writeFileSync(`${out}/${card}-${mode}.svg`, files[`${card}-${mode}.svg`]);
  }
}
console.log(`Wrote ${looks.length} looks to examples/`);
