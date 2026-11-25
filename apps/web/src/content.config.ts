import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// English posts: blog/<slug>/index.md. Spanish posts: blog/es/<slug>/index.md,
// with `translationOf` naming the English post's slug.
const blog = defineCollection({
  loader: glob({ pattern: "**/index.md", base: "./src/content/blog", generateId: ({ entry }) => entry.replace(/\/index\.md$/, "") }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      categories: z.array(z.string()).default([]),
      cover: image().optional(),
      translationOf: z.string().optional(),
    }),
});

export const collections = { blog };
