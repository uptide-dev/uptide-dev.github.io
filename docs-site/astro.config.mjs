// The docs site, served at /docs next to the landing page (site/). Content comes from
// uptide-dev/uptide's docs/ folder at build time: see scripts/fetch-docs.mjs.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkUptideLinks from './src/remark-uptide-links.mjs';
import { sidebar } from './src/sidebar.mjs';

// The site's address, as in .github/workflows/pages.yml; canonical and og:image URLs use it.
const SITE_URL = process.env.SITE_URL || 'https://uptide-dev.github.io/';
const base = '/docs';
const siteDir = fileURLToPath(new URL('.', import.meta.url));
const ogImage = new URL('og.png', SITE_URL).href;

export default defineConfig({
  site: SITE_URL,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: { processor: unified({ remarkPlugins: [[remarkUptideLinks, { base }]] }) },
  integrations: [
    starlight({
      title: 'Uptide docs',
      description:
        'Documentation for Uptide, the open-source CLI that shows what a dependency upgrade breaks in your code and opens a verified migration branch or PR.',
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/uptide-dev/uptide' },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/uptide' },
      ],
      sidebar: sidebar(siteDir),
      components: { SiteTitle: './src/components/SiteTitle.astro' },
      customCss: ['./src/styles/uptide.css'],
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: ogImage } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: ogImage } },
      ],
      // Code blocks are a dark terminal in both themes, like the landing page's output blocks.
      expressiveCode: {
        themes: ['github-dark-default'],
        useStarlightDarkModeSwitch: false,
        useStarlightUiThemeColors: false,
        styleOverrides: {
          borderRadius: '0',
          borderColor: '#2B2925',
          codeBackground: '#131210',
          codeFontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          uiFontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          frames: {
            shadowColor: 'transparent',
            editorBackground: '#131210',
            terminalBackground: '#131210',
            editorTabBarBackground: '#1B1A17',
            editorActiveTabBackground: '#131210',
            terminalTitlebarBackground: '#1B1A17',
            terminalTitlebarBorderBottomColor: '#2B2925',
            editorTabBarBorderBottomColor: '#2B2925',
            frameBoxShadowCssValue: 'none',
          },
        },
      },
    }),
  ],
});
