# migration — WordPress export

`wp-export.mjs` pulls everything public from the WordPress REST API into `export/`:
`pages.json`, `posts.json`, `media.json`, `categories.json`, `tags.json`, and `seo.json`
(old URL → Yoast title/description). `--media` also downloads every original image into
`export/media/` (git-ignored; optimised copies go into `apps/web`).

Pages were built with Elementor, so `content.rendered` is layout-heavy HTML — we extract
the text and images from it rather than reusing the markup.
