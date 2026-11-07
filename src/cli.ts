import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { collect } from './collect.ts';
import { compute } from './compute.ts';
import { ConfigError, DEFAULT_CONFIG, loadConfig, usesOldLayout } from './config.ts';
import { createClient } from './github.ts';
import { previewHtml } from './preview.ts';
import { cardWidths, renderAll } from './render/index.ts';
import type { Snapshot } from './types.ts';

const HELP = `Usage: node src/cli.ts [options]

  --config <file>         Settings (default: cool-readme.yml; optional)
  --out <dir>             Where to write the SVGs (default: stats)
  --snapshot <file>       Also save the raw GitHub data. It names private repos: keep it private.
  --from-snapshot <file>  Render from saved data instead of calling GitHub
  --preview               Also write preview.html next to the SVGs

The token is read from GITHUB_TOKEN or GH_TOKEN. It needs the "repo", "read:org" and
"read:user" scopes to count private and organization work.`;

const log = (msg: string) => console.error(msg);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      out: { type: 'string', default: 'stats' },
      snapshot: { type: 'string' },
      'from-snapshot': { type: 'string' },
      preview: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }

  let config = DEFAULT_CONFIG;
  if (values.config) config = loadConfig(values.config);
  else {
    try {
      config = loadConfig('cool-readme.yml');
    } catch {
      log('No cool-readme.yml found, using the defaults');
    }
  }

  if (usesOldLayout(config)) {
    log('note: your settings are in the layout from before v1.5. They still work; run setup again to move them to the new one (see the README)');
  }
  if (config.show.length === 0) {
    log('No cards to make: "show" is [], so the cards are off');
    return;
  }

  let snapshot: Snapshot;
  if (values['from-snapshot']) {
    snapshot = JSON.parse(readFileSync(values['from-snapshot'], 'utf8')) as Snapshot;
    log(`Using data from ${values['from-snapshot']} (${snapshot.generatedAt})`);
  } else {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) throw new ConfigError('set GITHUB_TOKEN (or GH_TOKEN) to a token with the repo, read:org and read:user scopes');
    snapshot = await collect(createClient(token, log), config, log);
    if (values.snapshot) {
      mkdirSync(dirname(values.snapshot), { recursive: true });
      writeFileSync(values.snapshot, JSON.stringify(snapshot, null, 2));
      log(`Saved raw data to ${values.snapshot}`);
    }
  }

  if (snapshot.version !== 5) throw new ConfigError('the snapshot was made by an older version; collect it again');

  const model = compute(snapshot, config);
  for (const note of model.notes) log(`note: ${note}`);

  const files = renderAll(model, config);
  mkdirSync(values.out, { recursive: true });
  for (const [name, svg] of Object.entries(files)) writeFileSync(join(values.out, name), svg);
  if (values.preview) writeFileSync(join(values.out, 'preview.html'), previewHtml(Object.keys(files), cardWidths(config)));
  log(`Wrote ${Object.keys(files).length} cards to ${values.out}/`);
}

main().catch((err: unknown) => {
  log(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
