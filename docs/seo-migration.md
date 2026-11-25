# SEO migration plan

Google has indexed the current URLs. Every one of them must either stay the same or
301-redirect to its new home, or we lose rankings. Titles and descriptions from Yoast
are in `migration/export/seo.json`.

Note: the WordPress homepage has **no meta description** today — fix in the rebuild.

| Current URL | New URL |
|---|---|
| `/` | `/` |
| `/group-home/discover-villa-los-olivos` | `/villa-los-olivos/` |
| `/losolivos-rooms-list` | `/villa-los-olivos/rooms/` |
| `/losolivos-amenities` | `/villa-los-olivos/amenities/` |
| `/losolivos-gallery` | `/villa-los-olivos/gallery/` |
| `/losolivos-things-to-do` | `/villa-los-olivos/things-to-do/` |
| `/losolivos-contact-us` | `/villa-los-olivos/contact/` |
| `/group-home/homepage-la-playa-calahonda` | `/villa-la-playa-calahonda/` |
| `/rooms-list-la-playa-calahonda` | `/villa-la-playa-calahonda/rooms/` |
| `/amenities-la-playa-calahonda` | `/villa-la-playa-calahonda/amenities/` |
| `/gallery-la-playa-calahonda` | `/villa-la-playa-calahonda/gallery/` |
| `/things-to-do-la-playa-calahonda` | `/villa-la-playa-calahonda/things-to-do/` |
| `/contact-us-la-playa-calahonda` | `/villa-la-playa-calahonda/contact/` |
| `/blog` | `/blog/` |
| `/blog/<slug>` | `/blog/<slug>/` (unchanged) |
| `/blog/category/<cat>` | `/blog/category/<cat>/` |
| `/blog/tag/<tag>` | `/blog/` |
| `/checking` | to confirm — looks like an internal/test page; likely `noindex` or drop |

Proposed new URLs are a suggestion — confirm before building.
