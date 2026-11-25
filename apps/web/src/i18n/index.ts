import type { ImageMetadata } from "astro";

export type Lang = "en" | "es";
export const langs: Lang[] = ["en", "es"];
export const htmlLang: Record<Lang, string> = { en: "en-GB", es: "es-ES" };
export const ogLocale: Record<Lang, string> = { en: "en_GB", es: "es_ES" };
export const dateLocale: Record<Lang, string> = { en: "en-GB", es: "es-ES" };
export const langName: Record<Lang, string> = { en: "English", es: "Español" };

// A piece of text in both languages. `pick` resolves a data tree to one language.
export type L = { en: string; es: string };
export type Resolved<T> = T extends L
  ? string
  : T extends ImageMetadata
    ? T
    : T extends (infer U)[]
      ? Resolved<U>[]
      : T extends object
        ? { [K in keyof T]: Resolved<T[K]> }
        : T;

const isL = (v: unknown): v is L =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 2 && "en" in v && "es" in v;

export function pick<T>(value: T, lang: Lang): Resolved<T> {
  if (isL(value)) return value[lang] as Resolved<T>;
  if (Array.isArray(value)) return value.map((v) => pick(v, lang)) as Resolved<T>;
  if (typeof value === "object" && value !== null && !("format" in value && "src" in value && "width" in value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pick(v, lang)])) as Resolved<T>;
  }
  return value as Resolved<T>;
}

// ---- URLs ----

const prefix = (lang: Lang) => (lang === "en" ? "" : "/es");

export const paths = {
  home: { en: "/", es: "/es/" },
  thingsToDo: { en: "/things-to-do-costa-tropical/", es: "/es/que-hacer-costa-tropical/" },
  contact: { en: "/contact/", es: "/es/contacto/" },
  blog: { en: "/blog/", es: "/es/blog/" },
} satisfies Record<string, Record<Lang, string>>;

export type VillaPage = "overview" | "rooms" | "amenities" | "gallery";
const villaSub: Record<VillaPage, L> = {
  overview: { en: "", es: "" },
  rooms: { en: "rooms/", es: "habitaciones/" },
  amenities: { en: "amenities/", es: "servicios/" },
  gallery: { en: "gallery/", es: "galeria/" },
};
export const villaSubSlug = (page: Exclude<VillaPage, "overview">, lang: Lang) => villaSub[page][lang].replace("/", "");
export const villaPath = (lang: Lang, slug: string, page: VillaPage = "overview") =>
  `${prefix(lang)}/${slug}/${villaSub[page][lang]}`;
export const villaAlternates = (slug: string, page: VillaPage) =>
  ({ en: villaPath("en", slug, page), es: villaPath("es", slug, page) });

export const categories: Record<string, { slug: L; name: L }> = {
  beach: { slug: { en: "beach", es: "playas" }, name: { en: "Beaches", es: "Playas" } },
  canyoning: { slug: { en: "canyoning", es: "barranquismo" }, name: { en: "Canyoning", es: "Barranquismo" } },
  "day-trips": { slug: { en: "day-trips", es: "excursiones" }, name: { en: "Day trips", es: "Excursiones" } },
};
export const categoryPath = (lang: Lang, key: string) =>
  lang === "en" ? `/blog/category/${categories[key].slug.en}/` : `/es/blog/categoria/${categories[key].slug.es}/`;
export const postPath = (lang: Lang, slug: string) => `${paths.blog[lang]}${slug}/`;

// ---- Interface text ----

export const ui = {
  nav: {
    thingsToDo: { en: "Things to do", es: "Qué hacer" },
    blog: { en: "Blog", es: "Blog" },
    contact: { en: "Contact", es: "Contacto" },
  },
  villaNav: {
    overview: { en: "Overview", es: "La villa" },
    rooms: { en: "Rooms", es: "Habitaciones" },
    amenities: { en: "Amenities", es: "Servicios" },
    gallery: { en: "Gallery", es: "Galería" },
  },
  menu: { en: "Menu", es: "Menú" },
  bookAirbnb: { en: "Book on Airbnb", es: "Reservar en Airbnb" },
  googleMaps: { en: "See on Google Maps", es: "Ver en Google Maps" },
  contactUs: { en: "Contact us", es: "Contáctanos" },
  bookCta: {
    eyebrow: { en: "Book your stay", es: "Reserva tu estancia" },
    title: { en: "Book your stay at", es: "Reserva tu estancia en" },
    lead: { en: "Book directly on Airbnb, or write to us and we'll help you plan your getaway.", es: "Reserva directamente en Airbnb o escríbenos y te ayudamos a planificar tu escapada." },
  },
  reviews: {
    villaTitle: { en: "What guests say about", es: "Lo que dicen los huéspedes de" },
    contactTitle: { en: "Don't take our word for it", es: "No lo decimos solo nosotros" },
  },
  footer: {
    about: { en: "Family-run luxury holiday villas on Spain's Costa Tropical, between Málaga and Granada.", es: "Villas vacacionales de lujo gestionadas por nuestra familia en la Costa Tropical, entre Málaga y Granada." },
    getInTouch: { en: "Get in touch", es: "Contacto" },
  },
  notFound: {
    title: { en: "Page not found", es: "Página no encontrada" },
    lead: { en: "The page you're looking for has moved or doesn't exist.", es: "La página que buscas se ha movido o no existe." },
    home: { en: "Home", es: "Inicio" },
  },
  home: { en: "Home", es: "Inicio" },
  switchTo: { en: "Ver en español", es: "View in English" },
};

export const t = (lang: Lang) => pick(ui, lang);
