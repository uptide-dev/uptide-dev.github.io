# uptide-dev.github.io

The landing page of [Uptide](https://github.com/uptide-dev/uptide), published at
https://uptide-dev.github.io.

The page is `site/`: static HTML with inline CSS, self-hosted fonts and no build step. What
each file is, and where every number on the page comes from: [site/README.md](site/README.md).

## See it locally

```sh
python3 -m http.server 8000 --directory site    # then open http://localhost:8000
```

`%SITE_URL%` in the page's `<head>` is expected: the deploy writes the real address there
(canonical and social-preview URLs only; nothing visible).

## Publishing

`.github/workflows/pages.yml` deploys `site/` to GitHub Pages on every push to `main` that
changes it. Its `SITE_URL` is the one value to change if the page moves to a domain.

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
  the URLs from `SITE_URL`, nothing loaded from another origin, the deploy's trigger and
  permissions.

`scripts/` (`dco.mjs`, `bots.mjs`, `public-tree.mjs`, `private-material.mjs`) and
`.github/workflows/dco.yml` are copies from uptide-dev/uptide, where they are tested. Change
them there first, then copy them here.

The page is licensed under Apache-2.0 ([LICENSE](LICENSE)); its fonts under the SIL Open Font
License 1.1, with each license next to its font in `site/fonts/`.
