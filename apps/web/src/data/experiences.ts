import type { ImageMetadata } from "astro";
import { experienceImage as img, asset } from "./villas";

export const inVilla = [
  {
    title: "Private chef",
    text: "Enjoy exquisite meals cooked to your taste by a private chef, right at the villa.",
    image: { src: img("private-chef"), alt: "Jamón ibérico and Spanish tapas" },
  },
  {
    title: "Wellness",
    text: "Spa treatments, yoga sessions and holistic activities, arranged at the villa for a truly restful escape.",
    image: { src: asset("los-olivos/wellness"), alt: "Relaxing by the pool" },
  },
  {
    title: "Private events",
    text: "Celebrations, corporate retreats and gatherings. Contact us to plan a memorable event at the villa.",
    image: { src: img("events"), alt: "Evening event at the villa" },
  },
];

export interface Activity { title: string; text: string; image: { src: ImageMetadata; alt: string }; link?: { href: string; label: string } }

export const nearby: { group: string; items: Activity[] }[] = [
  {
    group: "For the lazy days",
    items: [
      {
        title: "Beaches and coves",
        text: "The Costa Tropical's beaches and hidden coves are a short drive away, with turquoise water all summer. We know the best spots and can arrange private boat trips.",
        image: { src: img("beaches"), alt: "Turquoise cove on the Costa Tropical" },
      },
    ],
  },
  {
    group: "For the culture lover",
    items: [
      {
        title: "Granada and the Alhambra",
        text: "Granada is about 45 minutes away. Explore the Alhambra and the Albaicín, with a private guide if you like. We are happy to arrange your day.",
        image: { src: img("granada"), alt: "The Alhambra in Granada" },
        link: { href: "https://alhambra-entradas.org/en", label: "Alhambra tickets" },
      },
      {
        title: "Nerja and Frigiliana",
        text: "A full-day trip to the town of Nerja, its famous caves, and the white village of Frigiliana.",
        image: { src: img("nerja"), alt: "Nerja on the coast" },
        link: { href: "https://entradas.cuevadenerja.es/en-ES/152/5831?source=bm", label: "Nerja Caves tickets" },
      },
      {
        title: "The Alpujarra",
        text: "A half-day trip to the mountain villages of Capileira and Pampaneira, with terraced landscapes and centuries-old Moorish traditions.",
        image: { src: img("alpujarra"), alt: "White village in the Alpujarra" },
      },
    ],
  },
  {
    group: "For the sports enthusiast",
    items: [
      {
        title: "Water sports",
        text: "Windsurfing, kitesurfing, sailing, diving and snorkelling in the clear water off Motril.",
        image: { src: img("water-sports"), alt: "Water sports on the Costa Tropical" },
      },
      {
        title: "Tennis and padel",
        text: "Motril's tennis and padel clubs welcome players of every level.",
        image: { src: img("padel"), alt: "Padel court in Motril" },
      },
      {
        title: "Golf",
        text: "Los Moriscos Golf Club is an 18-hole course with views of the Mediterranean and the Sierra Nevada.",
        image: { src: img("golf"), alt: "Los Moriscos golf course" },
        link: { href: "https://www.moriscosgolf.com/es/", label: "Los Moriscos Golf" },
      },
    ],
  },
  {
    group: "For the foodies",
    items: [
      {
        title: "Málaga's espetos",
        text: "Fresh sardines grilled on skewers over an open fire, right on the beach: a taste of the Mediterranean.",
        image: { src: img("malaga-espetos"), alt: "Sardine espetos grilling on the beach" },
      },
      {
        title: "Granada's tapas",
        text: "Traditional Spanish flavours with Moorish influences: tapas, rich stews and sweets like the famous torta de la Virgen.",
        image: { src: img("granada-food"), alt: "Tapas in Granada" },
      },
      {
        title: "Around Villa Los Olivos",
        text: "Our top local picks, like La Roka, and other hidden gems that will make you feel like a local.",
        image: { src: img("la-roka"), alt: "La Roka restaurant" },
        link: { href: "https://www.laroka.es/", label: "La Roka" },
      },
    ],
  },
];
