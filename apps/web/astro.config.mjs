import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://miraflorescostatropical.com",
  trailingSlash: "always",
  integrations: [sitemap()],
});
