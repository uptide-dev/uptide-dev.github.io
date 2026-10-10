// Which uptide-dev/uptide ref the site is built from.
//
// By default, the latest published release: the `latest` dist-tag of `uptide` on npm, checked
// out as tag v<version>. When that tag does not exist the build fails; it never falls back to
// main. Two explicit overrides exist for previews, and a site built with either is never
// deployed (see deployable() and .github/workflows/pages.yml):
//
//   UPTIDE_REF       another ref to build from (a branch, tag or commit), for previews
//   UPTIDE_CHECKOUT  an existing local checkout (offline work)
//
//   UPTIDE_NPM_REGISTRY  registry to ask (default: https://registry.npmjs.org)
//   UPTIDE_REPO          git URL of uptide (default: https://github.com/uptide-dev/uptide.git)
import { execFileSync } from 'node:child_process';

export const PACKAGE = 'uptide';
export const REPO_URL = 'https://github.com/uptide-dev/uptide.git';
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** The version npm's `latest` dist-tag points at. */
export async function latestVersion({ fetch = globalThis.fetch, registry = 'https://registry.npmjs.org' } = {}) {
  const url = `${registry.replace(/\/+$/, '')}/-/package/${PACKAGE}/dist-tags`;
  let response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new Error(`npm: could not reach ${url} (${error.message}); cannot tell which uptide release to build`);
  }
  if (!response.ok) throw new Error(`npm: ${url} answered ${response.status}; cannot tell which uptide release to build`);
  let tags;
  try {
    tags = await response.json();
  } catch {
    throw new Error(`npm: ${url} did not answer JSON; cannot tell which uptide release to build`);
  }
  const version = tags?.latest;
  if (typeof version !== 'string' || !VERSION.test(version))
    throw new Error(`npm: ${url} has no usable "latest" dist-tag (got ${JSON.stringify(version)})`);
  return version;
}

export const tagFor = (version) => `v${version}`;

/** `git ls-remote` against the anonymous HTTPS remote: never prompts, never uses credentials. */
export function lsRemote(repoUrl, ref) {
  return execFileSync('git', ['-c', 'credential.helper=', 'ls-remote', '--tags', repoUrl, ref], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** The object id of tag `tag` in the repository, or a clear failure when it is not there. */
export function findTag({ version, repoUrl = REPO_URL, lsRemote: run = lsRemote }) {
  const tag = tagFor(version);
  const ref = `refs/tags/${tag}`;
  const line = run(repoUrl, ref)
    .split('\n')
    .find((l) => l.split('\t')[1] === ref);
  if (!line)
    throw new Error(
      `uptide ${version} is the latest release on npm, but ${repoUrl} has no tag ${tag}. ` +
        'The site is built from release tags only and does not fall back to main: push the tag, ' +
        'or run the Pages workflow by hand with a `ref` to preview another ref.',
    );
  return { tag, ref, object: line.split('\t')[0] };
}

/**
 * Where to build from: { kind: 'release' | 'override' | 'local', ref, fetchRef?, version?, path? }.
 * `version` is set for a release (from npm); for the others it comes from the checkout.
 */
export async function resolveSource({ env = process.env, fetch, lsRemote: run } = {}) {
  if (env.UPTIDE_CHECKOUT) return { kind: 'local', ref: 'local checkout', path: env.UPTIDE_CHECKOUT };
  const repoUrl = env.UPTIDE_REPO || REPO_URL;
  const override = env.UPTIDE_REF?.trim();
  if (override) {
    // A branch, tag or commit; nothing that could smuggle text into a log or step output.
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(override) || override.includes('..'))
      throw new Error(`UPTIDE_REF ${JSON.stringify(override)} is not a branch, tag or commit name`);
    return { kind: 'override', ref: override, fetchRef: override, repoUrl };
  }
  const version = await latestVersion({ fetch, registry: env.UPTIDE_NPM_REGISTRY || undefined });
  const { tag, ref } = findTag({ version, repoUrl, lsRemote: run });
  return { kind: 'release', ref: tag, fetchRef: ref, version, repoUrl };
}

/** Only a site built from the npm release's tag may be deployed. */
export const deployable = (source) => source?.kind === 'release';

/** The line the build log shows, and what the built pages carry in their meta tags. */
export function describe(source) {
  const sha = source.sha ? ` (${source.sha.slice(0, 7)})` : '';
  if (source.kind === 'release') return `uptide ${source.version}: npm latest, tag ${source.ref}${sha}`;
  if (source.kind === 'override') return `uptide ${source.version ?? '?'}: ref ${source.ref}${sha}, preview, not deployable`;
  return `uptide ${source.version ?? '?'}: ${source.ref}${sha}, preview, not deployable`;
}

/** The meta tags naming the release the site reflects, as { name, content } pairs. */
export const metaFields = (source) => [
  { name: 'uptide-version', content: String(source.version) },
  { name: 'uptide-ref', content: String(source.ref) },
  { name: 'uptide-commit', content: String(source.sha) },
];

/** The same, as HTML. */
export function metaTags(source) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return metaFields(source).map(({ name, content }) => `<meta name="${name}" content="${esc(content)}">`);
}
