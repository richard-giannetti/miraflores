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
  phone: string;
  email: string;
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

export const checkinUrl = (token: string) => `${location.origin}/c/${token}`;

// Age on a given day, to know who's a minor (under 14: no ID document needed in Spain; under 18: relationship).
export function ageOn(birth: string, day: string) {
  if (!birth) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const iso = `ESP:ES FRA:FR GBR:GB DEU:DE ITA:IT PRT:PT NLD:NL BEL:BE CHE:CH AUT:AT IRL:IE LUX:LU DNK:DK SWE:SE NOR:NO FIN:FI
ISL:IS POL:PL CZE:CZ SVK:SK HUN:HU ROU:RO BGR:BG GRC:GR HRV:HR SVN:SI SRB:RS BIH:BA MNE:ME MKD:MK ALB:AL EST:EE LVA:LV
LTU:LT UKR:UA MDA:MD BLR:BY RUS:RU GEO:GE ARM:AM AZE:AZ KAZ:KZ TUR:TR CYP:CY MLT:MT AND:AD MCO:MC MAR:MA DZA:DZ TUN:TN
EGY:EG SEN:SN NGA:NG GHA:GH KEN:KE ZAF:ZA ISR:IL LBN:LB JOR:JO IRQ:IQ IRN:IR SAU:SA ARE:AE QAT:QA PAK:PK IND:IN BGD:BD
CHN:CN JPN:JP KOR:KR PHL:PH THA:TH VNM:VN IDN:ID MYS:MY SGP:SG AUS:AU NZL:NZ USA:US CAN:CA MEX:MX CUB:CU DOM:DO COL:CO
VEN:VE ECU:EC PER:PE BOL:BO BRA:BR PRY:PY URY:UY ARG:AR CHL:CL`
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
