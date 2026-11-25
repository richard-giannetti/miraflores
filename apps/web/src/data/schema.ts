import { getImage } from "astro:assets";
import { site } from "./site";
import type { Villa } from "./villas";
import { villaPath, type Lang } from "../i18n";

const abs = (p: string) => new URL(p, site.url).href;

export async function villaSchema(villa: Villa, lang: Lang) {
  const images = await Promise.all(
    [villa.hero, villa.cover, ...villa.highlights.map((h) => h.image)].map(async (p) =>
      abs((await getImage({ src: p.src, width: 1600, format: "jpg" })).src),
    ),
  );
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": abs(`/${villa.slug}/#lodging`),
    name: villa.name,
    description: villa.seoDescription,
    url: abs(villaPath(lang, villa.slug)),
    image: images,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      addressLocality: villa.locality,
      addressRegion: "Granada",
      addressCountry: "ES",
    },
    numberOfRooms: villa.facts.suites,
    amenityFeature: villa.keyAmenities.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
    sameAs: [villa.booking.airbnb],
  };
}
