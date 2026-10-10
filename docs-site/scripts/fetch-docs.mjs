// Checks out uptide-dev/uptide and turns its docs/ folder into this site's content collection.
//
//   node scripts/fetch-docs.mjs
//
// The docs are never committed here: the checkout (.cache/uptide) and the generated collection
// (src/content/docs) are both gitignored and rebuilt on every build. What is checked out is
// decided by scripts/release.mjs: the tag of the latest uptide release on npm, or, for previews
// that are never deployed, UPTIDE_REF or UPTIDE_CHECKOUT. The resolved version, ref and commit
// are printed and recorded in src/generated/source.json, which the site's meta tags and the
// landing page read.
//
// For each Markdown page under docs/ (docs/screenshots/ is image evidence, not pages):
// - README.md becomes the index page;
// - the page's front matter title and description are kept; a page without them takes its
//   title from its first `# ` heading and its description from its first paragraph;
// - the first `# ` heading is dropped, since Starlight renders the title as the page's h1;
// - editUrl points at the file on main on GitHub (a release tag cannot be edited).
// Links are rewritten when the page is rendered, by src/remark-uptide-links.mjs, from the map
// this script writes to src/generated/source.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployable, describe, resolveSource } from './release.mjs';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const github = 'https://github.com/uptide-dev/uptide';

const git = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    // Anonymous HTTPS: never prompt, never use a credential helper.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

/** A shallow checkout of exactly `source.fetchRef` (a tag, branch or commit), nothing else. */
function checkout(source) {
  if (source.kind === 'local') return resolve(source.path);
  const dir = join(site, '.cache', 'uptide');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(['init', '--quiet'], dir);
  git(['-c', 'credential.helper=', 'fetch', '--quiet', '--depth', '1', source.repoUrl, source.fetchRef], dir);
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], dir);
  return dir;
}

/** Splits a page into its raw front matter block (without the fences) and its body. */
export function splitFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return match ? { data: match[1], body: text.slice(match[0].length) } : { data: '', body: text };
}

/** Markdown inline syntax reduced to the words a reader sees. */
export function plain(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first `# ` heading (outside code fences) and the first prose paragraph after it, and the
 * body without that heading when it is the first thing on the page.
 */
export function readBody(body) {
  const lines = body.split('\n');
  let fence = null;
  let h1 = -1;
  let seenContent = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      seenContent = true;
      continue;
    }
    if (fence) continue;
    if (/^# /.test(line)) {
      h1 = i;
      break;
    }
    if (line.trim()) seenContent = true;
  }
  const title = h1 >= 0 ? plain(lines[h1].slice(2)) : undefined;

  let description;
  fence = null;
  let para = [];
  for (let i = h1 + 1; i <= lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*(```+|~~~+)/.test(line)) fence = fence ? null : true;
    if (fence) continue;
    if (line.trim() && !para.length && /^\s*([#>|<!-]|\d+\.|\*\s|```)/.test(line)) continue;
    if (line.trim()) para.push(line);
    else if (para.length) {
      const text = plain(para.join(' '));
      para = [];
      // A short "Status: accepted (date)" line is metadata, not a summary.
      if (text.length < 60 && /^\w[\w ]*: /.test(text)) continue;
      description = text;
      break;
    }
  }
  if (description && description.length > 200) {
    const sentence = /^(.{60,200}?[.:;])\s/.exec(description);
    description = sentence ? sentence[1] : `${description.slice(0, 197).replace(/\s+\S*$/, '')}…`;
  }

  const kept = h1 >= 0 && !seenContent ? [...lines.slice(0, h1), ...lines.slice(h1 + 1)] : lines;
  return { title, description, body: kept.join('\n').replace(/^\s*\n/, '') };
}

const hasKey = (data, key) => new RegExp(`^${key}\\s*:`, 'm').test(data);

/** The page's slug on this site: its path under docs/ without .md; README.md is the index. */
export const slugOf = (docPath) =>
  docPath.replace(/(^|\/)README\.md$/i, '$1').replace(/\.md$/i, '').replace(/\/$/, '');

async function main() {
  const source = await resolveSource();
  const repo = checkout(source);
  source.sha = git(['rev-parse', 'HEAD'], repo);
  const version = JSON.parse(readFileSync(join(repo, 'packages/cli/package.json'), 'utf8')).version;
  if (source.kind === 'release' && version !== source.version)
    throw new Error(`tag ${source.ref} has packages/cli/package.json version ${version}, but npm's latest is ${source.version}`);
  source.version = version;
  // Links into the repository point at what was built; a local checkout has no ref to link to.
  const linkRef = source.kind === 'local' ? 'main' : source.ref;
  console.log(`uptide source: ${describe(source)}`);
  const docsDir = join(repo, 'docs');
  if (!existsSync(join(docsDir, 'README.md'))) throw new Error(`${docsDir}/README.md not found`);

  const out = join(site, 'src', 'content', 'docs');
  rmSync(out, { recursive: true, force: true });

  const pages = {};
  const files = readdirSync(docsDir, { recursive: true })
    .map((f) => String(f).split('\\').join('/'))
    .filter((f) => f.endsWith('.md') && !f.startsWith('screenshots/'))
    .sort();
  for (const file of files) {
    const slug = slugOf(file);
    const { data, body } = splitFrontMatter(readFileSync(join(docsDir, file), 'utf8'));
    const read = readBody(body);
    const extra = [];
    if (!hasKey(data, 'title')) {
      if (!read.title) throw new Error(`docs/${file}: no title in front matter and no # heading`);
      extra.push(`title: ${JSON.stringify(read.title)}`);
    }
    if (!hasKey(data, 'description') && read.description)
      extra.push(`description: ${JSON.stringify(read.description)}`);
    // A tag cannot be edited: "Edit page" opens the file on main.
    if (!hasKey(data, 'editUrl'))
      extra.push(`editUrl: ${JSON.stringify(`${github}/edit/main/docs/${file}`)}`);
    const front = [data, ...extra].filter(Boolean).join('\n');
    const target = join(out, slug === '' ? 'index.md' : `${slug}.md`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `---\n${front}\n---\n\n${read.body}`);
    pages[`docs/${file}`] = slug;
  }

  const generated = join(site, 'src', 'generated');
  mkdirSync(generated, { recursive: true });
  writeFileSync(
    join(generated, 'source.json'),
    `${JSON.stringify(
      {
        kind: source.kind,
        deployable: deployable(source),
        version: source.version,
        ref: source.ref,
        sha: source.sha,
        repo: github,
        linkRef,
        checkout: relative(site, repo) || '.',
        pages,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`docs: ${files.length} pages from ${github}@${source.sha.slice(0, 7)} (${source.ref})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(`fetch-docs: ${error.message}`);
    process.exit(1);
  });
