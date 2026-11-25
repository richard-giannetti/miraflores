import type { ImageMetadata } from "astro";
import { pick, type L, type Lang } from "../i18n";
import { experienceImage as img, asset } from "./villas";

interface Item { title: L; text: L; image: { src: ImageMetadata; alt: L }; link?: { href: string; label: L } }

const inVilla: Item[] = [
  {
    title: { en: "Private chef", es: "Chef privado" },
    text: { en: "Enjoy exquisite meals cooked to your taste by a private chef, right at the villa.", es: "Disfruta de comidas exquisitas preparadas a tu gusto por un chef privado, en la propia villa." },
    image: { src: img("private-chef"), alt: { en: "Jamón ibérico and Spanish tapas", es: "Jamón ibérico y tapas españolas" } },
  },
  {
    title: { en: "Wellness", es: "Bienestar" },
    text: { en: "Spa treatments, yoga sessions and holistic activities, arranged at the villa for a truly restful escape.", es: "Tratamientos de spa, sesiones de yoga y actividades holísticas en la villa, para una escapada de auténtico descanso." },
    image: { src: asset("los-olivos/wellness"), alt: { en: "Relaxing by the pool", es: "Relax junto a la piscina" } },
  },
  {
    title: { en: "Private events", es: "Eventos privados" },
    text: { en: "Celebrations, corporate retreats and gatherings. Contact us to plan a memorable event at the villa.", es: "Celebraciones, retiros de empresa y reuniones. Contáctanos para organizar un evento inolvidable en la villa." },
    image: { src: img("events"), alt: { en: "Evening event at the villa", es: "Evento nocturno en la villa" } },
  },
];

const nearby: { group: L; items: Item[] }[] = [
  {
    group: { en: "For the lazy days", es: "Para los días de relax" },
    items: [
      {
        title: { en: "Beaches and coves", es: "Playas y calas" },
        text: { en: "The Costa Tropical's beaches and hidden coves are a short drive away, with turquoise water all summer. We know the best spots and can arrange private boat trips.", es: "Las playas y calas escondidas de la Costa Tropical están a pocos minutos en coche, con agua turquesa todo el verano. Conocemos los mejores rincones y podemos organizar paseos privados en barco." },
        image: { src: img("beaches"), alt: { en: "Turquoise cove on the Costa Tropical", es: "Cala de agua turquesa en la Costa Tropical" } },
      },
    ],
  },
  {
    group: { en: "For the culture lover", es: "Para los amantes de la cultura" },
    items: [
      {
        title: { en: "Granada and the Alhambra", es: "Granada y la Alhambra" },
        text: { en: "Granada is about 45 minutes away. Explore the Alhambra and the Albaicín, with a private guide if you like. We are happy to arrange your day.", es: "Granada está a unos 45 minutos. Descubre la Alhambra y el Albaicín, con guía privado si lo prefieres. Estaremos encantados de organizarte el día." },
        image: { src: img("granada"), alt: { en: "The Alhambra in Granada", es: "La Alhambra de Granada" } },
        link: { href: "https://alhambra-entradas.org/en", label: { en: "Alhambra tickets", es: "Entradas a la Alhambra" } },
      },
      {
        title: { en: "Nerja and Frigiliana", es: "Nerja y Frigiliana" },
        text: { en: "A full-day trip to the town of Nerja, its famous caves, and the white village of Frigiliana.", es: "Una excursión de un día a Nerja, sus famosas cuevas y el pueblo blanco de Frigiliana." },
        image: { src: img("nerja"), alt: { en: "Nerja on the coast", es: "Nerja junto al mar" } },
        link: { href: "https://entradas.cuevadenerja.es/en-ES/152/5831?source=bm", label: { en: "Nerja Caves tickets", es: "Entradas a la Cueva de Nerja" } },
      },
      {
        title: { en: "The Alpujarra", es: "La Alpujarra" },
        text: { en: "A half-day trip to the mountain villages of Capileira and Pampaneira, with terraced landscapes and centuries-old Moorish traditions.", es: "Una excursión de medio día a los pueblos de montaña de Capileira y Pampaneira, con paisajes de bancales y tradiciones moriscas centenarias." },
        image: { src: img("alpujarra"), alt: { en: "White village in the Alpujarra", es: "Pueblo blanco de la Alpujarra" } },
      },
    ],
  },
  {
    group: { en: "For the sports enthusiast", es: "Para los amantes del deporte" },
    items: [
      {
        title: { en: "Water sports", es: "Deportes acuáticos" },
        text: { en: "Windsurfing, kitesurfing, sailing, diving and snorkelling in the clear water off Motril.", es: "Windsurf, kitesurf, vela, buceo y snorkel en las aguas cristalinas de Motril." },
        image: { src: img("water-sports"), alt: { en: "Water sports on the Costa Tropical", es: "Deportes acuáticos en la Costa Tropical" } },
      },
      {
        title: { en: "Tennis and padel", es: "Tenis y pádel" },
        text: { en: "Motril's tennis and padel clubs welcome players of every level.", es: "Los clubes de tenis y pádel de Motril reciben a jugadores de todos los niveles." },
        image: { src: img("padel"), alt: { en: "Padel court in Motril", es: "Pista de pádel en Motril" } },
      },
      {
        title: { en: "Golf", es: "Golf" },
        text: { en: "Los Moriscos Golf Club is an 18-hole course with views of the Mediterranean and the Sierra Nevada.", es: "El club de golf Los Moriscos es un campo de 18 hoyos con vistas al Mediterráneo y a Sierra Nevada." },
        image: { src: img("golf"), alt: { en: "Los Moriscos golf course", es: "Campo de golf Los Moriscos" } },
        link: { href: "https://www.moriscosgolf.com/es/", label: { en: "Los Moriscos Golf", es: "Golf Los Moriscos" } },
      },
    ],
  },
  {
    group: { en: "For the foodies", es: "Para los amantes de la gastronomía" },
    items: [
      {
        title: { en: "Málaga's espetos", es: "Los espetos de Málaga" },
        text: { en: "Fresh sardines grilled on skewers over an open fire, right on the beach: a taste of the Mediterranean.", es: "Sardinas frescas ensartadas y asadas al fuego en la misma playa: todo el sabor del Mediterráneo." },
        image: { src: img("malaga-espetos"), alt: { en: "Sardine espetos grilling on the beach", es: "Espetos de sardinas asándose en la playa" } },
      },
      {
        title: { en: "Granada's tapas", es: "Las tapas de Granada" },
        text: { en: "Traditional Spanish flavours with Moorish influences: tapas, rich stews and sweets like the famous torta de la Virgen.", es: "Sabores tradicionales con influencia morisca: tapas, guisos contundentes y dulces como la famosa torta de la Virgen." },
        image: { src: img("granada-food"), alt: { en: "Tapas in Granada", es: "Tapas en Granada" } },
      },
      {
        title: { en: "Around Villa Los Olivos", es: "Alrededor de Villa Los Olivos" },
        text: { en: "Our top local picks, like La Roka, and other hidden gems that will make you feel like a local.", es: "Nuestros sitios favoritos de la zona, como La Roka, y otros rincones escondidos que te harán sentir como un vecino más." },
        image: { src: img("la-roka"), alt: { en: "La Roka restaurant", es: "Restaurante La Roka" } },
        link: { href: "https://www.laroka.es/", label: { en: "La Roka", es: "La Roka" } },
      },
    ],
  },
];

export const getExperiences = (lang: Lang) => ({ inVilla: pick(inVilla, lang), nearby: pick(nearby, lang) });
