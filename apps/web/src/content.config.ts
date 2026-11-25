import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "*/index.md", base: "./src/content/blog", generateId: ({ entry }) => entry.split("/")[0] }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      categories: z.array(z.string()).default([]),
      cover: image().optional(),
    }),
});

export const collections = { blog };
