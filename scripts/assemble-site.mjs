// Puts the landing page and the docs into one directory for GitHub Pages:
//
//   node scripts/assemble-site.mjs [out]      (default: _site)
//
// site/ goes to the root (404.html included: Pages serves it for every missing path), and the
// built docs (docs-site/dist, from `npm run build` in docs-site/) go under docs/. On the copy
// of the landing page, never on site/ itself:
// - the data-uptide slots (version, packs) are filled from the uptide-dev/uptide checkout the
//   docs build made, cross-checked against its README (scripts/landing-data.mjs);
// - every <pre data-source> block must match its public source in that checkout;
// - the landing page and the 404 page get the uptide-version, uptide-ref and uptide-commit
//   meta tags the docs pages already carry.
// The %SITE_URL% placeholders are written in by the Pages workflow afterwards.
//
// In GitHub Actions it also writes step outputs: `release` is true only when the site was built
// from the tag of the latest uptide release on npm, and the Pages workflow deploys nothing else.
import { appendFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSources, fill, readPacks, readVersion, slots } from './landing-data.mjs';
import { deployable, describe, metaTags } from '../docs-site/scripts/release.mjs';

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
if (version !== source.version)
  throw new Error(`the checkout says uptide ${version}, but the docs were built for ${source.version}`);
writeFileSync(page, withMeta(fill(html, slots({ version, packs }))));
const notFound = join(out, '404.html');
writeFileSync(notFound, withMeta(readFileSync(notFound, 'utf8')));

/** The page with the release's meta tags after its charset. */
function withMeta(text) {
  const charset = '<meta charset="utf-8">\n';
  if (!text.includes(charset)) throw new Error('a page has no <meta charset="utf-8"> to put the release tags after');
  return text.replace(charset, `${charset}${metaTags(source).join('\n')}\n`);
}

if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    // `release` last, so nothing before it can override it.
    `version=${source.version}\nref=${source.ref}\nsha=${source.sha}\nrelease=${deployable(source)}\n`,
  );

console.log(`site: ${out} (landing at /, docs at /docs/)`);
console.log(`site: built from ${describe(source)}`);
console.log(
  `site: ${packs.filter((p) => p.status === 'verified').length} verified packs (${packs.map((p) => p.package).join(', ')})`,
);
console.log(`site: deployable: ${deployable(source) ? 'yes' : 'no, not built from the npm release tag'}`);
