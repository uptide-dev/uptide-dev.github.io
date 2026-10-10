// The site is built from the latest uptide release on npm, checked out as its tag, and only that
// build is ever deployed (docs-site/scripts/release.mjs, .github/workflows/pages.yml).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  deployable,
  findTag,
  latestVersion,
  metaTags,
  resolveSource,
  tagFor,
} from '../docs-site/scripts/release.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pages = read('.github/workflows/pages.yml');

/** A fetch that answers one URL with `body` and records what it was asked. */
function npm(body, { status = 200, json = true } = {}) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (json ? body : JSON.parse('not json')),
    };
  };
  return { fetch, calls };
}

/** `git ls-remote --tags` output for a repository with these tags. */
const remote = (tags) => (repoUrl, ref) =>
  tags
    .flatMap((t) => [`${'a'.repeat(40)}\trefs/tags/${t}`, `${'b'.repeat(40)}\trefs/tags/${t}^{}`])
    .filter((line) => line.split('\t')[1].startsWith(ref))
    .join('\n');

test('the version is npm\'s latest dist-tag of uptide', async () => {
  const { fetch, calls } = npm({ latest: '0.6.1', next: '0.6.2-next.1' });
  assert.equal(await latestVersion({ fetch }), '0.6.1');
  assert.deepEqual(calls, ['https://registry.npmjs.org/-/package/uptide/dist-tags']);
  assert.equal(await latestVersion({ fetch, registry: 'https://npm.example/' }), '0.6.1');
  assert.equal(calls[1], 'https://npm.example/-/package/uptide/dist-tags');
});

test('an npm answer the build cannot trust fails it', async () => {
  await assert.rejects(latestVersion(npm({}, { status: 503 })), /answered 503; cannot tell which uptide release to build/);
  await assert.rejects(latestVersion(npm({}, { json: false })), /did not answer JSON/);
  await assert.rejects(latestVersion(npm({ next: '1.0.0' })), /no usable "latest" dist-tag \(got undefined\)/);
  await assert.rejects(latestVersion(npm({ latest: 'main' })), /no usable "latest" dist-tag \(got "main"\)/);
  const offline = { fetch: async () => { throw new Error('ENOTFOUND'); } };
  await assert.rejects(latestVersion(offline), /could not reach .*ENOTFOUND/);
});

test('the release is checked out as tag v<version>', () => {
  assert.equal(tagFor('0.6.1'), 'v0.6.1');
  const found = findTag({ version: '0.6.1', lsRemote: remote(['v0.6.0', 'v0.6.1']) });
  assert.deepEqual(found, { tag: 'v0.6.1', ref: 'refs/tags/v0.6.1', object: 'a'.repeat(40) });
  // v0.6.10 must not pass for v0.6.1, nor the reverse.
  assert.throws(() => findTag({ version: '0.6.1', lsRemote: remote(['v0.6.10']) }), /no tag v0\.6\.1/);
});

test('a release without its tag fails the build, naming the version and the tag, and never falls back to main', async () => {
  const lsRemote = remote(['v0.6.0']);
  assert.throws(
    () => findTag({ version: '0.6.1', lsRemote }),
    (error) =>
      /uptide 0\.6\.1 is the latest release on npm/.test(error.message) &&
      /has no tag v0\.6\.1/.test(error.message) &&
      /does not fall back to main/.test(error.message),
  );
  await assert.rejects(
    resolveSource({ env: {}, fetch: npm({ latest: '0.6.1' }).fetch, lsRemote }),
    /has no tag v0\.6\.1/,
  );
});

test('by default the source is the release tag, and only that is deployable', async () => {
  const source = await resolveSource({ env: {}, fetch: npm({ latest: '0.6.1' }).fetch, lsRemote: remote(['v0.6.1']) });
  assert.deepEqual(source, {
    kind: 'release',
    ref: 'v0.6.1',
    fetchRef: 'refs/tags/v0.6.1',
    version: '0.6.1',
    repoUrl: 'https://github.com/uptide-dev/uptide.git',
  });
  assert.equal(deployable(source), true);
});

test('a ref override builds a preview without asking npm, and is never deployable', async () => {
  const neverCalled = async () => assert.fail('a preview must not depend on npm');
  const source = await resolveSource({ env: { UPTIDE_REF: 'main' }, fetch: neverCalled, lsRemote: () => assert.fail() });
  assert.equal(source.kind, 'override');
  assert.equal(source.fetchRef, 'main');
  assert.equal(deployable(source), false);
  assert.equal(deployable(await resolveSource({ env: { UPTIDE_CHECKOUT: '/tmp/uptide' } })), false);
  assert.equal(deployable(undefined), false);
  // Whitespace-only is no override; anything that is not a ref name is refused.
  const blank = await resolveSource({ env: { UPTIDE_REF: '  ' }, fetch: npm({ latest: '0.6.1' }).fetch, lsRemote: remote(['v0.6.1']) });
  assert.equal(blank.kind, 'release');
  for (const bad of ['main\nrelease=true', '../x', '-o', 'a b', '$(id)'])
    await assert.rejects(resolveSource({ env: { UPTIDE_REF: bad } }), /is not a branch, tag or commit name/, bad);
});

test('the built pages name the release in meta tags', () => {
  assert.deepEqual(metaTags({ version: '0.6.1', ref: 'v0.6.1', sha: 'abc' }), [
    '<meta name="uptide-version" content="0.6.1">',
    '<meta name="uptide-ref" content="v0.6.1">',
    '<meta name="uptide-commit" content="abc">',
  ]);
  assert.match(metaTags({ version: '1', ref: 'a"b', sha: 'c' })[1], /content="a&quot;b"/);
  assert.match(read('docs-site/astro.config.mjs'), /\.\.\.releaseMeta,/);
  assert.match(read('scripts/assemble-site.mjs'), /withMeta\(fill\(html/);
  assert.match(read('scripts/assemble-site.mjs'), /writeFileSync\(notFound, withMeta\(/);
});

/** One job's block of pages.yml. */
const job = (name) => {
  const start = pages.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `pages.yml has no ${name} job`);
  const next = pages.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? pages.slice(start) : pages.slice(start, start + 1 + next);
};

test('push, the daily schedule and manual runs build the site; a manual run may name a preview ref', () => {
  assert.match(pages, /\non:\n {2}push:\n {4}branches: \[main\]\n {2}schedule:\n {4}- cron: '[^']+'\n {2}workflow_dispatch:\n {4}inputs:\n {6}ref:\n/);
  assert.match(pages, /\n {6}ref:\n(?: {8}.*\n)*? {8}default: ''\n/);
  assert.doesNotMatch(pages, /UPTIDE_REF:(?! \$\{\{ inputs\.ref \}\}\n)/, 'UPTIDE_REF comes only from the input');
});

test('a ref override never reaches the deploy step', () => {
  const build = job('build');
  const deploy = job('deploy');
  // The input is read in the build job only, through the environment, never pasted into a script.
  assert.equal(pages.match(/inputs\.ref/g).length, 3, 'concurrency, UPTIDE_REF and the deploy condition, nowhere else');
  assert.ok(build.includes('UPTIDE_REF: ${{ inputs.ref }}'));
  assert.doesNotMatch(pages, /run: [^\n]*\$\{\{ inputs\./);
  // The deploy job needs the build's own verdict, and refuses any manual run with a ref.
  assert.match(deploy, /\n {4}needs: build\n/);
  assert.match(
    deploy,
    /\n {4}if: needs\.build\.outputs\.release == 'true' && \(github\.event_name != 'workflow_dispatch' \|\| inputs\.ref == ''\)\n/,
  );
  assert.match(build, /\n {6}release: \$\{\{ steps\.assemble\.outputs\.release \}\}\n/);
  assert.match(build, /\n {8}id: assemble\n {8}run: node scripts\/assemble-site\.mjs _site\n/);
  // Deploying is all the deploy job does, and only it may.
  assert.deepEqual([...deploy.matchAll(/uses: (\S+)/g)].map((m) => m[1]), ['actions/deploy-pages@v4']);
  assert.doesNotMatch(build, /deploy-pages|pages: write|id-token/);
  assert.match(deploy, /permissions:\n(?: {6}#.*\n)* {6}pages: write\n {6}id-token: write\n/);
  // The build's verdict is written last, so nothing written before it can override it.
  const assemble = read('scripts/assemble-site.mjs');
  assert.match(assemble, /`version=\$\{source\.version\}\\nref=\$\{source\.ref\}\\nsha=\$\{source\.sha\}\\nrelease=\$\{deployable\(source\)\}\\n`/);
});
