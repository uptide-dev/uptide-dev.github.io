// Puts the landing page and the docs into one directory for GitHub Pages:
//
//   node scripts/assemble-site.mjs [out]      (default: _site)
//
// site/ goes to the root as it is, and the built docs (docs-site/dist, from `npm run build`
// in docs-site/) go under docs/. The landing page's %SITE_URL% placeholders are written in by
// the Pages workflow afterwards, on the copy, never on site/ itself.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(process.argv[2] ?? join(root, '_site'));
const docs = join(root, 'docs-site', 'dist');

if (!existsSync(join(docs, 'index.html')))
  throw new Error('docs-site/dist/index.html not found: run `npm run build` in docs-site/ first');

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'site'), out, { recursive: true, dereference: true });
cpSync(docs, join(out, 'docs'), { recursive: true, dereference: true });
console.log(`site: ${out} (landing at /, docs at /docs/)`);
