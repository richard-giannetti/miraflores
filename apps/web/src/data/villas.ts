import type { ImageMetadata } from "astro";
import { pick, type L, type Lang, type Resolved } from "../i18n";

const img = import.meta.glob<{ default: ImageMetadata }>("../assets/**/*.{jpg,png}", { eager: true });
const a = (p: string) => {
  const m = img[`../assets/${p}.jpg`] ?? img[`../assets/${p}.png`];
  if (!m) throw new Error(`Missing image: ${p}`);
  return m.default;
};

interface PhotoData { src: ImageMetadata; alt: L }
interface VillaData {
  slug: string;
  name: string;
  locality: string;
  tagline: L;
  seoTitle: L;
  seoDescription: L;
  summary: L;
  hero: PhotoData;
  cover: PhotoData;
  intro: L[];
  highlights: { title: L; text: L; image: PhotoData }[];
  facts: { suites: number; guests: L };
  keyAmenities: L[];
  amenitiesIntro: L;
  rooms: { intro: L; types: { name: L; note?: L; features: L[] }[]; image: PhotoData };
  poolBlurb: L;
  poolAmenities: L[];
  gallery: { title: L; photos: PhotoData[] }[];
  booking: { airbnb: string };
  // Google Business Profile / Maps pin
  maps: { url: string; lat: number; lng: number };
  sister: string;
}

export type Villa = Resolved<VillaData>;
export type Photo = Resolved<PhotoData>;

// Shared phrases
const ensuite = { en: "En-suite bathroom", es: "Baño en suite" };
const ac = { en: "Air conditioning", es: "Aire acondicionado" };
const wifi = { en: "Wi-Fi", es: "Wi-Fi" };
const garden = { en: "Garden access", es: "Acceso al jardín" };
const king = { en: "King-size bed", es: "Cama king size" };
const kitchen = { en: "Fully equipped kitchen", es: "Cocina totalmente equipada" };
const bar = { en: "Bar and terrace with views", es: "Bar y terraza con vistas" };
const cocktails = { en: "Cocktails with a view", es: "Cócteles con vistas" };
const lo = { en: "Villa Los Olivos", es: "Villa Los Olivos" };

const villaData: VillaData[] = [
  {
    slug: "villa-los-olivos",
    name: "Villa Los Olivos",
    locality: "Motril",
    tagline: {
      en: "Luxury villa with infinity pool and sea views above Motril",
      es: "Villa de lujo con piscina infinita y vistas al mar sobre Motril",
    },
    seoTitle: {
      en: "Villa Los Olivos — Luxury Villa with Infinity Pool, Motril",
      es: "Villa Los Olivos — Villa de lujo con piscina infinita, Motril",
    },
    seoDescription: {
      en: "Family-run luxury villa above Motril: 7 en-suite rooms for up to 15 guests, infinity pool, rooftop jacuzzi and views of the Mediterranean and Sierra Nevada.",
      es: "Villa familiar de lujo sobre Motril: 7 suites para hasta 15 personas, piscina infinita, jacuzzi en la azotea y vistas al Mediterráneo y Sierra Nevada.",
    },
    summary: {
      en: "Perched in the hills overlooking Motril, Villa Los Olivos offers breathtaking panoramic views of the Mediterranean Sea and the Sierra Nevada mountains.",
      es: "En las colinas que dominan Motril, Villa Los Olivos ofrece impresionantes vistas panorámicas al mar Mediterráneo y a Sierra Nevada.",
    },
    hero: { src: a("los-olivos/living"), alt: { en: "Infinity pool at Villa Los Olivos overlooking the Mediterranean and Motril", es: "Piscina infinita de Villa Los Olivos con vistas al Mediterráneo y a Motril" } },
    cover: { src: a("los-olivos/pool-view"), alt: { en: "Infinity pool and terrace with sea views at Villa Los Olivos", es: "Piscina infinita y terraza con vistas al mar en Villa Los Olivos" } },
    intro: [
      {
        en: "Nestled in the captivating landscape of the Costa Tropical, Villa Los Olivos is more than a destination: it is a haven built on our family's passion for hospitality, set among olive, avocado and mango groves above Motril.",
        es: "En el cautivador paisaje de la Costa Tropical, Villa Los Olivos es mucho más que un destino: es un refugio construido sobre la pasión de nuestra familia por la hospitalidad, entre olivos, aguacates y mangos sobre Motril.",
      },
      {
        en: "As a family-run home we offer full services, such as cleaning and cooking, for a stay filled with comfort, care and a warm, welcoming atmosphere.",
        es: "Como casa familiar, ofrecemos servicios completos, como limpieza y cocina, para una estancia llena de comodidad, atención y un ambiente cálido y acogedor.",
      },
      {
        en: "The Costa Tropical's famously mild climate promises sun-drenched days all year round. Your journey into Spain's coastal paradise begins here.",
        es: "El famoso clima suave de la Costa Tropical promete días de sol durante todo el año. Tu viaje al paraíso costero de España empieza aquí.",
      },
    ],
    highlights: [
      {
        title: { en: "Panoramic views", es: "Vistas panorámicas" },
        text: {
          en: "From the hills above Motril, look out over the Mediterranean Sea on one side and the Sierra Nevada mountains on the other.",
          es: "Desde las colinas de Motril, contempla el mar Mediterráneo a un lado y las montañas de Sierra Nevada al otro.",
        },
        image: { src: a("los-olivos/terrace"), alt: { en: "Living room with panoramic windows over the sea", es: "Salón con ventanales panorámicos sobre el mar" } },
      },
      {
        title: { en: "Comfortable rooms", es: "Habitaciones confortables" },
        text: {
          en: "Spacious, individually decorated suites, each with its own bathroom and air conditioning.",
          es: "Suites amplias y decoradas de forma única, cada una con su propio baño y aire acondicionado.",
        },
        image: { src: a("los-olivos/room-feature"), alt: { en: "Bright suite at Villa Los Olivos", es: "Suite luminosa en Villa Los Olivos" } },
      },
      {
        title: { en: "Full amenities", es: "Todos los servicios" },
        text: {
          en: "An infinity pool, a rooftop jacuzzi with views, and on-site services like cleaning and cooking.",
          es: "Piscina infinita, jacuzzi con vistas en la azotea y servicios en la villa como limpieza y cocina.",
        },
        image: { src: a("los-olivos/cover"), alt: { en: "Sun loungers beside the pool", es: "Tumbonas junto a la piscina" } },
      },
    ],
    facts: { suites: 7, guests: { en: "Up to 15 guests (more on request)", es: "Hasta 15 personas (más bajo petición)" } },
    keyAmenities: [
      { en: "Infinity pool", es: "Piscina infinita" },
      { en: "Rooftop jacuzzi", es: "Jacuzzi en la azotea" },
      wifi,
      { en: "Free parking", es: "Aparcamiento gratuito" },
      kitchen,
      bar,
      ac,
      { en: "Cleaning and cooking services", es: "Servicio de limpieza y cocina" },
    ],
    amenitiesIntro: {
      en: "Every detail at Villa Los Olivos has been chosen by our family, for a personally curated stay with an infinity pool, a rooftop jacuzzi and gardens with views to the sea.",
      es: "Cada detalle de Villa Los Olivos ha sido elegido por nuestra familia, para una estancia cuidada al detalle con piscina infinita, jacuzzi en la azotea y jardines con vistas al mar.",
    },
    rooms: {
      intro: {
        en: "Seven suites, each with its own design, blending comfort with elegance. Every room has an en-suite bathroom, air conditioning, Wi-Fi and access to the garden.",
        es: "Siete suites, cada una con su propio diseño, que combinan comodidad y elegancia. Todas tienen baño en suite, aire acondicionado, Wi-Fi y acceso al jardín.",
      },
      types: [
        { name: { en: "The Master Suite", es: "La suite principal" }, features: [king, { en: "Bathtub", es: "Bañera" }, ensuite, ac, garden, wifi] },
        { name: { en: "The 4 Suites", es: "Las 4 suites" }, features: [king, ensuite, ac, garden, wifi] },
        {
          name: { en: "The 2 Double Suites", es: "Las 2 suites dobles" },
          note: { en: "On request only", es: "Solo bajo petición" },
          features: [{ en: "2 king-size beds in each suite", es: "2 camas king size en cada suite" }, ensuite, ac, garden, wifi],
        },
      ],
      image: { src: a("los-olivos/kitchen"), alt: { en: "Suite with king-size bed at Villa Los Olivos", es: "Suite con cama king size en Villa Los Olivos" } },
    },
    poolBlurb: {
      en: "Relax by the infinity pool or in the rooftop jacuzzi, with breathtaking views to soothe your soul. Padel, tennis, golf and the beach are all a few minutes' drive away.",
      es: "Relájate junto a la piscina infinita o en el jacuzzi de la azotea, con vistas impresionantes. El pádel, el tenis, el golf y la playa están a pocos minutos en coche.",
    },
    poolAmenities: [{ en: "Infinity pool", es: "Piscina infinita" }, { en: "Jacuzzi with views", es: "Jacuzzi con vistas" }, cocktails],
    gallery: [
      { title: { en: "The outdoors", es: "El exterior" }, photos: [
        { src: a("los-olivos/living"), alt: { en: "Infinity pool overlooking Motril and the sea", es: "Piscina infinita con vistas a Motril y al mar" } },
        { src: a("los-olivos/pool-view"), alt: { en: "Infinity pool and terrace", es: "Piscina infinita y terraza" } },
        { src: a("los-olivos/welcome-2"), alt: { en: "Outdoor dining terrace", es: "Comedor exterior en la terraza" } },
        { src: a("los-olivos/outdoors"), alt: { en: "Lounge area on the lawn with mountain views", es: "Zona de descanso en el césped con vistas a la montaña" } },
        { src: a("los-olivos/cover"), alt: { en: "Sun loungers beside the pool", es: "Tumbonas junto a la piscina" } },
        { src: a("los-olivos/wellness"), alt: { en: "Sun loungers with views", es: "Tumbonas con vistas" } },
      ] },
      { title: { en: "The indoors", es: "El interior" }, photos: [
        { src: a("los-olivos/terrace"), alt: { en: "Living room with panoramic windows", es: "Salón con ventanales panorámicos" } },
        { src: a("los-olivos/terrace-2"), alt: { en: "Dining room with sea views", es: "Comedor con vistas al mar" } },
        { src: a("los-olivos/welcome"), alt: { en: "Entrance hall", es: "Recibidor" } },
        { src: a("los-olivos/hero"), alt: { en: "Hallway and kitchen", es: "Pasillo y cocina" } },
        { src: a("los-olivos/amenities-feature"), alt: { en: "Local olive oil and wine", es: "Aceite de oliva y vino locales" } },
      ] },
      { title: { en: "The rooms", es: "Las habitaciones" }, photos: [
        { src: a("los-olivos/room-feature"), alt: { en: "Suite", es: "Suite" } },
        { src: a("los-olivos/kitchen"), alt: { en: "Suite with king-size bed", es: "Suite con cama king size" } },
        { src: a("los-olivos/suite"), alt: { en: "En-suite bathroom", es: "Baño en suite" } },
      ] },
      { title: { en: "More from the villa", es: "Más de la villa" }, photos: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => (
        { src: a(`los-olivos/gallery-${n}`), alt: lo }
      )) },
    ],
    booking: { airbnb: "https://airbnb.com/h/losolivosmiraflores" },
    maps: { url: "https://maps.app.goo.gl/HEyGXC3AZNQHCZF3A", lat: 36.7691341, lng: -3.5293926 },
    sister: "villa-la-playa-calahonda",
  },
  {
    slug: "villa-la-playa-calahonda",
    name: "Villa La Playa",
    locality: "Calahonda",
    tagline: {
      en: "Luxury beach house with rooftop jacuzzi in Calahonda",
      es: "Casa de playa de lujo con jacuzzi en la azotea en Calahonda",
    },
    seoTitle: {
      en: "Villa La Playa — Beachfront Holiday Villa in Calahonda",
      es: "Villa La Playa — Villa vacacional en primera línea, Calahonda",
    },
    seoDescription: {
      en: "Family-run beachfront villa in Calahonda on the Costa Tropical: 4 en-suite suites for up to 8 guests, rooftop jacuzzi and terrace with panoramic Mediterranean views.",
      es: "Villa familiar en primera línea de playa en Calahonda, Costa Tropical: 4 suites para hasta 8 personas, jacuzzi en la azotea y terraza con vistas al Mediterráneo.",
    },
    summary: {
      en: "Located on the beachfront in Calahonda, Villa La Playa offers breathtaking views from its rooftop jacuzzi and direct access to some of the most beautiful beaches in the south of Spain.",
      es: "En primera línea de playa en Calahonda, Villa La Playa ofrece vistas impresionantes desde su jacuzzi en la azotea y acceso directo a algunas de las playas más bonitas del sur de España.",
    },
    hero: { src: a("la-playa/rooftop"), alt: { en: "Rooftop jacuzzi at Villa La Playa overlooking Calahonda beach", es: "Jacuzzi en la azotea de Villa La Playa con vistas a la playa de Calahonda" } },
    cover: { src: a("la-playa/beachfront"), alt: { en: "Drinks on the terrace overlooking the sea at Villa La Playa", es: "Bebidas en la terraza con vistas al mar en Villa La Playa" } },
    intro: [
      {
        en: "Set along the stunning coastline of the Costa Tropical, Villa La Playa is more than a getaway: it is a sanctuary built with our family's love for hospitality, right on the sun-kissed shore of Calahonda.",
        es: "En la impresionante costa de la Costa Tropical, Villa La Playa es mucho más que una escapada: es un refugio creado con el cariño de nuestra familia por la hospitalidad, junto a la soleada orilla de Calahonda.",
      },
      {
        en: "As a family-run home, we are committed to making your stay unforgettable, with comfort, personal care and a warm, welcoming atmosphere.",
        es: "Como casa familiar, nos comprometemos a que tu estancia sea inolvidable, con comodidad, atención personal y un ambiente cálido y acogedor.",
      },
      {
        en: "Bask in the Costa Tropical's inviting climate, where sunshine and sea breezes greet you every day.",
        es: "Disfruta del agradable clima de la Costa Tropical, donde el sol y la brisa del mar te reciben cada día.",
      },
    ],
    highlights: [
      {
        title: { en: "Beachfront", es: "Primera línea de playa" },
        text: {
          en: "Right in front of the Calahonda beaches, with panoramic views of the Mediterranean Sea.",
          es: "Justo frente a las playas de Calahonda, con vistas panorámicas al mar Mediterráneo.",
        },
        image: { src: a("la-playa/rooftop-2"), alt: { en: "Rooftop terrace and the Calahonda coastline", es: "Azotea y la costa de Calahonda" } },
      },
      {
        title: { en: "Comfortable rooms", es: "Habitaciones confortables" },
        text: {
          en: "Spacious, elegantly decorated suites, each a sanctuary of comfort and style.",
          es: "Suites amplias y elegantemente decoradas, cada una un refugio de comodidad y estilo.",
        },
        image: { src: a("la-playa/room-feature"), alt: { en: "Suite at Villa La Playa", es: "Suite en Villa La Playa" } },
      },
      {
        title: { en: "Full amenities", es: "Todos los servicios" },
        text: {
          en: "A rooftop jacuzzi with sea views, a bar and terrace, and everything you need to unwind.",
          es: "Jacuzzi en la azotea con vistas al mar, bar y terraza, y todo lo necesario para desconectar.",
        },
        image: { src: a("la-playa/hero"), alt: { en: "Covered terrace lounge at Villa La Playa", es: "Terraza cubierta con zona de estar en Villa La Playa" } },
      },
    ],
    facts: { suites: 4, guests: { en: "Up to 8 guests", es: "Hasta 8 personas" } },
    keyAmenities: [
      { en: "Rooftop jacuzzi", es: "Jacuzzi en la azotea" },
      { en: "Beachfront location", es: "Primera línea de playa" },
      wifi,
      { en: "Parking", es: "Aparcamiento" },
      kitchen,
      bar,
      ac,
    ],
    amenitiesIntro: {
      en: "Every detail at Villa La Playa has been chosen by our family, for a personally curated stay steps from the beach, with a rooftop jacuzzi and terrace made for sunsets.",
      es: "Cada detalle de Villa La Playa ha sido elegido por nuestra familia, para una estancia cuidada al detalle a pocos pasos de la playa, con jacuzzi en la azotea y una terraza hecha para los atardeceres.",
    },
    rooms: {
      intro: {
        en: "Four suites, each with its own design, blending comfort with elegance. Every suite has a king-size bed, an en-suite bathroom, air conditioning and Wi-Fi.",
        es: "Cuatro suites, cada una con su propio diseño, que combinan comodidad y elegancia. Todas tienen cama king size, baño en suite, aire acondicionado y Wi-Fi.",
      },
      types: [{ name: { en: "The 4 Suites", es: "Las 4 suites" }, features: [king, ensuite, ac, wifi, garden] }],
      image: { src: a("la-playa/indoors"), alt: { en: "Suite at Villa La Playa", es: "Suite en Villa La Playa" } },
    },
    poolBlurb: {
      en: "Relax in the rooftop jacuzzi with views over the Mediterranean, or step straight out to the beach. Padel, tennis and water sports are a few minutes away.",
      es: "Relájate en el jacuzzi de la azotea con vistas al Mediterráneo o sal directamente a la playa. El pádel, el tenis y los deportes acuáticos están a pocos minutos.",
    },
    poolAmenities: [{ en: "Rooftop jacuzzi", es: "Jacuzzi en la azotea" }, { en: "Rooftop terrace", es: "Azotea" }, cocktails],
    gallery: [
      { title: { en: "The outdoors", es: "El exterior" }, photos: [
        { src: a("la-playa/rooftop"), alt: { en: "Rooftop jacuzzi with sea views", es: "Jacuzzi en la azotea con vistas al mar" } },
        { src: a("la-playa/beachfront"), alt: { en: "Terrace overlooking the beach", es: "Terraza con vistas a la playa" } },
        { src: a("la-playa/hero"), alt: { en: "Covered terrace lounge", es: "Terraza cubierta con zona de estar" } },
        { src: a("la-playa/outdoors"), alt: { en: "Patio with seating", es: "Patio con zona de estar" } },
        { src: a("la-playa/lounge"), alt: { en: "Patio with barbecue", es: "Patio con barbacoa" } },
      ] },
      { title: { en: "The indoors", es: "El interior" }, photos: [
        { src: a("la-playa/terrace"), alt: { en: "Living room", es: "Salón" } },
        { src: a("la-playa/living"), alt: { en: "Dining area", es: "Comedor" } },
        { src: a("la-playa/getting-there"), alt: { en: "Fully equipped kitchen", es: "Cocina totalmente equipada" } },
        { src: a("la-playa/decor"), alt: { en: "Kitchen details", es: "Detalles de la cocina" } },
        { src: a("la-playa/room"), alt: { en: "Decoration details", es: "Detalles decorativos" } },
      ] },
      { title: { en: "The rooms", es: "Las habitaciones" }, photos: [
        { src: a("la-playa/room-feature"), alt: { en: "Suite with sea view", es: "Suite con vistas al mar" } },
        { src: a("la-playa/indoors"), alt: { en: "Suite with king-size bed", es: "Suite con cama king size" } },
        { src: a("la-playa/suite"), alt: { en: "Wardrobe and storage", es: "Armario y almacenaje" } },
      ] },
    ],
    booking: { airbnb: "https://airbnb.com/h/laplayamiraflores" },
    maps: { url: "https://maps.app.goo.gl/68yCqmyhEyhgYCW26", lat: 36.6989339, lng: -3.4165364 },
    sister: "villa-los-olivos",
  },
];

export const getVillas = (lang: Lang): Villa[] => pick(villaData, lang);
export const getVilla = (lang: Lang, slug: string): Villa => {
  const v = getVillas(lang).find((v) => v.slug === slug);
  if (!v) throw new Error(`Unknown villa: ${slug}`);
  return v;
};
export const villaSlugs = villaData.map((v) => v.slug);

// Shared by both villas
const amenityDetailsData: { title: L; text: L }[] = [
  { title: { en: "Handpicked perfection", es: "Elegido con cariño" }, text: { en: "Every detail has been chosen by us, for a personally curated experience.", es: "Cada detalle lo hemos elegido nosotros, para una experiencia cuidada personalmente." } },
  { title: { en: "Tranquil haven", es: "Un remanso de paz" }, text: { en: "Every corner is designed for peace and quiet, a true escape.", es: "Cada rincón está pensado para la tranquilidad: una auténtica desconexión." } },
  { title: { en: "Flexible check-in & check-out", es: "Entrada y salida flexibles" }, text: { en: "Call us and someone will be there to welcome you.", es: "Llámanos y alguien estará allí para recibirte." } },
  { title: { en: "Privacy, with help a call away", es: "Privacidad, con ayuda a una llamada" }, text: { en: "We respect your privacy and give you space to enjoy your stay, while we are only a message or call away for anything you need.", es: "Respetamos tu privacidad y te damos espacio para disfrutar de tu estancia, y estamos a un mensaje o una llamada para lo que necesites." } },
  { title: { en: "Jacuzzi and terrace with views", es: "Jacuzzi y terraza con vistas" }, text: { en: "The rooftop jacuzzi and terrace are perfect for sunset lovers or a peaceful yoga session.", es: "El jacuzzi y la terraza de la azotea son perfectos para los amantes de los atardeceres o para una sesión tranquila de yoga." } },
  { title: kitchen, text: { en: "A modern, spacious kitchen with easy access to the outdoor dining area, perfect for meals al fresco.", es: "Una cocina moderna y amplia con fácil acceso al comedor exterior, perfecta para comer al aire libre." } },
  { title: { en: "Missing something?", es: "¿Te falta algo?" }, text: { en: "Call us any time and we will do our best to make sure you have everything you need.", es: "Llámanos cuando quieras y haremos todo lo posible para que tengas todo lo que necesitas." } },
];
export const getAmenityDetails = (lang: Lang) => pick(amenityDetailsData, lang);

export const getFamilyPhoto = (lang: Lang): Photo =>
  pick({ src: a("family"), alt: { en: "The Miraflores family", es: "La familia Miraflores" } }, lang);
export const logo = a("brand/logo");
export const emblem = a("brand/emblem");
export const experienceImage = (name: string) => a(`experiences/${name}`);
export const asset = a;
