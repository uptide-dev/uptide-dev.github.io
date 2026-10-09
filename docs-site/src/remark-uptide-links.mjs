// Rewrites relative links in the uptide docs, which are written for GitHub, into links that
// work on this site: a page under docs/ becomes its page here, and anything else in the
// repository (CONTRIBUTING.md, fixtures/, docs/decisions/ as a folder, a .json or .png file)
// becomes its URL on GitHub. Runs on the generated collection; the map from each source file
// to its slug is src/generated/source.json, written by scripts/fetch-docs.mjs.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';

const site = resolve(dirname(new URL(import.meta.url).pathname), '..');
const contentDir = resolve(site, 'src/content/docs');
const hasProtocol = (url) => /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');

/** @param {{ base: string, source?: any }} options */
export default function remarkUptideLinks({ base, source }) {
  source ??= JSON.parse(readFileSync(resolve(site, 'src/generated/source.json'), 'utf8'));
  const checkout = resolve(site, source.checkout);
  const root = base.replace(/\/$/, '');
  const bySlug = Object.fromEntries(Object.entries(source.pages).map(([path, slug]) => [slug, path]));

  /** The page's path in the uptide repository, e.g. docs/commands/fix.md. */
  const sourceOf = (file) => {
    const rel = relative(contentDir, file).split('\\').join('/').replace(/\.mdx?$/, '');
    return bySlug[rel === 'index' ? '' : rel];
  };

  const rewrite = (url, from, kind) => {
    if (!url || url.startsWith('#') || url.startsWith('/') || hasProtocol(url)) return url;
    const [, path, suffix = ''] = /^([^?#]*)(.*)$/.exec(url);
    const target = posix.normalize(posix.join(posix.dirname(from), decodeURI(path)));
    if (target.startsWith('..')) return url;
    const slug = source.pages[target];
    if (slug !== undefined) return `${root}/${slug ? `${slug}/` : ''}${suffix}`;
    const onDisk = resolve(checkout, target);
    if (kind === 'image') return `https://raw.githubusercontent.com/uptide-dev/uptide/${source.ref}/${target}`;
    const isDir = existsSync(onDisk) && statSync(onDisk).isDirectory();
    return `${source.repo}/${isDir ? 'tree' : 'blob'}/${source.ref}/${target.replace(/\/$/, '')}${suffix}`;
  };

  return (tree, file) => {
    const from = sourceOf(file.path ?? file.history?.[0] ?? '');
    if (!from) return;
    const visit = (node) => {
      if (node.type === 'link' || node.type === 'definition') node.url = rewrite(node.url, from, 'link');
      else if (node.type === 'image') node.url = rewrite(node.url, from, 'image');
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
