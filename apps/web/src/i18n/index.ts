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
  bookDirect: {
    title: { en: "Book direct", es: "Reserva directa" },
    lead: { en: "Check availability and the best price, then send your request. We reply within a day.", es: "Consulta disponibilidad y el mejor precio y envía tu solicitud. Te respondemos en un día." },
    arrival: { en: "Arrival", es: "Llegada" },
    departure: { en: "Departure", es: "Salida" },
    adults: { en: "Adults", es: "Adultos" },
    children: { en: "Children", es: "Niños" },
    promo: { en: "Promo code (optional)", es: "Código de descuento (opcional)" },
    check: { en: "Check availability", es: "Ver disponibilidad" },
    checking: { en: "Checking…", es: "Consultando…" },
    nights: { en: "nights", es: "noches" },
    extraGuests: { en: "Extra guests", es: "Huéspedes adicionales" },
    cleaning: { en: "Cleaning", es: "Limpieza" },
    gap: { en: "Short-stay discount", es: "Descuento por estancia corta" },
    choose: { en: "Choose your rate", es: "Elige tu tarifa" },
    standard: { en: "Standard rate", es: "Tarifa normal" },
    flexible: { en: "Standard cancellation terms", es: "Condiciones de cancelación normales" },
    noRefund: { en: "No refund if you cancel", es: "Sin reembolso si cancelas" },
    total: { en: "Total, VAT and cleaning included", es: "Total, IVA y limpieza incluidos" },
    promoOk: { en: "Code applied", es: "Código aplicado" },
    promoBad: { en: "That code isn't valid", es: "Ese código no es válido" },
    name: { en: "Full name", es: "Nombre y apellidos" },
    email: { en: "Email", es: "Email" },
    phone: { en: "Phone (WhatsApp)", es: "Teléfono (WhatsApp)" },
    message: { en: "Anything we should know? (optional)", es: "¿Algo que debamos saber? (opcional)" },
    send: { en: "Send booking request", es: "Enviar solicitud de reserva" },
    sending: { en: "Sending…", es: "Enviando…" },
    noCharge: { en: "Nothing is charged now. We confirm availability and send you the payment details.", es: "No se cobra nada ahora. Confirmamos la disponibilidad y te enviamos los datos de pago." },
    sent: { en: "Thank you! We've received your request and will reply within a day.", es: "¡Gracias! Hemos recibido tu solicitud y te responderemos en un día." },
    error: { en: "Something went wrong. Please try again or write to us.", es: "Algo ha fallado. Inténtalo de nuevo o escríbenos." },
    reasons: {
      unavailable: { en: "Sorry, the villa isn't available on those dates.", es: "Lo sentimos, la villa no está disponible en esas fechas." },
      min_nights: { en: "The minimum stay for those dates is {n} nights.", es: "La estancia mínima en esas fechas es de {n} noches." },
      too_many_guests: { en: "The villa sleeps up to {n} guests.", es: "La villa admite hasta {n} huéspedes." },
      too_soon: { en: "Please book at least {n} days ahead, or write to us.", es: "Reserva con al menos {n} días de antelación, o escríbenos." },
      too_far: { en: "We can't take bookings that far ahead yet.", es: "Aún no aceptamos reservas con tanta antelación." },
      bad_dates: { en: "Please check the dates (60 nights at most).", es: "Revisa las fechas (máximo 60 noches)." },
      no_price: { en: "We don't have prices for those dates yet. Please write to us.", es: "Aún no tenemos precios para esas fechas. Escríbenos." },
      too_many: { en: "You already have requests waiting. We'll be in touch soon.", es: "Ya tienes solicitudes pendientes. Te escribiremos pronto." },
    },
  },
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
