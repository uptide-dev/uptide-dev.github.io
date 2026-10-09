// The sidebar, read from the uptide docs' own table of contents (docs/README.md): its
// "Using Uptide" section first, then "Contributing and internals", each in the order the
// README lists its pages. A link to a page under docs/ becomes that page; a link to a folder
// under docs/ (decisions/) becomes a collapsed group of its pages; anything outside docs/
// (CONTRIBUTING.md, SECURITY.md) links to GitHub.
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

const SECTIONS = ['Using Uptide', 'Contributing and internals'];

/** Each `## ` section of the README with the `[label](target)` links in its table rows. */
export function readSections(readme) {
  const sections = new Map();
  let current;
  for (const line of readme.split('\n')) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) sections.set((current = heading[1]), []);
    else if (current && line.startsWith('|')) {
      const link = /^\|\s*\[([^\]]+)\]\(([^)]+)\)/.exec(line);
      if (link) sections.get(current).push({ label: link[1].replace(/`/g, ''), target: link[2] });
    }
  }
  return sections;
}

export function sidebar(siteDir) {
  const source = JSON.parse(readFileSync(resolve(siteDir, 'src/generated/source.json'), 'utf8'));
  const readme = readFileSync(resolve(siteDir, source.checkout, 'docs/README.md'), 'utf8');
  const sections = readSections(readme);
  const item = ({ label, target }) => {
    const path = posix.normalize(posix.join('docs', target));
    if (path in source.pages) return { label, slug: source.pages[path] };
    const folder = path.replace(/\/$/, '');
    const slugs = Object.values(source.pages).filter((s) => s.startsWith(`${folder.slice(5)}/`));
    if (folder.startsWith('docs/') && slugs.length)
      return { label, collapsed: true, items: [{ autogenerate: { directory: folder.slice(5) } }] };
    return { label, link: `${source.repo}/blob/${source.ref}/${path}`, attrs: { rel: 'external' } };
  };
  return [
    { label: 'Overview', slug: '' },
    ...SECTIONS.map((name) => {
      const items = sections.get(name);
      if (!items?.length) throw new Error(`docs/README.md has no "## ${name}" table of pages`);
      return { label: name, items: items.map(item) };
    }),
  ];
}
