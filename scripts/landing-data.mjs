// What the landing page says about Uptide, from the uptide-dev/uptide checkout the docs build
// makes (docs-site/scripts/fetch-docs.mjs), so the page and the repository never disagree.
//
// - The packs: each pack's verification.json (what `uptide pack test --write` recorded) and
//   ground-truth.json, rendered into the page's data-uptide slots. The version range lives in
//   the pack's TypeScript metadata, so it is read from the README's generated packs table
//   (scripts/docs-packs.ts in uptide, kept current by its CI), and every other column of that
//   table must equal what this module computes from the JSON, or the build fails.
// - The version: packages/cli/package.json.
// - Terminal output: every <pre data-source="path"> on the page must match its source in the
//   checkout, so a number on the page is always one a public run printed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKS = 'packages/core/src/packs';
const START = '<!-- packs:start -->';
const END = '<!-- packs:end -->';

const escape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescape = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** The same rounding as uptide's README table. */
export const percent = (n) => `${Math.round(n * 100)}%`;

/** The README's generated packs table, by package: { range, precision, recall, repos, status }. */
export function readmePacks(readme) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error(`README.md: no ${START} … ${END} packs table`);
  const rows = new Map();
  for (const line of readme.slice(start + START.length, end).split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const name = /^`([^`]+)`$/.exec(cells[0] ?? '');
    if (!name || cells.length !== 6) continue;
    const [, range, precision, recall, repos, status] = cells;
    rows.set(name[1], { range, precision, recall, repos, status });
  }
  if (!rows.size) throw new Error('README.md: the packs table has no rows');
  return rows;
}

/** Every pack in the checkout, in the README's order, cross-checked against the README. */
export function readPacks(checkout) {
  const dir = join(checkout, PACKS);
  const fromJson = new Map();
  for (const name of readdirSync(dir).sort()) {
    const verification = join(dir, name, 'verification.json');
    const truth = join(dir, name, 'ground-truth.json');
    if (!existsSync(verification) || !existsSync(truth)) continue;
    const v = JSON.parse(readFileSync(verification, 'utf8'));
    const t = JSON.parse(readFileSync(truth, 'utf8'));
    const repos = t.repos.filter((r) => r.repo).map((r) => r.repo);
    fromJson.set(t.package, {
      package: t.package,
      status: v.status,
      precision: v.breaking.precision,
      recall: v.breaking.recall,
      falsePositives: v.breaking.falsePositives,
      repos,
    });
  }
  if (!fromJson.size) throw new Error(`${PACKS}: no pack with verification.json and ground-truth.json`);

  const readme = readmePacks(readFileSync(join(checkout, 'README.md'), 'utf8'));
  const problems = [];
  for (const name of fromJson.keys()) if (!readme.has(name)) problems.push(`${name}: in ${PACKS} but not in the README table`);
  for (const name of readme.keys()) if (!fromJson.has(name)) problems.push(`${name}: in the README table but not in ${PACKS}`);
  for (const [name, row] of readme) {
    const pack = fromJson.get(name);
    if (!pack) continue;
    const ours = { precision: percent(pack.precision), recall: percent(pack.recall), repos: pack.repos.join(', '), status: pack.status };
    for (const [key, value] of Object.entries(ours))
      if (row[key] !== value) problems.push(`${name}: ${key} is "${value}" from the JSON but "${row[key]}" in the README`);
  }
  if (problems.length)
    throw new Error(`The landing page and uptide's README would disagree:\n  ${problems.join('\n  ')}`);

  return [...readme.keys()].map((name) => ({ ...fromJson.get(name), range: readme.get(name).range }));
}

export function readVersion(checkout) {
  return JSON.parse(readFileSync(join(checkout, 'packages/cli/package.json'), 'utf8')).version;
}

/** The HTML for each data-uptide slot on the landing page. */
export function slots({ version, packs }) {
  const verified = packs.filter((p) => p.status === 'verified');
  const names = verified.map((p) => `<code>${escape(p.package)}</code> ${escape(p.range)}`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('');
  return {
    version: escape(version),
    'packs-heading': `${verified.length} verified ${verified.length === 1 ? 'pack' : 'packs'}`,
    'packs-list': `${list}.`,
    'packs-rows': packs
      .map((p) => {
        const repos = p.repos
          .map((r) => `<a href="https://github.com/${escape(r)}">${escape(r)}</a>`)
          .join(', ');
        return `<tr><td><code>${escape(p.package)}</code></td><td>${escape(p.range)}</td><td>${percent(p.precision)}</td><td>${percent(p.recall)}</td><td>${repos}</td><td>${escape(p.status)}</td></tr>`;
      })
      .join('\n      '),
  };
}

const SLOT = /(<(\w+)\b[^>]*\sdata-uptide="([\w-]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g;

/** The page with every data-uptide slot filled; fails on a slot it does not know or one left out. */
export function fill(html, values) {
  const seen = new Set();
  const out = html.replace(SLOT, (_, open, _tag, key, _fallback, close) => {
    if (!(key in values)) throw new Error(`data-uptide="${key}": no such value`);
    seen.add(key);
    return `${open}${values[key]}${close}`;
  });
  const missing = Object.keys(values).filter((k) => !seen.has(k));
  if (missing.length) throw new Error(`the page has no data-uptide slot for: ${missing.join(', ')}`);
  return out;
}

/** The code blocks of a Markdown file, each as an array of lines. */
function fencedBlocks(markdown) {
  const blocks = [];
  let current = null;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      if (current) blocks.push(current);
      current = current ? null : [];
    } else if (current) current.push(line.trimEnd());
  }
  return blocks;
}

const contains = (block, lines) =>
  block.some((_, i) => lines.every((line, j) => block[i + j] === line));

const flat = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Problems with the page's terminal output: each <pre data-source="path"> must be a run of
 * consecutive lines of a code block in that file of the checkout, or, with
 * data-match="text", appear in it word for word (whitespace aside), as uptide's own test
 * checks its privacy statement.
 */
export function checkSources(html, checkout) {
  const problems = [];
  let count = 0;
  for (const [, attrs, inner] of html.matchAll(/<pre\b([^>]*\sdata-source="[^"]*"[^>]*)>([\s\S]*?)<\/pre>/g)) {
    count++;
    const source = /data-source="([^"]*)"/.exec(attrs)[1];
    const mode = /data-match="([^"]*)"/.exec(attrs)?.[1] ?? 'lines';
    const file = join(checkout, source);
    if (!existsSync(file)) {
      problems.push(`${source}: not in the checkout`);
      continue;
    }
    // Diff lines are block spans with no newline between them.
    const text = unescape(inner.replace(/<\/span>(?=<span class="l\b)/g, '</span>\n').replace(/<[^>]+>/g, ''));
    const markdown = readFileSync(file, 'utf8');
    const lines = text.split('\n').map((l) => l.trimEnd());
    const ok =
      mode === 'text'
        ? flat(markdown).includes(flat(text.replace(/^Privacy:\s*/, '')))
        : fencedBlocks(markdown).some((block) => contains(block, lines));
    if (!ok) problems.push(`${source}: the page's block starting "${lines[0]}" is not in it`);
  }
  if (!count) problems.push('the page has no <pre data-source> block to check');
  return problems;
}
