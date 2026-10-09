// Fails when a page in the assembled site links to something the site does not have:
//
//   node scripts/check-links.mjs [dir]      (default: _site)
//
// Every href and src on every HTML page that points inside the site (root-relative or
// relative) must resolve to a file, and a #fragment must name an id on the target page.
// Links to other origins are not fetched.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), '_site'));
const pages = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.html'));

const ids = new Map();
const idsOf = (file) => {
  if (!ids.has(file)) {
    const html = readFileSync(file, 'utf8');
    ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return ids.get(file);
};

/** The file a URL path names: itself, or its index.html when it is a directory. */
const fileFor = (path) => {
  if (existsSync(path) && statSync(path).isFile()) return path;
  const index = join(path, 'index.html');
  return existsSync(index) ? index : undefined;
};

const broken = [];
let checked = 0;
for (const page of pages) {
  const file = join(root, page);
  const html = readFileSync(file, 'utf8')
    // Code and scripts are not links.
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<pre\b[\s\S]*?<\/pre>/g, '');
  for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) continue;
    // The landing page's address before the deploy writes it in (see pages.yml).
    if (url.startsWith('%SITE_URL%')) continue;
    const [, path, hash] = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(url);
    const target = path
      ? fileFor(path.startsWith('/') ? join(root, decodeURI(path)) : resolve(dirname(file), decodeURI(path)))
      : file;
    checked++;
    if (!target) broken.push(`${page}: ${attr}="${url}" (no such file)`);
    else if (hash && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(hash)))
      broken.push(`${page}: ${attr}="${url}" (no #${hash} in ${relative(root, target)})`);
  }
}

if (broken.length) {
  console.error(`${broken.length} broken internal link(s):\n${broken.map((b) => `  ${b}`).join('\n')}`);
  process.exit(1);
}
console.log(`links: ${checked} internal links on ${pages.length} pages, none broken`);
