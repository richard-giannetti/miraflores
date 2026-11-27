import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { ageOn, countries, emptyTraveller, loadMunicipalities, pickLang, relationships, searchMunicipalities, type Multi, type Municipality, type Traveller } from "../lib/checkin";
import { SignaturePad } from "./SignaturePad";
import type { Scanned } from "../lib/idscan";

// The guest's own page, reached through the private link /c/<token>. No account: the page only calls
// the checkin_get / checkin_submit database functions with the token.

type GLang = "en" | "es" | "fr";
const glangs: GLang[] = ["en", "es", "fr"];
const loc: Record<GLang, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR" };

interface Info {
  status: "pending" | "complete";
  villa: string;
  locality: string;
  check_in: string;
  check_out: string;
  check_in_time: string;
  check_out_time: string;
  adults: number;
  children: number;
  guest_first_name: string;
  rules: { title: Multi; body: Multi }[];
  guide: { kind: string; title: Multi; body: Multi }[] | null;
}

const S = {
  title: { en: "Online check-in", es: "Check-in online", fr: "Enregistrement en ligne" },
  hello: { en: "Welcome", es: "Bienvenidos", fr: "Bienvenue" },
  intro: {
    en: "Spanish law requires us to register every guest staying at the villa. Please fill in the details of each traveller before your arrival — it takes about 5 minutes.",
    es: "La ley española nos obliga a registrar a todos los huéspedes de la villa. Rellena los datos de cada viajero antes de vuestra llegada; son unos 5 minutos.",
    fr: "La loi espagnole nous oblige à enregistrer chaque personne séjournant à la villa. Merci de remplir les informations de chaque voyageur avant votre arrivée — environ 5 minutes.",
  },
  arrival: { en: "Arrival", es: "Llegada", fr: "Arrivée" },
  departure: { en: "Departure", es: "Salida", fr: "Départ" },
  from: { en: "from", es: "desde las", fr: "à partir de" },
  until: { en: "until", es: "hasta las", fr: "jusqu'à" },
  traveller: { en: "Traveller", es: "Viajero", fr: "Voyageur" },
  addTraveller: { en: "+ Add a traveller", es: "+ Añadir viajero", fr: "+ Ajouter un voyageur" },
  remove: { en: "Remove", es: "Quitar", fr: "Retirer" },
  firstName: { en: "First name", es: "Nombre", fr: "Prénom" },
  lastName1: { en: "Last name", es: "Primer apellido", fr: "Nom" },
  lastName2: { en: "Second last name (if any)", es: "Segundo apellido", fr: "Second nom (le cas échéant)" },
  sex: { en: "Sex", es: "Sexo", fr: "Sexe" },
  sexM: { en: "Male", es: "Hombre", fr: "Homme" },
  sexF: { en: "Female", es: "Mujer", fr: "Femme" },
  sexX: { en: "Other", es: "Otro", fr: "Autre" },
  birth: { en: "Date of birth", es: "Fecha de nacimiento", fr: "Date de naissance" },
  nationality: { en: "Nationality", es: "Nacionalidad", fr: "Nationalité" },
  docType: { en: "ID document", es: "Documento", fr: "Pièce d'identité" },
  docDNI: { en: "Spanish DNI", es: "DNI", fr: "DNI espagnol" },
  docNIE: { en: "Spanish NIE", es: "NIE", fr: "NIE espagnol" },
  docPassport: { en: "Passport", es: "Pasaporte", fr: "Passeport" },
  docID: { en: "National ID card", es: "Documento de identidad", fr: "Carte d'identité" },
  docOther: { en: "Other", es: "Otro", fr: "Autre" },
  docNumber: { en: "Document number", es: "Número de documento", fr: "Numéro du document" },
  support: { en: "Support number (on the card)", es: "Número de soporte", fr: "Numéro de support (sur la carte)" },
  issue: { en: "Issue date", es: "Fecha de expedición", fr: "Date de délivrance" },
  address: { en: "Home address", es: "Dirección de residencia", fr: "Adresse" },
  city: { en: "City", es: "Localidad", fr: "Ville" },
  postal: { en: "Postal code", es: "Código postal", fr: "Code postal" },
  country: { en: "Country of residence", es: "País de residencia", fr: "Pays de résidence" },
  phone: { en: "Phone", es: "Teléfono", fr: "Téléphone" },
  email: { en: "Email", es: "Email", fr: "E-mail" },
  relationship: { en: "Relationship to traveller 1", es: "Parentesco con el viajero 1", fr: "Lien avec le voyageur 1" },
  rel_child: { en: "Son or daughter", es: "Hijo o hija", fr: "Fils ou fille" },
  rel_grandchild: { en: "Grandson or granddaughter", es: "Nieto o nieta", fr: "Petit-fils ou petite-fille" },
  rel_sibling: { en: "Brother or sister", es: "Hermano o hermana", fr: "Frère ou sœur" },
  rel_nephew_niece: { en: "Nephew or niece", es: "Sobrino o sobrina", fr: "Neveu ou nièce" },
  rel_ward: { en: "In their care (legal guardian)", es: "A su cargo (tutor legal)", fr: "Sous sa tutelle" },
  rel_other: { en: "Other", es: "Otro", fr: "Autre" },
  scan: { en: "Scan passport or ID card", es: "Escanear pasaporte o DNI", fr: "Scanner passeport ou carte d'identité" },
  scanHint: {
    en: "Photo of the page with the lines of <<< (back of ID cards). It's read on your phone; the photo isn't sent or kept.",
    es: "Foto de la página con las líneas de <<< (reverso del DNI). Se lee en tu móvil; la foto no se envía ni se guarda.",
    fr: "Photo de la page avec les lignes de <<< (verso des cartes d'identité). Lue sur votre téléphone ; la photo n'est ni envoyée ni conservée.",
  },
  scanning: { en: "Reading the document…", es: "Leyendo el documento…", fr: "Lecture du document…" },
  scanned: {
    en: "Filled in from your document. Please check every field (these lines have no accents).",
    es: "Rellenado con tu documento. Revisa cada campo (estas líneas no llevan tildes).",
    fr: "Rempli depuis votre document. Vérifiez chaque champ (ces lignes n'ont pas d'accents).",
  },
  scanFailed: {
    en: "Couldn't read it. Try again flat, in good light, with the <<< lines sharp, or type the details in.",
    es: "No se pudo leer. Prueba otra vez en plano, con buena luz y las líneas <<< nítidas, o escribe los datos.",
    fr: "Lecture impossible. Réessayez à plat, bien éclairé, lignes <<< nettes, ou saisissez les données.",
  },
  municipality: { en: "Town (municipality)", es: "Municipio", fr: "Commune" },
  municipalityHint: { en: "Type and choose from the list", es: "Escribe y elige de la lista", fr: "Tapez et choisissez dans la liste" },
  municipalityNone: { en: "No match: check the spelling", es: "Sin resultados: revisa cómo se escribe", fr: "Aucun résultat : vérifiez l'orthographe" },
  sameAddress: { en: "Same address as traveller 1", es: "Misma dirección que el viajero 1", fr: "Même adresse que le voyageur 1" },
  minorNote: { en: "Under 14: no ID document needed.", es: "Menor de 14 años: no necesita documento.", fr: "Moins de 14 ans : pas de pièce d'identité requise." },
  choose: { en: "Choose…", es: "Elegir…", fr: "Choisir…" },
  arrivalTime: { en: "Expected arrival time", es: "Hora prevista de llegada", fr: "Heure d'arrivée prévue" },
  needInvoice: { en: "I need an invoice in a company's name", es: "Necesito factura a nombre de una empresa", fr: "J'ai besoin d'une facture au nom d'une société" },
  invoiceName: { en: "Company name", es: "Razón social", fr: "Raison sociale" },
  invoiceTax: { en: "Tax / VAT number", es: "NIF / CIF", fr: "Numéro de TVA / SIREN" },
  invoiceAddress: { en: "Company address", es: "Dirección de la empresa", fr: "Adresse de la société" },
  rules: { en: "House rules", es: "Normas de la casa", fr: "Règlement intérieur" },
  accept: { en: "I have read and accept the house rules", es: "He leído y acepto las normas de la casa", fr: "J'ai lu et j'accepte le règlement intérieur" },
  sign: { en: "Signature of the main traveller", es: "Firma del viajero principal", fr: "Signature du voyageur principal" },
  clear: { en: "Clear", es: "Borrar", fr: "Effacer" },
  privacy: {
    en: "Your data is used only to register the stay with the Spanish authorities (SES.Hospedajes, Royal Decree 933/2021), kept for 3 years and then deleted. We never ask for a photo of your documents. Controller: Miraflores Costa Tropical SL, info@miraflorescostatropical.com.",
    es: "Tus datos solo se usan para comunicar la estancia a las autoridades (SES.Hospedajes, Real Decreto 933/2021), se conservan 3 años y después se borran. Nunca pedimos foto de tus documentos. Responsable: Miraflores Costa Tropical SL, info@miraflorescostatropical.com.",
    fr: "Vos données servent uniquement à déclarer le séjour aux autorités espagnoles (SES.Hospedajes, décret royal 933/2021), sont conservées 3 ans puis supprimées. Nous ne demandons jamais de photo de vos documents. Responsable : Miraflores Costa Tropical SL, info@miraflorescostatropical.com.",
  },
  submit: { en: "Complete check-in", es: "Completar check-in", fr: "Terminer l'enregistrement" },
  sending: { en: "Sending…", es: "Enviando…", fr: "Envoi…" },
  missing: { en: "Please fill in the highlighted fields.", es: "Rellena los campos marcados.", fr: "Merci de remplir les champs signalés." },
  needSign: { en: "Please accept the house rules and sign.", es: "Acepta las normas de la casa y firma.", fr: "Merci d'accepter le règlement et de signer." },
  failed: { en: "Something went wrong. Please try again or email us.", es: "Algo ha fallado. Inténtalo de nuevo o escríbenos.", fr: "Une erreur est survenue. Réessayez ou écrivez-nous." },
  invalid: {
    en: "This check-in link is not valid or has expired. Please contact us at info@miraflorescostatropical.com.",
    es: "Este enlace de check-in no es válido o ha caducado. Escríbenos a info@miraflorescostatropical.com.",
    fr: "Ce lien d'enregistrement n'est pas valide ou a expiré. Écrivez-nous à info@miraflorescostatropical.com.",
  },
  done: { en: "Check-in complete — thank you!", es: "¡Check-in completado, gracias!", fr: "Enregistrement terminé — merci !" },
  doneSub: { en: "Here's everything you need for your stay.", es: "Aquí tienes todo lo necesario para vuestra estancia.", fr: "Voici tout ce qu'il faut pour votre séjour." },
  contact: { en: "Questions? Write to us at", es: "¿Dudas? Escríbenos a", fr: "Des questions ? Écrivez-nous à" },
} satisfies Record<string, Record<GLang, string>>;

const initial = (): GLang => {
  const n = navigator.language.slice(0, 2) as GLang;
  return glangs.includes(n) ? n : "en";
};

export function GuestCheckin({ token }: { token: string }) {
  const [lang, setLang] = useState<GLang>(initial);
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const tr = (k: keyof typeof S) => S[k][lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    supabase.rpc("checkin_get", { p_token: token }).then(({ data, error }) => setInfo(error ? null : ((data as Info) ?? null)));
  }, [token]);

  const fmt = (d: string) => new Intl.DateTimeFormat(loc[lang], { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  return (
    <div className="guest">
      <header className="guest-top">
        <img src="/logo.png" alt="Miraflores" />
        <div className="langs" role="group" aria-label="Language">
          {glangs.map((l) => (
            <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {info === undefined && <p className="guest-card muted">…</p>}
      {info === null && <p className="guest-card">{tr("invalid")}</p>}
      {info && (
        <>
          <section className="guest-hero">
            <p className="eyebrow">{info.status === "complete" ? tr("done") : tr("title")}</p>
            <h1>{info.villa}</h1>
            <div className="guest-dates">
              <div>
                <span>{tr("arrival")}</span>
                <strong>{fmt(info.check_in)}</strong>
                <small>
                  {tr("from")} {info.check_in_time}
                </small>
              </div>
              <div>
                <span>{tr("departure")}</span>
                <strong>{fmt(info.check_out)}</strong>
                <small>
                  {tr("until")} {info.check_out_time}
                </small>
              </div>
            </div>
          </section>
          {info.status === "complete" ? <Guide info={info} lang={lang} tr={tr} /> : <Form info={info} token={token} lang={lang} tr={tr} onDone={setInfo} />}
        </>
      )}
    </div>
  );
}

function Guide({ info, lang, tr }: { info: Info; lang: GLang; tr: (k: keyof typeof S) => string }) {
  const items = (info.guide ?? []).filter((g) => pickLang(g.body, lang));
  return (
    <>
      <p className="guest-lead">{tr("doneSub")}</p>
      {items.map((g, i) => (
        <section key={i} className={`guest-card guide-${g.kind}`}>
          <h2>{pickLang(g.title, lang)}</h2>
          <p className="pre">{pickLang(g.body, lang)}</p>
        </section>
      ))}
      <p className="guest-foot">
        {tr("contact")} <a href="mailto:info@miraflorescostatropical.com">info@miraflorescostatropical.com</a>
      </p>
    </>
  );
}

function Form({ info, token, lang, tr, onDone }: { info: Info; token: string; lang: GLang; tr: (k: keyof typeof S) => string; onDone: (i: Info) => void }) {
  const expected = Math.max(1, info.adults + info.children);
  const [people, setPeople] = useState<(Traveller & { same?: boolean })[]>(() =>
    Array.from({ length: expected }, (_, i) => ({ ...emptyTraveller(), first_name: i === 0 ? info.guest_first_name : "", same: i > 0 })),
  );
  const [arrival, setArrival] = useState("");
  const [needInvoice, setNeedInvoice] = useState(false);
  const [inv, setInv] = useState({ name: "", tax: "", address: "" });
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => countries(loc[lang]), [lang]);

  const set = (i: number, patch: Partial<Traveller & { same?: boolean }>) => setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  // With "same address", a traveller takes traveller 1's address when sent; so does every minor (SES needs an address
  // for each traveller, and children live with the adult they travel with).
  const isMinor = (p: Traveller) => {
    const age = ageOn(p.birth_date, info.check_in);
    return age !== null && age < 18;
  };
  const resolved = people.map((p, i) =>
    i > 0 && (p.same || isMinor(p))
      ? {
          ...p,
          residence_address: people[0].residence_address,
          residence_city: people[0].residence_city,
          residence_postal_code: people[0].residence_postal_code,
          residence_country: people[0].residence_country,
          residence_municipality_code: people[0].residence_municipality_code,
        }
      : p,
  );

  // Which fields each traveller still needs, by age.
  function missing(p: Traveller, i: number) {
    const m = new Set<keyof Traveller>();
    for (const k of ["first_name", "last_name_1", "birth_date"] as const) if (!p[k].trim()) m.add(k);
    const age = ageOn(p.birth_date, info.check_in);
    const adult = age === null || age >= 18;
    if (age === null || age >= 14) {
      for (const k of ["sex", "nationality", "doc_type", "doc_number"] as const) if (!p[k]) m.add(k);
      if ((p.doc_type === "DNI" || p.doc_type === "NIE") && !p.doc_support_number.trim()) m.add("doc_support_number");
    }
    if (!adult && !p.relationship.trim()) m.add("relationship");
    if (adult) for (const k of ["residence_address", "residence_city", "residence_country"] as const) if (!p[k].trim()) m.add(k);
    // Residents of Spain: the town must come from the official list (SES needs its INE code).
    if (adult && p.residence_country === "ESP" && !/^\d{5}$/.test(p.residence_municipality_code)) m.add("residence_city");
    if (i === 0 && !p.phone.trim() && !p.email.trim()) m.add("phone");
    return m;
  }
  const allMissing = resolved.map(missing);
  const bad = (i: number, k: keyof Traveller) => (showErrors && allMissing[i].has(k) ? "bad" : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (allMissing.some((m) => m.size)) return setError(tr("missing"));
    if (!accepted || !signature) return setError(tr("needSign"));
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("checkin_submit", {
      p_token: token,
      p_data: {
        travellers: resolved.map(({ same: _same, ...t }) => ({ ...t, doc_issue_date: t.doc_issue_date || null })),
        arrival_time: arrival,
        rules_accepted: accepted,
        signature,
        language: lang,
        invoice_name: needInvoice ? inv.name : "",
        invoice_tax_id: needInvoice ? inv.tax : "",
        invoice_address: needInvoice ? inv.address : "",
      },
    });
    setBusy(false);
    if (error) return setError(tr("failed"));
    onDone(data as Info);
    window.scrollTo({ top: 0 });
  }

  const field = (i: number, k: keyof Traveller, label: keyof typeof S, type = "text", extra?: object) => (
    <label className={bad(i, k)}>
      {tr(label)}
      <input type={type} value={String(people[i][k] ?? "")} onChange={(e) => set(i, { [k]: e.target.value })} {...extra} />
    </label>
  );
  const countrySelect = (i: number, k: "nationality" | "residence_country", label: keyof typeof S) => (
    <label className={bad(i, k)}>
      {tr(label)}
      <select value={people[i][k]} onChange={(e) => set(i, { [k]: e.target.value })}>
        <option value="">{tr("choose")}</option>
        {list.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} noValidate>
      <p className="guest-lead">
        {info.guest_first_name ? `${tr("hello")}, ${info.guest_first_name}! ` : `${tr("hello")}! `}
        {tr("intro")}
      </p>

      {people.map((p, i) => {
        const age = ageOn(p.birth_date, info.check_in);
        const minor = age !== null && age < 18;
        const under14 = age !== null && age < 14;
        return (
          <section key={i} className="guest-card">
            <div className="guest-card-head">
              <h2>
                {tr("traveller")} {i + 1}
              </h2>
              {i > 0 && (
                <button type="button" className="link" onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}>
                  {tr("remove")}
                </button>
              )}
            </div>
            <ScanButton tr={tr} onScanned={(fields) => set(i, fields)} />
            <div className="two">
              {field(i, "first_name", "firstName", "text", { autoComplete: i === 0 ? "given-name" : "off" })}
              {field(i, "last_name_1", "lastName1", "text", { autoComplete: i === 0 ? "family-name" : "off" })}
            </div>
            <div className="two">
              {field(i, "last_name_2", "lastName2")}
              {field(i, "birth_date", "birth", "date")}
            </div>
            {under14 ? (
              <p className="muted">{tr("minorNote")}</p>
            ) : (
              <>
                <div className="two">
                  <label className={bad(i, "sex")}>
                    {tr("sex")}
                    <select value={p.sex} onChange={(e) => set(i, { sex: e.target.value as Traveller["sex"] })}>
                      <option value="">{tr("choose")}</option>
                      <option value="F">{tr("sexF")}</option>
                      <option value="M">{tr("sexM")}</option>
                      <option value="X">{tr("sexX")}</option>
                    </select>
                  </label>
                  {countrySelect(i, "nationality", "nationality")}
                </div>
                <div className="two">
                  <label className={bad(i, "doc_type")}>
                    {tr("docType")}
                    <select value={p.doc_type} onChange={(e) => set(i, { doc_type: e.target.value as Traveller["doc_type"] })}>
                      <option value="">{tr("choose")}</option>
                      <option value="PASSPORT">{tr("docPassport")}</option>
                      <option value="ID_CARD">{tr("docID")}</option>
                      <option value="DNI">{tr("docDNI")}</option>
                      <option value="NIE">{tr("docNIE")}</option>
                      <option value="OTHER">{tr("docOther")}</option>
                    </select>
                  </label>
                  {field(i, "doc_number", "docNumber", "text", { autoCapitalize: "characters" })}
                </div>
                <div className="two">
                  {(p.doc_type === "DNI" || p.doc_type === "NIE") && field(i, "doc_support_number", "support", "text", { autoCapitalize: "characters" })}
                  {field(i, "doc_issue_date", "issue", "date")}
                </div>
              </>
            )}
            {minor && (
              <label className={bad(i, "relationship")}>
                {tr("relationship")}
                <select value={p.relationship} onChange={(e) => set(i, { relationship: e.target.value })}>
                  <option value="">{tr("choose")}</option>
                  {relationships.map((r) => (
                    <option key={r} value={r}>
                      {tr(`rel_${r}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!minor && (
              <>
                {i > 0 && (
                  <label className="check">
                    <input type="checkbox" checked={!!p.same} onChange={(e) => set(i, { same: e.target.checked })} />
                    {tr("sameAddress")}
                  </label>
                )}
                {(i === 0 || !p.same) && (
                  <>
                    {countrySelect(i, "residence_country", "country")}
                    {field(i, "residence_address", "address", "text", { autoComplete: i === 0 ? "street-address" : "off" })}
                    <div className="two">
                      {p.residence_country === "ESP" ? (
                        <MunicipalityField
                          className={bad(i, "residence_city")}
                          label={tr("municipality")}
                          hint={tr("municipalityHint")}
                          none={tr("municipalityNone")}
                          value={p.residence_city}
                          chosen={!!p.residence_municipality_code}
                          onType={(v) => set(i, { residence_city: v, residence_municipality_code: "" })}
                          onChoose={(m) => set(i, { residence_city: m.name, residence_municipality_code: m.code })}
                        />
                      ) : (
                        field(i, "residence_city", "city")
                      )}
                      {field(i, "residence_postal_code", "postal")}
                    </div>
                  </>
                )}
              </>
            )}
            {i === 0 && (
              <div className="two">
                {field(i, "phone", "phone", "tel", { autoComplete: "tel" })}
                {field(i, "email", "email", "email", { autoComplete: "email" })}
              </div>
            )}
          </section>
        );
      })}

      <button type="button" className="add-traveller" onClick={() => setPeople((ps) => [...ps, { ...emptyTraveller(), same: true }])}>
        {tr("addTraveller")}
      </button>

      <section className="guest-card">
        <label>
          {tr("arrivalTime")}
          <input type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={needInvoice} onChange={(e) => setNeedInvoice(e.target.checked)} />
          {tr("needInvoice")}
        </label>
        {needInvoice && (
          <>
            <div className="two">
              <label>
                {tr("invoiceName")}
                <input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
              </label>
              <label>
                {tr("invoiceTax")}
                <input value={inv.tax} onChange={(e) => setInv({ ...inv, tax: e.target.value })} />
              </label>
            </div>
            <label>
              {tr("invoiceAddress")}
              <input value={inv.address} onChange={(e) => setInv({ ...inv, address: e.target.value })} />
            </label>
          </>
        )}
      </section>

      <section className="guest-card">
        <h2>{tr("rules")}</h2>
        {info.rules.map((r, i) => (
          <p key={i} className="pre rules">
            {pickLang(r.body, lang)}
          </p>
        ))}
        <label className={`check${showErrors && !accepted ? " bad" : ""}`}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          {tr("accept")}
        </label>
        <div className={showErrors && !signature ? "bad" : undefined}>
          <span className="sign-label">{tr("sign")}</span>
          <SignaturePad onChange={setSignature} clearLabel={tr("clear")} />
        </div>
        <p className="privacy">{tr("privacy")}</p>
      </section>

      {error && <p className="error guest-error">{error}</p>}
      <button className="primary big guest-submit" disabled={busy}>
        {busy ? tr("sending") : tr("submit")}
      </button>
    </form>
  );
}

// Town picker for residents of Spain: suggestions from INE's list as the guest types; only a chosen entry counts.
function MunicipalityField(props: {
  className?: string;
  label: string;
  hint: string;
  none: string;
  value: string;
  chosen: boolean;
  onType: (v: string) => void;
  onChoose: (m: Municipality) => void;
}) {
  const [list, setList] = useState<Municipality[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    loadMunicipalities().then(setList, () => setList([]));
  }, []);
  const hits = list && open && !props.chosen ? searchMunicipalities(list, props.value) : [];
  return (
    <label className={`town-field ${props.className ?? ""}`}>
      {props.label}
      <input
        value={props.value}
        autoComplete="off"
        onChange={(e) => {
          props.onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-autocomplete="list"
      />
      {hits.length > 0 && (
        <ul className="town-list" role="listbox">
          {hits.map((m) => (
            <li key={m.code} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  props.onChoose(m);
                  setOpen(false);
                }}
              >
                {m.name} <small>{m.province}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!props.chosen && (
        <small className="muted">{list && open && props.value.trim().length >= 2 && hits.length === 0 ? props.none : props.hint}</small>
      )}
    </label>
  );
}

// "Scan passport or ID card": a photo (camera on phones), read in the browser by lib/idscan, then the form is filled in.
function ScanButton({ tr, onScanned }: { tr: (k: keyof typeof S) => string; onScanned: (f: Scanned) => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  async function read(file: File | undefined) {
    if (!file) return;
    setState("busy");
    try {
      const { scanDocument } = await import("../lib/idscan");
      const found = await scanDocument(file);
      if (!found) return setState("failed");
      onScanned(found.fields);
      setState("done");
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="scan-box">
      <label className={`scan-btn${state === "busy" ? " busy" : ""}`}>
        <input type="file" accept="image/*" capture="environment" disabled={state === "busy"} onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
        {state === "busy" ? tr("scanning") : tr("scan")}
      </label>
      <small className={state === "failed" ? "error" : "muted"}>
        {state === "done" ? tr("scanned") : state === "failed" ? tr("scanFailed") : tr("scanHint")}
      </small>
    </div>
  );
}
