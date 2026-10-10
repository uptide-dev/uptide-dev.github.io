// The page's invariants: fonts travel with their licenses, the page takes its own address
// from the one SITE_URL the Pages workflow writes in, it loads nothing from elsewhere, and
// the workflow publishes it with the docs.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const page = read('site/index.html');
const pages = read('.github/workflows/pages.yml');

test('every font ships next to its OFL license', () => {
  const files = readdirSync(new URL('site/fonts/', root));
  const fonts = files.filter((f) => f.endsWith('.woff2'));
  assert.ok(fonts.length > 0);
  for (const font of fonts) {
    const license = `LICENSE-${font.replace(/-latin-.*$/, '')}.txt`;
    assert.ok(files.includes(license), `${font} has no ${license}`);
    assert.match(read(`site/fonts/${license}`), /SIL Open Font License, Version 1\.1/);
  }
});

test('the canonical and social-preview URLs come from SITE_URL, written in at deploy', () => {
  for (const tag of [
    '<link rel="canonical" href="%SITE_URL%">',
    '<meta property="og:url" content="%SITE_URL%">',
    '<meta property="og:image" content="%SITE_URL%og.png">',
    '<meta name="twitter:image" content="%SITE_URL%og.png">',
  ])
    assert.ok(page.includes(tag), tag);
  assert.doesNotMatch(page, /uptide-dev\.github\.io|raw\.githubusercontent/);
  assert.match(pages, /\n {6}SITE_URL: https:\/\/uptide-dev\.github\.io\/\n/);
  assert.ok(pages.includes('sed -i "s#%SITE_URL%#${SITE_URL}#g" _site/index.html'));
});

test('loads nothing from another origin: fonts, styles, scripts and images are local', () => {
  for (const [tag] of page.matchAll(/<(link|script|img|source)\b[^>]*>/g))
    assert.doesNotMatch(tag, /(src|href)=["']?(https?:)?\/\//, tag);
  assert.doesNotMatch(page, /url\((["']?)(https?:)?\/\//);
});

test('builds landing and docs together and deploys them to Pages', () => {
  assert.ok(pages.includes('run: node scripts/assemble-site.mjs _site'));
  assert.ok(pages.includes('run: node scripts/check-links.mjs _site'));
  assert.match(pages, /uses: actions\/upload-pages-artifact@v3\n {8}with:\n {10}path: _site\n/);
  assert.ok(pages.includes('uses: actions/deploy-pages@v4'));
  // Triggers, permissions and the deploy guard: test/release.test.mjs.
});

test('the landing page links to the docs, in the top bar and the footer', () => {
  assert.equal(page.match(/<a href="\/docs\/">Docs<\/a>/g)?.length, 2);
});
