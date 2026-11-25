import { pick, type L, type Lang } from "../i18n";

export const site = {
  name: "Miraflores Costa Tropical",
  shortName: "Miraflores",
  url: "https://miraflorescostatropical.com",
  email: "info@miraflorescostatropical.com",
  instagram: "https://www.instagram.com/olivosdemiraflores",
  // Web3Forms access key for the contact form (public by design; messages go to `email`).
  // Get one at https://web3forms.com with info@miraflorescostatropical.com. Empty = form hidden.
  contactFormKey: "",
  airbnbGuidebook:
    "https://www.airbnb.com/s/guidebooks?refinement_paths%5B%5D=%2Fguidebooks%2F5721617&s=67&unique_share_id=47646142-cd14-4fd8-991f-52713c020120",
};

const airportsData: { name: L; distance: string }[] = [
  { name: { en: "Granada Airport", es: "Aeropuerto de Granada" }, distance: "50 km" },
  { name: { en: "Málaga Airport", es: "Aeropuerto de Málaga" }, distance: "70 km" },
  { name: { en: "Almería Airport", es: "Aeropuerto de Almería" }, distance: "120 km" },
];
export const getAirports = (lang: Lang) => pick(airportsData, lang);
