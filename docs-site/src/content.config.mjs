// The docs collection: the pages scripts/fetch-docs.mjs generates from uptide-dev/uptide's
// docs/ folder, validated against Starlight's schema.
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
