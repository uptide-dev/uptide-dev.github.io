# Landing page

`index.html` is the whole site: one static page with inline CSS, a few lines of inline
JavaScript for the copy buttons, and self-hosted fonts. No build step and no external
requests.

```sh
npx serve site         # or any static file server; open http://localhost:3000
```

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page. Design tokens are the same as the list/check HTML report ([`packages/cli/src/html/assets.ts`](https://github.com/uptide-dev/uptide/blob/main/packages/cli/src/html/assets.ts) in uptide-dev/uptide); light and dark follow the system. |
| `404.html` | The page GitHub Pages serves for every missing path. Every URL in it is absolute. |
| `favicon.svg` | The logo mark in its two blues (`#7CC4FF` wave, `#3E7FD9` line), the same in both themes. |
| `og.png` | Social preview, 1280×640. Used for `og:image` and `twitter:image`, and meant for the repository's social preview setting. |
| `og-image.html` | Source of `og.png`. Render it at 1280×640 with a headless browser and save a PNG screenshot. |
| `fonts/` | Space Grotesk, Instrument Sans and IBM Plex Mono, Latin subsets (from Fontsource 5.3.0), each under the SIL Open Font License 1.1; the license texts are next to them. |

## Deploying

`.github/workflows/pages.yml` publishes this directory to GitHub Pages as it is, at the root,
with the docs from `docs-site/` under `/docs`: on every push to `main`, daily and by hand. The
canonical URL, `og:url`, `og:image` and `twitter:image` are written `%SITE_URL%` in
`index.html`, and the workflow replaces them with its `SITE_URL` (now
`https://uptide-dev.github.io/`) in the deployed copy. To move the page to a domain, change
that one value.

## Where the numbers come from

Every number on the page traces to a public run or a public file in
[uptide-dev/uptide](https://github.com/uptide-dev/uptide), and the deploy checks it against the
checkout the docs build makes, which is the tag of the latest uptide release on npm
(`scripts/landing-data.mjs`, run by `scripts/assemble-site.mjs`):

- **Version and packs** are not written in `index.html`. Elements marked `data-uptide="…"`
  hold a fallback, and the deploy fills them: the version from `packages/cli/package.json`,
  and the packs (count, list, and the table with precision, recall and ground-truth
  repositories) from each pack's `verification.json` and `ground-truth.json`. The version range
  is read from the README's generated packs table, and every other column of that table must
  equal what the JSON gives, so the page and the README cannot disagree: if they would, the
  deploy fails.
- **Terminal output** is the storefront fixture's `check` and `fix` runs as the uptide README
  and docs print them. Each `<pre>` names its source (`data-source="docs/commands/check.md"`)
  and must be a run of consecutive lines of a code block there, so a block that drifts from
  the published run fails the deploy. When uptide's docs change a run, copy the new lines in.
- **The privacy block** is the statement `uptide --help` prints, checked word for word
  against `docs/privacy.md` (`data-match="text"`, as uptide's own test checks it).
- **Everything else** (Node 20, the default models, the `$1` cost cap, exit codes) is from
  uptide's `package.json` and docs.

Opening `index.html` straight from `site/` shows the fallbacks; see the repository README for
building it as deployed.
