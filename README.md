# uptide-dev.github.io

The landing page of [Uptide](https://github.com/uptide-dev/uptide), published at
https://uptide-dev.github.io.

Two parts, published together:

- **The landing page** at `/` is `site/`: static HTML with inline CSS, self-hosted fonts and
  no build step. What each file is, and where every number on the page comes from:
  [site/README.md](site/README.md).
- **The docs** at `/docs` are `docs-site/`, built with Astro Starlight from
  uptide-dev/uptide's `docs/` folder, checked out at build time and never copied here:
  [docs-site/README.md](docs-site/README.md).

Both reflect the latest published release of uptide: the `latest` dist-tag on npm, checked out
as tag `v<version>`. Every built page names it in `<meta name="uptide-version">` and
`<meta name="uptide-ref">`.

## See it locally

```sh
python3 -m http.server 8000 --directory site    # then open http://localhost:8000
```

That is the landing page alone. For both, as deployed:

```sh
(cd docs-site && npm ci && npm run build)
node scripts/assemble-site.mjs && node scripts/check-links.mjs
python3 -m http.server 8000 --directory _site   # http://localhost:8000 and /docs/
```

`%SITE_URL%` in the page's `<head>` is expected: the deploy writes the real address there
(canonical and social-preview URLs only; nothing visible).

## Publishing

`.github/workflows/pages.yml` builds the docs, puts them under `/docs` next to `site/`, checks
every internal link and deploys to GitHub Pages: on every push to `main`, daily (so a new
uptide release reaches the site within a day), and by hand. A missing release tag fails the
build rather than falling back to `main`.

**Previews:** Actions → Pages → Run workflow, with `ref` set to an uptide-dev/uptide branch,
tag or commit, builds the site from that ref and uploads it as the run's `github-pages`
artifact. It is never deployed: the deploy job runs only when the build reports it was built
from the release tag and no `ref` was given. Its `SITE_URL` is the one value to change if
the page moves to a domain; the docs take their canonical and `og:image` URLs from it too.

One-time setup:

1. The repository is **public** (Pages on a private repository needs a paid plan, and the page
   is public anyway).
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions → secret **`UPTIDE_PRIVATE_DENYLIST`**, the same
   value as in uptide-dev/uptide.

## Checks

- **DCO**: every commit is signed off (`git commit -s`), as in uptide-dev/uptide.
- **No private material**: no private planning document and no identifier from the denylist.
- **The page's own tests** (`node --test 'test/*.test.mjs'`): every font next to its license,
  the URLs from `SITE_URL`, nothing loaded from another origin, the deploy's triggers and
  permissions, exact docs dependency versions, no docs committed, and the docs transforms
  (titles, sidebar, links).
- **The site build**: the docs build against the latest uptide release, the landing page's
  version and packs are rendered from that checkout and its terminal blocks checked against
  their public sources (`scripts/landing-data.mjs`), and `scripts/check-links.mjs` finds no
  broken internal link or anchor in landing + docs.

`scripts/assemble-site.mjs`, `scripts/landing-data.mjs` and `scripts/check-links.mjs` belong to
this repository. The rest
of `scripts/` (`dco.mjs`, `bots.mjs`, `public-tree.mjs`, `private-material.mjs`) and
`.github/workflows/dco.yml` are copies from uptide-dev/uptide, where they are tested. Change
them there first, then copy them here.

The page is licensed under Apache-2.0 ([LICENSE](LICENSE)); its fonts under the SIL Open Font
License 1.1, with each license next to its font in `site/fonts/`.
