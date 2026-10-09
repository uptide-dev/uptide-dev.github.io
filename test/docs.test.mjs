// The docs site's invariants: exact dependency versions, nothing from uptide-dev/uptide
// committed here, and the build-time transforms (titles, sidebar, links) doing what
// docs-site/README.md says. Runs without installing docs-site's dependencies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { plain, readBody, slugOf, splitFrontMatter } from '../docs-site/scripts/fetch-docs.mjs';
import remarkUptideLinks from '../docs-site/src/remark-uptide-links.mjs';
import { readSections } from '../docs-site/src/sidebar.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('every docs-site dependency is pinned to an exact version, with a lockfile', () => {
  const pkg = JSON.parse(read('docs-site/package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ['astro', '@astrojs/starlight', '@astrojs/markdown-remark']) assert.ok(deps[name], name);
  for (const [name, version] of Object.entries(deps)) assert.match(version, /^\d+\.\d+\.\d+$/, `${name}@${version}`);
  const lock = JSON.parse(read('docs-site/package-lock.json'));
  for (const [name, version] of Object.entries(deps))
    assert.equal(lock.packages[`node_modules/${name}`].version, version, name);
  assert.match(read('docs-site/.npmrc'), /^save-exact=true$/m);
});

test('the docs are fetched at build time, never committed here', () => {
  const ignore = read('docs-site/.gitignore');
  for (const path of ['.cache/', 'src/content/docs/', 'src/generated/']) assert.match(ignore, new RegExp(`^${path}$`, 'm'));
  const tracked = execFileSync('git', ['ls-files', 'docs-site'], { cwd: fileURLToPath(root), encoding: 'utf8' });
  assert.doesNotMatch(tracked, /docs-site\/(src\/content\/docs|src\/generated|\.cache)\//);
  assert.match(read('docs-site/package.json'), /"build": "npm run fetch-docs && astro build"/);
});

test('a page keeps its front matter title and description; a page without them takes the heading and first paragraph', () => {
  const page = '---\ntitle: uptide fix\ndescription: Upgrade one dependency.\n---\n\n# `uptide fix`\n\nIntro.\n';
  assert.deepEqual(splitFrontMatter(page).data, 'title: uptide fix\ndescription: Upgrade one dependency.');

  const record = readBody('# 0002: Never install\n\nStatus: accepted (2026-09-27)\n\n## Context\n\nThe engine needs a [package](x.md)\'s `.d.ts` files.\n');
  assert.equal(record.title, '0002: Never install');
  assert.equal(record.description, "The engine needs a package's .d.ts files.");
  assert.doesNotMatch(record.body, /^# /m, 'the h1 is dropped: Starlight renders the title');

  const fenced = readBody('```sh\n# not a heading\n```\n\n# Title\n');
  assert.equal(fenced.title, 'Title');
  assert.match(fenced.body, /# not a heading/);
  assert.equal(plain('**Bold** and _em_ and [a link](b.md)'), 'Bold and em and a link');
});

test('slugs follow docs/ paths, with README.md as the index', () => {
  assert.equal(slugOf('README.md'), '');
  assert.equal(slugOf('commands/fix.md'), 'commands/fix');
  assert.equal(slugOf('decisions/0001-ts-morph-over-compiler-api.md'), 'decisions/0001-ts-morph-over-compiler-api');
});

test('the sidebar sections come from the README tables, in order', () => {
  const readme = [
    '# Uptide documentation',
    '## Using Uptide',
    '| Page | What it answers |',
    '| --- | --- |',
    '| [Getting started](getting-started.md) | Run it |',
    '| [`uptide fix`](commands/fix.md) | Fix it |',
    '## Contributing and internals',
    '| [Contributing](../CONTRIBUTING.md) | Setup |',
    '| [Decisions](decisions/) | Why |',
  ].join('\n');
  const sections = readSections(readme);
  assert.deepEqual([...sections.keys()], ['Using Uptide', 'Contributing and internals']);
  assert.deepEqual(sections.get('Using Uptide'), [
    { label: 'Getting started', target: 'getting-started.md' },
    { label: 'uptide fix', target: 'commands/fix.md' },
  ]);
  assert.deepEqual(sections.get('Contributing and internals').map((i) => i.target), ['../CONTRIBUTING.md', 'decisions/']);
});

test('links to docs pages stay on the site; links to anything else in the repository go to GitHub', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'uptide-'));
  mkdirSync(join(checkout, 'docs/decisions'), { recursive: true });
  mkdirSync(join(checkout, 'fixtures/repos/storefront'), { recursive: true });
  const source = {
    repo: 'https://github.com/uptide-dev/uptide',
    ref: 'main',
    checkout,
    pages: { 'docs/README.md': '', 'docs/concepts.md': 'concepts', 'docs/commands/fix.md': 'commands/fix' },
  };
  const tree = {
    type: 'root',
    children: [
      ['../concepts.md#exit-codes', '/docs/concepts/#exit-codes'],
      ['../README.md', '/docs/'],
      ['fix.md', '/docs/commands/fix/'],
      ['../../CONTRIBUTING.md#write-a-pack', 'https://github.com/uptide-dev/uptide/blob/main/CONTRIBUTING.md#write-a-pack'],
      ['../decisions/', 'https://github.com/uptide-dev/uptide/tree/main/docs/decisions'],
      ['../../fixtures/repos/storefront', 'https://github.com/uptide-dev/uptide/tree/main/fixtures/repos/storefront'],
      ['../../packs/queue.json', 'https://github.com/uptide-dev/uptide/blob/main/packs/queue.json'],
      ['#local', '#local'],
      ['https://example.com/a.md', 'https://example.com/a.md'],
    ].map(([url, expected]) => ({ type: 'link', url, expected, children: [] })),
  };
  const contentFile = fileURLToPath(new URL('docs-site/src/content/docs/commands/fix.md', root));
  remarkUptideLinks({ base: '/docs', source })(tree, { path: contentFile });
  for (const link of tree.children) assert.equal(link.url, link.expected);
});
