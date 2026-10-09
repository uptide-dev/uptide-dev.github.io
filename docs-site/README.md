# Docs site

The Uptide documentation at `/docs`, built with [Starlight](https://starlight.astro.build)
from [uptide-dev/uptide](https://github.com/uptide-dev/uptide)'s `docs/` folder. The docs
are never copied into this repository: every build checks out `main` of uptide-dev/uptide
(anonymous HTTPS) and generates the content collection from it.

```sh
npm ci
npm run build          # fetch the docs, then astro build into dist/
npm run dev            # fetch the docs, then a dev server at http://localhost:4321/docs/
```

To see it with the landing page as it is deployed, from the repository root:

```sh
node scripts/assemble-site.mjs                    # site/ at /, docs-site/dist at /docs → _site/
node scripts/check-links.mjs                      # no broken internal link or #anchor
python3 -m http.server 8000 --directory _site     # http://localhost:8000/docs/
```

`UPTIDE_CHECKOUT=/path/to/uptide` builds from a local checkout instead of cloning (offline
work, or previewing docs changes before they land); `UPTIDE_REF` picks another branch.

## How the content is made

`scripts/fetch-docs.mjs` runs before every build. It clones uptide-dev/uptide into `.cache/`
and writes one page per `docs/**/*.md` (except `docs/screenshots/`) into `src/content/docs/`;
both are gitignored.

- `docs/README.md` is the index page.
- A page's front matter `title` and `description` are used as they are. A page without them
  takes its title from its first `# ` heading and its description from its first paragraph.
- The first `# ` heading is dropped, since Starlight renders the title as the page's h1.
- Each page's "Edit page" link opens the file on GitHub.

`src/remark-uptide-links.mjs` rewrites links when a page renders: a link to another page
under `docs/` stays on this site (`../concepts.md#exit-codes` → `/docs/concepts/#exit-codes`),
and a link to anything else in the repository (`../CONTRIBUTING.md`, `fixtures/`, a folder
under `docs/`) goes to its URL on GitHub.

`src/sidebar.mjs` builds the sidebar from the tables in `docs/README.md`: "Using Uptide"
first, then "Contributing and internals", in the order the README lists them. A folder
(`decisions/`) becomes a collapsed group of its pages; a file outside `docs/` links to GitHub.
A README without those two sections fails the build.

## Design

`src/styles/uptide.css` maps the landing page's tokens onto Starlight's: the same background,
surface, line, text, body and accent colors in each theme, Space Grotesk headings, Instrument
Sans body and IBM Plex Mono code (the font files are the landing page's, in `site/fonts/`),
square corners, 1px rules and no shadows. Code blocks are Expressive Code with one dark theme
on `#131210` in both themes. `src/components/SiteTitle.astro` is the landing page's mark and
wordmark, linking to `/`. `public/favicon.svg` is a link to `site/favicon.svg`.

In light mode the dim text color is `#6A675F` rather than the landing page's `#76736B`, which
falls just short of 4.5:1 for small text on the page background.

## Versions

Every dependency is pinned to an exact version (`.npmrc` has `save-exact=true`), with the
lockfile committed, and Node is pinned in `.node-version`. To upgrade, install the exact new
version (`npm i astro@x.y.z`), rebuild, and run the checks above.
