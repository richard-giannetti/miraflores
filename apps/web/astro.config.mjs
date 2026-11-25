import { defineConfig } from "astro/config";
import { rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";

// Cloudflare serves the nearest 404.html for missing pages, so the Spanish one must be
// at /es/404.html rather than /es/404/index.html.
const spanish404 = {
  name: "spanish-404",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const out = fileURLToPath(dir);
      await rename(`${out}es/404/index.html`, `${out}es/404.html`);
      await rm(`${out}es/404`, { recursive: true });
    },
  },
};

export default defineConfig({
  site: "https://miraflorescostatropical.com",
  trailingSlash: "always",
  integrations: [sitemap({ filter: (page) => !/\/404\/?$/.test(page) }), spanish404],
});
