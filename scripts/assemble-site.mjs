// Puts the landing page and the docs into one directory for GitHub Pages:
//
//   node scripts/assemble-site.mjs [out]      (default: _site)
//
// site/ goes to the root (404.html included: Pages serves it for every missing path), and the
// built docs (docs-site/dist, from `npm run build` in docs-site/) go under docs/. On the copy
// of the landing page, never on site/ itself:
// - the data-uptide slots (version, packs) are filled from the uptide-dev/uptide checkout the
//   docs build made, cross-checked against its README (scripts/landing-data.mjs);
// - every <pre data-source> block must match its public source in that checkout.
// The %SITE_URL% placeholders are written in by the Pages workflow afterwards.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSources, fill, readPacks, readVersion, slots } from './landing-data.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(process.argv[2] ?? join(root, '_site'));
const docs = join(root, 'docs-site', 'dist');
const sourceFile = join(root, 'docs-site', 'src', 'generated', 'source.json');

if (!existsSync(join(docs, 'index.html')) || !existsSync(sourceFile))
  throw new Error('docs-site/dist or its source.json not found: run `npm run build` in docs-site/ first');

const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
const checkout = resolve(root, 'docs-site', source.checkout);

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'site'), out, { recursive: true, dereference: true });
cpSync(docs, join(out, 'docs'), { recursive: true, dereference: true });

const page = join(out, 'index.html');
const html = readFileSync(page, 'utf8');
const problems = checkSources(html, checkout);
if (problems.length) {
  console.error(`site/index.html no longer matches uptide-dev/uptide@${source.sha.slice(0, 7)}:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const packs = readPacks(checkout);
const version = readVersion(checkout);
writeFileSync(page, fill(html, slots({ version, packs })));

console.log(
  `site: ${out} (landing at /, docs at /docs/), uptide ${version} @ ${source.sha.slice(0, 7)}: ` +
    `${packs.filter((p) => p.status === 'verified').length} verified packs (${packs.map((p) => p.package).join(', ')})`,
);
