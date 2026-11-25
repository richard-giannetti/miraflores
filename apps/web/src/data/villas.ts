import type { ImageMetadata } from "astro";

const img = import.meta.glob<{ default: ImageMetadata }>("../assets/**/*.{jpg,png}", { eager: true });
const a = (p: string) => {
  const m = img[`../assets/${p}.jpg`] ?? img[`../assets/${p}.png`];
  if (!m) throw new Error(`Missing image: ${p}`);
  return m.default;
};

export interface Photo { src: ImageMetadata; alt: string }
export interface Feature { title: string; text: string; image: Photo }
export interface RoomType { name: string; note?: string; features: string[] }

export interface Villa {
  slug: string;
  name: string;
  locality: string;
  tagline: string;
  seoTitle: string;
  seoDescription: string;
  summary: string;
  hero: Photo;
  cover: Photo;
  intro: string[];
  highlights: Feature[];
  facts: { suites: number; guests: string };
  keyAmenities: string[];
  amenitiesIntro: string;
  rooms: { intro: string; types: RoomType[]; image: Photo };
  poolBlurb: string;
  poolAmenities: string[];
  gallery: { title: string; photos: Photo[] }[];
  booking: { airbnb: string; vrbo?: string };
  sister: string;
}

export const villas: Villa[] = [
  {
    slug: "villa-los-olivos",
    name: "Villa Los Olivos",
    locality: "Motril",
    tagline: "Luxury villa with infinity pool and sea views above Motril",
    seoTitle: "Villa Los Olivos — Luxury Villa with Infinity Pool, Motril",
    seoDescription:
      "Family-run luxury villa above Motril: 7 en-suite rooms for up to 15 guests, infinity pool, rooftop jacuzzi and views of the Mediterranean and Sierra Nevada.",
    summary:
      "Perched in the hills overlooking Motril, Villa Los Olivos offers breathtaking panoramic views of the Mediterranean Sea and the Sierra Nevada mountains.",
    hero: { src: a("los-olivos/living"), alt: "Infinity pool at Villa Los Olivos overlooking the Mediterranean and Motril" },
    cover: { src: a("los-olivos/pool-view"), alt: "Infinity pool and terrace with sea views at Villa Los Olivos" },
    intro: [
      "Nestled in the captivating landscape of the Costa Tropical, Villa Los Olivos is more than a destination: it is a haven built on our family's passion for hospitality, set among olive, avocado and mango groves above Motril.",
      "As a family-run home we offer full services, such as cleaning and cooking, for a stay filled with comfort, care and a warm, welcoming atmosphere.",
      "The Costa Tropical's famously mild climate promises sun-drenched days all year round. Your journey into Spain's coastal paradise begins here.",
    ],
    highlights: [
      {
        title: "Panoramic views",
        text: "From the hills above Motril, look out over the Mediterranean Sea on one side and the Sierra Nevada mountains on the other.",
        image: { src: a("los-olivos/terrace"), alt: "Living room with panoramic windows over the sea" },
      },
      {
        title: "Comfortable rooms",
        text: "Spacious, individually decorated suites, each with its own bathroom and air conditioning.",
        image: { src: a("los-olivos/room-feature"), alt: "Bright suite at Villa Los Olivos" },
      },
      {
        title: "Full amenities",
        text: "An infinity pool, a rooftop jacuzzi with views, and on-site services like cleaning and cooking.",
        image: { src: a("los-olivos/cover"), alt: "Sun loungers beside the pool" },
      },
    ],
    facts: { suites: 7, guests: "Up to 15 guests (more on request)" },
    keyAmenities: ["Infinity pool", "Rooftop jacuzzi", "Wi-Fi", "Free parking", "Fully equipped kitchen", "Bar and terrace with views", "Air conditioning", "Cleaning and cooking services"],
    amenitiesIntro:
      "Every detail at Villa Los Olivos has been chosen by our family, for a personally curated stay with an infinity pool, a rooftop jacuzzi and gardens with views to the sea.",
    rooms: {
      intro:
        "Seven suites, each with its own design, blending comfort with elegance. Every room has an en-suite bathroom, air conditioning, Wi-Fi and access to the garden.",
      types: [
        { name: "The Master Suite", features: ["King-size bed", "Bathtub", "En-suite bathroom", "Air conditioning", "Garden access", "Wi-Fi"] },
        { name: "The 4 Suites", features: ["King-size bed", "En-suite bathroom", "Air conditioning", "Garden access", "Wi-Fi"] },
        { name: "The 2 Double Suites", note: "On request only", features: ["2 king-size beds in each suite", "En-suite bathroom", "Air conditioning", "Garden access", "Wi-Fi"] },
      ],
      image: { src: a("los-olivos/kitchen"), alt: "Suite with king-size bed at Villa Los Olivos" },
    },
    poolBlurb:
      "Relax by the infinity pool or in the rooftop jacuzzi, with breathtaking views to soothe your soul. Padel, tennis, golf and the beach are all a few minutes' drive away.",
    poolAmenities: ["Infinity pool", "Jacuzzi with views", "Cocktails with a view"],
    gallery: [
      { title: "The outdoors", photos: [
        { src: a("los-olivos/living"), alt: "Infinity pool overlooking Motril and the sea" },
        { src: a("los-olivos/pool-view"), alt: "Infinity pool and terrace" },
        { src: a("los-olivos/welcome-2"), alt: "Outdoor dining terrace" },
        { src: a("los-olivos/outdoors"), alt: "Lounge area on the lawn with mountain views" },
        { src: a("los-olivos/cover"), alt: "Sun loungers beside the pool" },
        { src: a("los-olivos/wellness"), alt: "Sun loungers with views" },
      ] },
      { title: "The indoors", photos: [
        { src: a("los-olivos/terrace"), alt: "Living room with panoramic windows" },
        { src: a("los-olivos/terrace-2"), alt: "Dining room with sea views" },
        { src: a("los-olivos/welcome"), alt: "Entrance hall" },
        { src: a("los-olivos/hero"), alt: "Hallway and kitchen" },
        { src: a("los-olivos/amenities-feature"), alt: "Local olive oil and wine" },
      ] },
      { title: "The rooms", photos: [
        { src: a("los-olivos/room-feature"), alt: "Suite" },
        { src: a("los-olivos/kitchen"), alt: "Suite with king-size bed" },
        { src: a("los-olivos/suite"), alt: "En-suite bathroom" },
      ] },
      { title: "More from the villa", photos: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => (
        { src: a(`los-olivos/gallery-${n}`), alt: "Villa Los Olivos" }
      )) },
    ],
    booking: { airbnb: "https://airbnb.com/h/losolivosmiraflores", vrbo: "https://www.vrbo.com/es-es/p11449241" },
    sister: "villa-la-playa-calahonda",
  },
  {
    slug: "villa-la-playa-calahonda",
    name: "Villa La Playa",
    locality: "Calahonda",
    tagline: "Luxury beach house with rooftop jacuzzi in Calahonda",
    seoTitle: "Villa La Playa — Beachfront Holiday Villa in Calahonda",
    seoDescription:
      "Family-run beachfront villa in Calahonda on the Costa Tropical: 4 en-suite suites for up to 8 guests, rooftop jacuzzi and terrace with panoramic Mediterranean views.",
    summary:
      "Located on the beachfront in Calahonda, Villa La Playa offers breathtaking views from its rooftop jacuzzi and direct access to some of the most beautiful beaches in the south of Spain.",
    hero: { src: a("la-playa/rooftop"), alt: "Rooftop jacuzzi at Villa La Playa overlooking Calahonda beach" },
    cover: { src: a("la-playa/beachfront"), alt: "Drinks on the terrace overlooking the sea at Villa La Playa" },
    intro: [
      "Set along the stunning coastline of the Costa Tropical, Villa La Playa is more than a getaway: it is a sanctuary built with our family's love for hospitality, right on the sun-kissed shore of Calahonda.",
      "As a family-run home, we are committed to making your stay unforgettable, with comfort, personal care and a warm, welcoming atmosphere.",
      "Bask in the Costa Tropical's inviting climate, where sunshine and sea breezes greet you every day.",
    ],
    highlights: [
      {
        title: "Beachfront",
        text: "Right in front of the Calahonda beaches, with panoramic views of the Mediterranean Sea.",
        image: { src: a("la-playa/rooftop-2"), alt: "Rooftop terrace and the Calahonda coastline" },
      },
      {
        title: "Comfortable rooms",
        text: "Spacious, elegantly decorated suites, each a sanctuary of comfort and style.",
        image: { src: a("la-playa/room-feature"), alt: "Suite at Villa La Playa" },
      },
      {
        title: "Full amenities",
        text: "A rooftop jacuzzi with sea views, a bar and terrace, and everything you need to unwind.",
        image: { src: a("la-playa/hero"), alt: "Covered terrace lounge at Villa La Playa" },
      },
    ],
    facts: { suites: 4, guests: "Up to 8 guests" },
    keyAmenities: ["Rooftop jacuzzi", "Beachfront location", "Wi-Fi", "Parking", "Fully equipped kitchen", "Bar and terrace with views", "Air conditioning"],
    amenitiesIntro:
      "Every detail at Villa La Playa has been chosen by our family, for a personally curated stay steps from the beach, with a rooftop jacuzzi and terrace made for sunsets.",
    rooms: {
      intro:
        "Four suites, each with its own design, blending comfort with elegance. Every suite has a king-size bed, an en-suite bathroom, air conditioning and Wi-Fi.",
      types: [
        { name: "The 4 Suites", features: ["King-size bed", "En-suite bathroom", "Air conditioning", "Wi-Fi", "Garden access"] },
      ],
      image: { src: a("la-playa/indoors"), alt: "Suite at Villa La Playa" },
    },
    poolBlurb:
      "Relax in the rooftop jacuzzi with views over the Mediterranean, or step straight out to the beach. Padel, tennis and water sports are a few minutes away.",
    poolAmenities: ["Rooftop jacuzzi", "Rooftop terrace", "Cocktails with a view"],
    gallery: [
      { title: "The outdoors", photos: [
        { src: a("la-playa/rooftop"), alt: "Rooftop jacuzzi with sea views" },
        { src: a("la-playa/beachfront"), alt: "Terrace overlooking the beach" },
        { src: a("la-playa/hero"), alt: "Covered terrace lounge" },
        { src: a("la-playa/outdoors"), alt: "Patio with seating" },
        { src: a("la-playa/lounge"), alt: "Patio with barbecue" },
      ] },
      { title: "The indoors", photos: [
        { src: a("la-playa/terrace"), alt: "Living room" },
        { src: a("la-playa/living"), alt: "Dining area" },
        { src: a("la-playa/getting-there"), alt: "Fully equipped kitchen" },
        { src: a("la-playa/decor"), alt: "Kitchen details" },
        { src: a("la-playa/room"), alt: "Decoration details" },
      ] },
      { title: "The rooms", photos: [
        { src: a("la-playa/room-feature"), alt: "Suite with sea view" },
        { src: a("la-playa/indoors"), alt: "Suite with king-size bed" },
        { src: a("la-playa/suite"), alt: "Wardrobe and storage" },
      ] },
    ],
    booking: { airbnb: "https://airbnb.com/h/laplayamiraflores" },
    sister: "villa-los-olivos",
  },
];

export const getVilla = (slug: string) => {
  const v = villas.find((v) => v.slug === slug);
  if (!v) throw new Error(`Unknown villa: ${slug}`);
  return v;
};

// Shared by both villas
export const amenityDetails = [
  { title: "Handpicked perfection", text: "Every detail has been chosen by us, for a personally curated experience." },
  { title: "Tranquil haven", text: "Every corner is designed for peace and quiet, a true escape." },
  { title: "Flexible check-in & check-out", text: "Call us and someone will be there to welcome you." },
  { title: "Privacy, with help a call away", text: "We respect your privacy and give you space to enjoy your stay, while we are only a message or call away for anything you need." },
  { title: "Jacuzzi and terrace with views", text: "The rooftop jacuzzi and terrace are perfect for sunset lovers or a peaceful yoga session." },
  { title: "Fully equipped kitchen", text: "A modern, spacious kitchen with easy access to the outdoor dining area, perfect for meals al fresco." },
  { title: "Missing something?", text: "Call us any time and we will do our best to make sure you have everything you need." },
];

export const familyPhoto: Photo = { src: a("family"), alt: "The Miraflores family" };
export const logo = a("brand/logo");
export const emblem = a("brand/emblem");
export const experienceImage = (name: string) => a(`experiences/${name}`);
export const asset = a;
