// Online check-in: the shapes shared by the guest page and the PMS, and the country list.
// SES.Hospedajes wants nationality and country of residence as ISO 3166 alpha-3 codes; names are shown
// in the reader's language through Intl.DisplayNames (which uses alpha-2).

export type Multi = Partial<Record<"en" | "es" | "fr", string>>;

export interface Traveller {
  id?: string;
  ordinal?: number;
  first_name: string;
  last_name_1: string;
  last_name_2: string;
  sex: "" | "M" | "F" | "X";
  birth_date: string;
  nationality: string;
  doc_type: "" | "DNI" | "NIE" | "PASSPORT" | "ID_CARD" | "OTHER";
  doc_number: string;
  doc_support_number: string;
  doc_issue_date: string;
  residence_address: string;
  residence_city: string;
  residence_postal_code: string;
  residence_country: string;
  // INE municipality code (5 digits) for residents of Spain; residence_city then holds its name.
  residence_municipality_code: string;
  phone: string;
  email: string;
  // Minors only: how they relate to the main traveller (one of `relationships`).
  relationship: string;
}

export const emptyTraveller = (): Traveller => ({
  first_name: "",
  last_name_1: "",
  last_name_2: "",
  sex: "",
  birth_date: "",
  nationality: "",
  doc_type: "",
  doc_number: "",
  doc_support_number: "",
  doc_issue_date: "",
  residence_address: "",
  residence_city: "",
  residence_postal_code: "",
  residence_country: "",
  residence_municipality_code: "",
  phone: "",
  email: "",
  relationship: "",
});

export interface Checkin {
  id: string;
  reservation_id: string;
  token: string;
  status: "pending" | "complete";
  arrival_time: string;
  signature: string | null;
  guest_language: string | null;
  invoice_name: string;
  invoice_tax_id: string;
  invoice_address: string;
  completed_at: string | null;
  ses_sent_at: string | null;
  travellers?: Traveller[];
}

// A minor's relationship to the main traveller. Stored in these words; turned into SES.Hospedajes codes when sending.
export const relationships = ["child", "grandchild", "sibling", "nephew_niece", "ward", "other"] as const;

// Spain's municipalities (INE, public/municipios.json), loaded only when a guest lives in Spain.
export interface Municipality {
  code: string;
  name: string;
  province: string;
}
let municipalities: Promise<Municipality[]> | null = null;
export function loadMunicipalities() {
  municipalities ??= fetch("/municipios.json?v=2026")
    .then((r) => r.json())
    .then((d: { provinces: Record<string, string>; municipalities: [string, string][] }) =>
      d.municipalities.map(([code, name]) => ({ code, name, province: d.provinces[code.slice(0, 2)] ?? "" })),
    )
    .catch((e) => {
      municipalities = null;
      throw e;
    });
  return municipalities;
}
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// Up to 8 matches: names starting with the text first, then names containing it.
export function searchMunicipalities(list: Municipality[], q: string) {
  const t = fold(q);
  if (t.length < 2) return [];
  const hits = list.filter((m) => fold(m.name).includes(t));
  return hits.sort((a, b) => Number(!fold(a.name).startsWith(t)) - Number(!fold(b.name).startsWith(t)) || a.name.length - b.name.length).slice(0, 8);
}

export const checkinUrl = (token: string) => `${location.origin}/c/${token}`;

// Age on a given day, to know who's a minor (under 14: no ID document needed in Spain; under 18: relationship).
export function ageOn(birth: string, day: string) {
  if (!birth) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// Every ISO 3166-1 country (alpha-3:alpha-2), so no guest's nationality is missing.
const iso = `ABW:AW AFG:AF AGO:AO AIA:AI ALA:AX ALB:AL AND:AD ARE:AE ARG:AR ARM:AM ASM:AS ATA:AQ ATF:TF ATG:AG AUS:AU AUT:AT
AZE:AZ BDI:BI BEL:BE BEN:BJ BES:BQ BFA:BF BGD:BD BGR:BG BHR:BH BHS:BS BIH:BA BLM:BL BLR:BY BLZ:BZ BMU:BM BOL:BO
BRA:BR BRB:BB BRN:BN BTN:BT BVT:BV BWA:BW CAF:CF CAN:CA CCK:CC CHE:CH CHL:CL CHN:CN CIV:CI CMR:CM COD:CD COG:CG
COK:CK COL:CO COM:KM CPV:CV CRI:CR CUB:CU CUW:CW CXR:CX CYM:KY CYP:CY CZE:CZ DEU:DE DJI:DJ DMA:DM DNK:DK DOM:DO
DZA:DZ ECU:EC EGY:EG ERI:ER ESH:EH ESP:ES EST:EE ETH:ET FIN:FI FJI:FJ FLK:FK FRA:FR FRO:FO FSM:FM GAB:GA GBR:GB
GEO:GE GGY:GG GHA:GH GIB:GI GIN:GN GLP:GP GMB:GM GNB:GW GNQ:GQ GRC:GR GRD:GD GRL:GL GTM:GT GUF:GF GUM:GU GUY:GY
HKG:HK HMD:HM HND:HN HRV:HR HTI:HT HUN:HU IDN:ID IMN:IM IND:IN IOT:IO IRL:IE IRN:IR IRQ:IQ ISL:IS ISR:IL ITA:IT
JAM:JM JEY:JE JOR:JO JPN:JP KAZ:KZ KEN:KE KGZ:KG KHM:KH KIR:KI KNA:KN KOR:KR KWT:KW LAO:LA LBN:LB LBR:LR LBY:LY
LCA:LC LIE:LI LKA:LK LSO:LS LTU:LT LUX:LU LVA:LV MAC:MO MAF:MF MAR:MA MCO:MC MDA:MD MDG:MG MDV:MV MEX:MX MHL:MH
MKD:MK MLI:ML MLT:MT MMR:MM MNE:ME MNG:MN MNP:MP MOZ:MZ MRT:MR MSR:MS MTQ:MQ MUS:MU MWI:MW MYS:MY MYT:YT NAM:NA
NCL:NC NER:NE NFK:NF NGA:NG NIC:NI NIU:NU NLD:NL NOR:NO NPL:NP NRU:NR NZL:NZ OMN:OM PAK:PK PAN:PA PCN:PN PER:PE
PHL:PH PLW:PW PNG:PG POL:PL PRI:PR PRK:KP PRT:PT PRY:PY PSE:PS PYF:PF QAT:QA REU:RE ROU:RO RUS:RU RWA:RW SAU:SA
SDN:SD SEN:SN SGP:SG SGS:GS SHN:SH SJM:SJ SLB:SB SLE:SL SLV:SV SMR:SM SOM:SO SPM:PM SRB:RS SSD:SS STP:ST SUR:SR
SVK:SK SVN:SI SWE:SE SWZ:SZ SXM:SX SYC:SC SYR:SY TCA:TC TCD:TD TGO:TG THA:TH TJK:TJ TKL:TK TKM:TM TLS:TL TON:TO
TTO:TT TUN:TN TUR:TR TUV:TV TWN:TW TZA:TZ UGA:UG UKR:UA UMI:UM URY:UY USA:US UZB:UZ VAT:VA VCT:VC VEN:VE VGB:VG
VIR:VI VNM:VN VUT:VU WLF:WF WSM:WS XKK:XK YEM:YE ZAF:ZA ZMB:ZM ZWE:ZW`
  .split(/\s+/)
  .map((p) => p.split(":") as [string, string]);

export function countries(locale: string) {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {}
  return iso
    .map(([a3, a2]) => ({ code: a3, name: names?.of(a2) ?? a3 }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export const countryName = (a3: string, locale: string) => countries(locale).find((c) => c.code === a3)?.name ?? a3;

export const pickLang = (m: Multi | null | undefined, lang: string) =>
  (m?.[lang as keyof Multi] || m?.en || m?.es || m?.fr || "").trim();
