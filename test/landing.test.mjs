// The landing page's numbers come from uptide-dev/uptide at build time (scripts/landing-data.mjs),
// its 404 page is deployed with it, and its colors match the docs site.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkSources, fill, readPacks, readVersion, slots } from '../scripts/landing-data.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const page = read('site/index.html');
const notFound = read('site/404.html');
/** What a reader sees: the body without terminal blocks, scripts and markup. */
const prose = (html) =>
  html
    .slice(html.indexOf('<body>'))
    .replace(/<(pre|script|svg)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ');

test('light dim is #6A675F everywhere, as on the docs site', () => {
  const files = ['site/index.html', 'site/404.html', 'site/og-image.html', 'docs-site/src/styles/uptide.css'];
  for (const file of files) assert.doesNotMatch(read(file), /#76736B|118,\s*115,\s*107/i, file);
  assert.match(page, /--dim:#6A675F/);
  assert.match(read('docs-site/src/styles/uptide.css'), /--uptide-dim: #6A675F;/);
});

test('the 404 page: wordmark to /, one line, links to / and /docs/, both themes, no em dash', () => {
  assert.match(notFound, /<a class="brand" href="\/"[^>]*>[\s\S]*?uptide\s*<\/a>/);
  assert.match(notFound, /<h1>This page is not here\.<\/h1>/);
  assert.match(notFound, /<a class="btn solid" href="\/">Home<\/a>/);
  assert.match(notFound, /<a class="btn" href="\/docs\/">Docs<\/a>/);
  assert.match(notFound, /@media \(prefers-color-scheme:dark\)/);
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(notFound, /—|&mdash;/);
  // Served at any missing path, so nothing may be relative.
  for (const [, url] of notFound.matchAll(/(?:href|src)=["']([^"']+)["']|url\(([^)]+)\)/g))
    if (url) assert.match(url, /^(\/|https:\/\/)/, url);
  for (const [, url] of notFound.matchAll(/url\(([^)]+)\)/g)) assert.match(url, /^\//, url);
});

test('the deploy copies site/ whole, so 404.html is published at the root', () => {
  assert.ok(readdirSync(new URL('site/', root)).includes('404.html'));
  assert.ok(read('scripts/assemble-site.mjs').includes("cpSync(join(root, 'site'), out, { recursive: true"));
  assert.match(read('.github/workflows/pages.yml'), /path: _site\n/);
});

test('the landing page states no pack number of its own: version and packs are build-time slots', () => {
  for (const slot of ['version', 'packs-heading', 'packs-list', 'packs-rows'])
    assert.match(page, new RegExp(`data-uptide="${slot}"`), slot);
  const text = prose(page);
  assert.doesNotMatch(text, /\d+\s*%/, 'no precision or recall written into the page');
  assert.doesNotMatch(text, /\b(zod|stripe|react|ai)\s+\d+(\.x)?\s*→/, 'no pack range written into the page');
  assert.doesNotMatch(page, /supabase|9d1661d|0\.4\.0/, 'the unpublished list run is gone');
  assert.equal(page.match(/<pre\b/g).length, page.match(/<pre data-source="/g).length, 'every terminal block names its source');
});

/** A minimal uptide checkout: two packs, the README table and one docs page. */
function fakeCheckout({ readmeRecall = '72%' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'uptide-checkout-'));
  const pack = (name, verification, truth) => {
    mkdirSync(join(dir, 'packages/core/src/packs', name), { recursive: true });
    writeFileSync(join(dir, 'packages/core/src/packs', name, 'verification.json'), JSON.stringify(verification));
    writeFileSync(join(dir, 'packages/core/src/packs', name, 'ground-truth.json'), JSON.stringify(truth));
  };
  pack(
    'zod',
    { status: 'verified', repos: 2, breaking: { precision: 1, recall: 0.7151, falsePositives: 0 } },
    { package: 'zod', repos: [{ fixture: 'fixtures/repos/storefront' }, { repo: 'a/one' }, { repo: 'b/two' }] },
  );
  pack(
    'next',
    { status: 'candidate', repos: 1, breaking: { precision: 0.5, recall: 0.25, falsePositives: 1 } },
    { package: 'next', repos: [{ repo: 'c/three' }] },
  );
  mkdirSync(join(dir, 'packages/core/src/packs/tooling'), { recursive: true });
  mkdirSync(join(dir, 'packages/cli'), { recursive: true });
  writeFileSync(join(dir, 'packages/cli/package.json'), JSON.stringify({ name: 'uptide', version: '9.8.7' }));
  writeFileSync(
    join(dir, 'README.md'),
    [
      '# uptide',
      '<!-- packs:start -->',
      '| Package | Range | Precision | Recall | Ground-truth repositories | Status |',
      '| --- | --- | ---: | ---: | --- | --- |',
      '| `next` | 15.x → 16.x | 50% | 25% | c/three | candidate |',
      `| \`zod\` | 3.x → 4.x | 100% | ${readmeRecall} | a/one, b/two | verified |`,
      '<!-- packs:end -->',
    ].join('\n'),
  );
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(
    join(dir, 'docs/run.md'),
    'Text\n\n```console\n$ npx uptide check zod\nzod   28 breaking · 7 files\n  ✗ one   24 sites\n```\n\n```diff\n-a < b\n+a > b\n```\n\nThe statement:\n\nAnalysis runs locally.\nNo account.\n',
  );
  return dir;
}

test('packs come from verification.json and ground truth, in the README order, rounded as the README rounds', () => {
  const checkout = fakeCheckout();
  const packs = readPacks(checkout);
  assert.deepEqual(packs.map((p) => [p.package, p.range, p.status, p.repos]), [
    ['next', '15.x → 16.x', 'candidate', ['c/three']],
    ['zod', '3.x → 4.x', 'verified', ['a/one', 'b/two']],
  ]);
  assert.equal(readVersion(checkout), '9.8.7');
  const values = slots({ version: '9.8.7', packs });
  assert.equal(values['packs-heading'], '1 verified pack', 'candidates are listed, not counted');
  assert.equal(values['packs-list'], '<code>zod</code> 3.x → 4.x.');
  assert.match(values['packs-rows'], /<td><code>zod<\/code><\/td><td>3\.x → 4\.x<\/td><td>100%<\/td><td>72%<\/td>/);
  assert.match(values['packs-rows'], /<a href="https:\/\/github.com\/a\/one">a\/one<\/a>, <a href="https:\/\/github.com\/b\/two">b\/two<\/a>/);
});

test('the build fails when the JSON and the README table disagree', () => {
  assert.throws(() => readPacks(fakeCheckout({ readmeRecall: '71%' })), /zod: recall is "72%" from the JSON but "71%" in the README/);
});

test('every slot is filled, and a slot the page lacks or does not know fails the build', () => {
  const html = '<p data-uptide="a">fallback</p><tbody data-uptide="b">\n<tr><td>x</td></tr>\n</tbody>';
  assert.equal(fill(html, { a: 'A', b: '<tr><td>B</td></tr>' }), '<p data-uptide="a">A</p><tbody data-uptide="b"><tr><td>B</td></tr></tbody>');
  assert.throws(() => fill(html, { a: 'A' }), /no such value/);
  assert.throws(() => fill(html, { a: 'A', b: 'B', c: 'C' }), /no data-uptide slot for: c/);
});

test('a terminal block must match its public source; one changed number fails the build', () => {
  const checkout = fakeCheckout();
  const block = (n) =>
    `<pre data-source="docs/run.md"><span class="a">$</span> npx uptide check zod\n<strong>zod</strong>   ${n} breaking · 7 files</pre>`;
  assert.deepEqual(checkSources(block(28), checkout), []);
  assert.match(checkSources(block(27), checkout).join(), /docs\/run\.md: the page's block starting "\$ npx uptide check zod" is not in it/);
  const diff = '<pre data-source="docs/run.md"><span class="l del">-a &lt; b</span><span class="l add">+a &gt; b</span></pre>';
  assert.deepEqual(checkSources(diff, checkout), []);
  const text = '<pre data-source="docs/run.md" data-match="text">Privacy:\n  Analysis runs locally.\n  No account.</pre>';
  assert.deepEqual(checkSources(text, checkout), []);
  assert.match(checkSources('<pre data-source="docs/nope.md">x</pre>', checkout).join(), /not in the checkout/);
});
