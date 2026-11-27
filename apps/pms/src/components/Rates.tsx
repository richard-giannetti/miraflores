import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { addDays, format, today } from "../lib/dates";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { pickLang, type Multi } from "../lib/checkin";
import { eur } from "../lib/money";
import type { Villas } from "../lib/villas";
import { Icon } from "./Icon";

interface Pricing {
  property_id: string;
  base_price: number;
  weekend_price: number | null;
  min_nights: number;
  included_guests: number;
  extra_guest_fee: number;
  cleaning_fee: number;
  min_advance_days: number;
  max_advance_days: number;
  gap_max_nights: number;
  gap_min_nights: number;
  gap_discount_pct: number;
  direct_booking_enabled: boolean;
  deposit_pct: number;
  balance_days_before: number;
}
interface Season {
  id: string;
  property_id: string;
  name: string;
  starts: string;
  ends: string;
  price: number;
  weekend_price: number | null;
  min_nights: number | null;
}
interface Plan {
  id: string;
  property_id: string | null;
  kind: "early_bird" | "last_minute" | "non_refundable" | "custom";
  name: Multi;
  discount_pct: number;
  min_days_ahead: number | null;
  max_days_ahead: number | null;
  refundable: boolean;
  active: boolean;
}
interface Promo {
  id: string;
  code: string;
  property_id: string | null;
  discount_pct: number;
  valid_from: string | null;
  valid_to: string | null;
  max_uses: number | null;
  used: number;
  active: boolean;
}
export interface Quote {
  available: boolean;
  reason?: string;
  min_nights?: number;
  min_advance_days?: number;
  max_guests?: number;
  nights: number;
  per_night: { date: string; price: number }[];
  accommodation: number;
  gap: boolean;
  gap_discount_pct: number;
  extra_guests: number;
  cleaning: number;
  promo: { code: string; discount_pct: number } | null;
  promo_invalid: boolean;
  options: { plan: string; kind: string; name: Multi; discount_pct: number; refundable: boolean; total: number }[];
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const str = (v: number | null | undefined) => (v == null ? "" : String(v));

// What a quote answer means, in words.
export const quoteReason = (lang: Lang, q: Quote) =>
  q.reason === "min_nights"
    ? `${t(lang, "reason_min_nights")} ${q.min_nights}`
    : q.reason === "too_soon"
      ? `${t(lang, "reason_too_soon")} ${q.min_advance_days}`
      : t(lang, `reason_${q.reason ?? "unavailable"}` as Key);

export const planName = (lang: Lang, o: { kind: string; name: Multi }) => (o.kind === "standard" ? t(lang, "plan_standard") : pickLang(o.name, lang) || t(lang, `plan_${o.kind}` as Key));

// Prices for each villa: base and weekend prices, seasons, fees, stay rules, gap nights, rate types and
// promo codes, with a price check that uses the very same calculation as the website.
export function Rates({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const property = propertyId ?? villas.properties[0]?.id ?? null;
  const [pricing, setPricing] = useState<Record<string, Pricing>>({});
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [season, setSeason] = useState<Season | "new" | null>(null);
  const [promo, setPromo] = useState<Promo | "new" | null>(null);
  // Bumped on every reload, so the price check recalculates after a change.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const [p, s, pl, pc] = await Promise.all([
      supabase.from("pricing").select("*"),
      supabase.from("rate_seasons").select("id, property_id, name, starts, ends, price, weekend_price, min_nights").is("deleted_at", null).order("starts"),
      supabase.from("rate_plans").select("id, property_id, kind, name, discount_pct, min_days_ahead, max_days_ahead, refundable, active").is("deleted_at", null).order("sort"),
      supabase.from("promo_codes").select("id, code, property_id, discount_pct, valid_from, valid_to, max_uses, used, active").is("deleted_at", null).order("created_at", { ascending: false }),
    ]);
    setPricing(Object.fromEntries(((p.data ?? []) as Pricing[]).map((x) => [x.property_id, x])));
    setSeasons((s.data ?? []) as Season[]);
    setPlans((pl.data ?? []) as Plan[]);
    setPromos((pc.data ?? []) as Promo[]);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const villa = villas.properties.find((v) => v.id === property);
  const pr = property ? pricing[property] : undefined;
  const loc = locale[lang];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t(lang, "tab_rates")}</p>
          <h1 className="title">{villa?.name}</h1>
        </div>
        <div className="segmented">
          {villas.properties.map((p) => (
            <button key={p.id} className={p.id === property ? "on" : ""} onClick={() => setPropertyId(p.id)}>{p.name.replace(/^Villa /, "")}</button>
          ))}
        </div>
      </div>

      <div className="columns rates-columns">
        <div className="rates-main">
          {pr && <PricingForm key={pr.property_id} lang={lang} pricing={pr} onSaved={load} />}

          <section className="panel">
            <h2>
              <span className="h-icon"><Icon name="calendar" size={16} /></span>
              {t(lang, "seasons")}
              <button className="small-btn add-right" onClick={() => setSeason("new")}><Icon name="plus" size={14} /> {t(lang, "newSeason")}</button>
            </h2>
            <p className="muted small">{t(lang, "seasonsHint")}</p>
            {seasons.filter((s) => s.property_id === property).length === 0 ? (
              <p className="muted">{t(lang, "noSeasons")}</p>
            ) : (
              <ul className="list">
                {seasons
                  .filter((s) => s.property_id === property)
                  .map((s) => (
                    <li key={s.id} className={`item${s.ends < today() ? " faded" : ""}`}>
                      <button className="item-main" onClick={() => setSeason(s)}>
                        <span>
                          <strong>{s.name || t(lang, "season")}</strong>
                          <small>
                            {format(s.starts, loc, { day: "numeric", month: "short", year: "numeric" })} → {format(s.ends, loc, { day: "numeric", month: "short", year: "numeric" })}
                            {s.min_nights != null && ` · ${t(lang, "minNightsShort")} ${s.min_nights}`}
                          </small>
                        </span>
                      </button>
                      <span className="amount">
                        {eur(Number(s.price), loc)}
                        {s.weekend_price != null && <small className="muted"> / {eur(Number(s.weekend_price), loc)}</small>}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>
              <span className="h-icon"><Icon name="repeat" size={16} /></span>
              {t(lang, "rateTypes")}
            </h2>
            <p className="muted small">{t(lang, "rateTypesHint")}</p>
            <ul className="list">
              {plans.map((p) => (
                <PlanRow key={p.id} lang={lang} plan={p} onSaved={load} />
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>
              <span className="h-icon"><Icon name="invoices" size={16} /></span>
              {t(lang, "promoCodes")}
              <button className="small-btn add-right" onClick={() => setPromo("new")}><Icon name="plus" size={14} /> {t(lang, "newPromo")}</button>
            </h2>
            {promos.length === 0 ? (
              <p className="muted">{t(lang, "noPromos")}</p>
            ) : (
              <ul className="list">
                {promos.map((p) => (
                  <li key={p.id} className={`item${p.active ? "" : " faded"}`}>
                    <button className="item-main" onClick={() => setPromo(p)}>
                      <span>
                        <strong className="mono">{p.code}</strong>
                        <small>
                          {[
                            p.property_id ? villas.properties.find((v) => v.id === p.property_id)?.name : t(lang, "bothVillas"),
                            p.valid_to && `${t(lang, "until")} ${format(p.valid_to, loc, { day: "numeric", month: "short", year: "numeric" })}`,
                            `${p.used}${p.max_uses ? `/${p.max_uses}` : ""} ${t(lang, "uses")}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    </button>
                    <span className="pill ok">−{Number(p.discount_pct)} %</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {property && villa && <PriceCheck lang={lang} propertyId={property} version={version} />}
      </div>

      {season && property && (
        <SeasonDialog
          lang={lang}
          season={season === "new" ? null : season}
          propertyId={property}
          onClose={() => setSeason(null)}
          onSaved={() => {
            setSeason(null);
            load();
          }}
        />
      )}
      {promo && (
        <PromoDialog
          lang={lang}
          villas={villas}
          promo={promo === "new" ? null : promo}
          onClose={() => setPromo(null)}
          onSaved={() => {
            setPromo(null);
            load();
          }}
        />
      )}
    </main>
  );
}

function PricingForm({ lang, pricing, onSaved }: { lang: Lang; pricing: Pricing; onSaved: () => void }) {
  const init = () => ({
    base_price: str(pricing.base_price),
    weekend_price: str(pricing.weekend_price),
    min_nights: str(pricing.min_nights),
    included_guests: str(pricing.included_guests),
    extra_guest_fee: str(pricing.extra_guest_fee),
    cleaning_fee: str(pricing.cleaning_fee),
    min_advance_days: str(pricing.min_advance_days),
    max_advance_days: str(pricing.max_advance_days),
    gap_max_nights: str(pricing.gap_max_nights),
    gap_min_nights: str(pricing.gap_min_nights),
    gap_discount_pct: str(pricing.gap_discount_pct),
    direct_booking_enabled: pricing.direct_booking_enabled,
    deposit_pct: str(pricing.deposit_pct),
    balance_days_before: str(pricing.balance_days_before),
  });
  const [f, setF] = useState(init);
  const [state, setState] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(init());
  const field = (k: keyof typeof f, label: Key, suffix = "€") => (
    <label>
      {t(lang, label)}
      <span className="with-suffix">
        <input inputMode="decimal" value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        <span className="muted">{suffix}</span>
      </span>
    </label>
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const row = {
      base_price: num(f.base_price) ?? 0,
      weekend_price: num(f.weekend_price),
      min_nights: num(f.min_nights) ?? 1,
      included_guests: num(f.included_guests) ?? 1,
      extra_guest_fee: num(f.extra_guest_fee) ?? 0,
      cleaning_fee: num(f.cleaning_fee) ?? 0,
      min_advance_days: num(f.min_advance_days) ?? 0,
      max_advance_days: num(f.max_advance_days) ?? 540,
      gap_max_nights: num(f.gap_max_nights) ?? 0,
      gap_min_nights: num(f.gap_min_nights) ?? 1,
      gap_discount_pct: num(f.gap_discount_pct) ?? 0,
      direct_booking_enabled: f.direct_booking_enabled,
      deposit_pct: num(f.deposit_pct) ?? 30,
      balance_days_before: num(f.balance_days_before) ?? 30,
    };
    if (row.direct_booking_enabled && !(row.base_price > 0)) return setError(t(lang, "needBasePrice"));
    const { error } = await supabase.from("pricing").update(row).eq("property_id", pricing.property_id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    setState("saved");
    onSaved();
  }

  return (
    <form className="panel rates-form" onSubmit={save}>
      <h2>
        <span className="h-icon"><Icon name="money" size={16} /></span>
        {t(lang, "basePrices")}
      </h2>
      <div className="two">
        {field("base_price", "basePrice")}
        {field("weekend_price", "weekendPrice")}
      </div>
      <div className="two">
        {field("cleaning_fee", "cleaningFee")}
        {field("min_nights", "minNights", t(lang, "nights"))}
      </div>
      <div className="two">
        {field("included_guests", "includedGuests", t(lang, "guests"))}
        {field("extra_guest_fee", "extraGuestFee", `€ / ${t(lang, "night")}`)}
      </div>
      <div className="two">
        {field("min_advance_days", "minAdvance", t(lang, "daysWorked"))}
        {field("max_advance_days", "maxAdvance", t(lang, "daysWorked"))}
      </div>
      <h3>{t(lang, "cardPayments")}</h3>
      <div className="two">
        {field("deposit_pct", "depositPct", "%")}
        {field("balance_days_before", "balanceDays", t(lang, "daysBeforeArrival"))}
      </div>
      <h3>{t(lang, "gapNights")}</h3>
      <p className="muted small">{t(lang, "gapNightsHint")}</p>
      <div className="three">
        {field("gap_max_nights", "gapMax", t(lang, "nights"))}
        {field("gap_min_nights", "gapMin", t(lang, "nights"))}
        {field("gap_discount_pct", "gapDiscount", "%")}
      </div>
      <label className="inline toggle-line">
        <input type="checkbox" checked={f.direct_booking_enabled} onChange={(e) => setF({ ...f, direct_booking_enabled: e.target.checked })} />
        <span>
          <strong>{t(lang, "directBookingOn")}</strong>
          <br />
          <small className="muted">{t(lang, "directBookingHint")}</small>
        </span>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="task-row">
        <span>{state === "saved" && !dirty && <span className="ok-text">{t(lang, "saved")}</span>}</span>
        <button className="primary" disabled={!dirty}>{t(lang, "save")}</button>
      </div>
    </form>
  );
}

function PlanRow({ lang, plan, onSaved }: { lang: Lang; plan: Plan; onSaved: () => void }) {
  const [f, setF] = useState({ discount: str(plan.discount_pct), days: str(plan.kind === "last_minute" ? plan.max_days_ahead : plan.min_days_ahead) });
  const windowed = plan.kind === "early_bird" || plan.kind === "last_minute";
  const dirty = f.discount !== str(plan.discount_pct) || (windowed && f.days !== str(plan.kind === "last_minute" ? plan.max_days_ahead : plan.min_days_ahead));

  async function update(patch: Partial<Plan>) {
    await supabase.from("rate_plans").update(patch).eq("id", plan.id);
    onSaved();
  }
  const save = () =>
    update({
      discount_pct: num(f.discount) ?? 0,
      ...(plan.kind === "early_bird" && { min_days_ahead: num(f.days) }),
      ...(plan.kind === "last_minute" && { max_days_ahead: num(f.days) }),
    });

  return (
    <li className={`item plan-row${plan.active ? "" : " faded"}`}>
      <label className="inline">
        <input type="checkbox" checked={plan.active} onChange={(e) => update({ active: e.target.checked })} />
        <span>
          <strong>{planName(lang, plan)}</strong>
          <br />
          <small className="muted">{t(lang, `planHint_${plan.kind}` as Key)}</small>
        </span>
      </label>
      <span className="spacer" />
      <span className="inline">
        −<input className="narrow-input" inputMode="decimal" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} aria-label={t(lang, "discount")} /> %
      </span>
      {windowed && (
        <span className="inline">
          {t(lang, plan.kind === "early_bird" ? "atLeast" : "atMost")}
          <input className="narrow-input" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} aria-label={t(lang, "daysAhead")} />
          {t(lang, plan.kind === "early_bird" ? "daysOrMore" : "daysOrLess")}
        </span>
      )}
      {dirty && <button className="small-btn primary" onClick={save}>{t(lang, "save")}</button>}
    </li>
  );
}

function SeasonDialog({ lang, season, propertyId, onClose, onSaved }: { lang: Lang; season: Season | null; propertyId: string; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    name: season?.name ?? "",
    starts: season?.starts ?? today(),
    ends: season?.ends ?? addDays(today(), 30),
    price: str(season?.price),
    weekend_price: str(season?.weekend_price),
    min_nights: str(season?.min_nights),
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => ref.current?.showModal(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const price = num(f.price);
    if (price == null || price < 0) return setError(t(lang, "amountRequired"));
    if (f.ends < f.starts) return setError(t(lang, "badDates"));
    const row = { property_id: propertyId, name: f.name.trim(), starts: f.starts, ends: f.ends, price, weekend_price: num(f.weekend_price), min_nights: num(f.min_nights) };
    const { error } = season ? await supabase.from("rate_seasons").update(row).eq("id", season.id) : await supabase.from("rate_seasons").insert(row);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }
  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    await supabase.from("rate_seasons").update({ deleted_at: new Date().toISOString() }).eq("id", season!.id);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{season ? season.name || t(lang, "season") : t(lang, "newSeason")}</h2>
        <label>{t(lang, "seasonName")}<input value={f.name} placeholder={t(lang, "seasonPlaceholder")} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="two">
          <label>{t(lang, "firstNight")}<input type="date" value={f.starts} onChange={(e) => e.target.value && setF({ ...f, starts: e.target.value })} required /></label>
          <label>{t(lang, "lastNight")}<input type="date" value={f.ends} onChange={(e) => e.target.value && setF({ ...f, ends: e.target.value })} required /></label>
        </div>
        <div className="two">
          <label>{t(lang, "pricePerNight")}<input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></label>
          <label>{t(lang, "weekendPrice")}<input inputMode="decimal" value={f.weekend_price} placeholder={t(lang, "sameAsAbove")} onChange={(e) => setF({ ...f, weekend_price: e.target.value })} /></label>
        </div>
        <label>{t(lang, "minNights")}<input inputMode="numeric" value={f.min_nights} placeholder={t(lang, "asUsual")} onChange={(e) => setF({ ...f, min_nights: e.target.value })} /></label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {season && (
            <button type="button" className={`danger${confirmDelete ? " confirm" : ""}`} onClick={remove}>
              {confirmDelete ? t(lang, "sureDelete") : t(lang, "delete")}
            </button>
          )}
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}

function PromoDialog({ lang, villas, promo, onClose, onSaved }: { lang: Lang; villas: Villas; promo: Promo | null; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    code: promo?.code ?? "",
    property_id: promo?.property_id ?? "",
    discount_pct: str(promo?.discount_pct ?? 10),
    valid_from: promo?.valid_from ?? "",
    valid_to: promo?.valid_to ?? "",
    max_uses: str(promo?.max_uses),
    active: promo?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => ref.current?.showModal(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const code = f.code.trim().toUpperCase().replace(/\s+/g, "");
    if (code.length < 3) return setError(t(lang, "codeTooShort"));
    const row = {
      code,
      property_id: f.property_id || null,
      discount_pct: num(f.discount_pct) ?? 0,
      valid_from: f.valid_from || null,
      valid_to: f.valid_to || null,
      max_uses: num(f.max_uses),
      active: f.active,
    };
    const { error } = promo ? await supabase.from("promo_codes").update(row).eq("id", promo.id) : await supabase.from("promo_codes").insert(row);
    if (error) return setError(error.code === "23505" ? t(lang, "codeExists") : `${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{promo ? promo.code : t(lang, "newPromo")}</h2>
        <div className="two">
          <label>{t(lang, "code")}<input className="mono" value={f.code} placeholder="FAMILIA10" onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} autoFocus={!promo} /></label>
          <label>{t(lang, "discount")} (%)<input inputMode="decimal" value={f.discount_pct} onChange={(e) => setF({ ...f, discount_pct: e.target.value })} /></label>
        </div>
        <label>
          {t(lang, "villa")}
          <select value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}>
            <option value="">{t(lang, "bothVillas")}</option>
            {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div className="two">
          <label>{t(lang, "validFrom")}<input type="date" value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} /></label>
          <label>{t(lang, "validTo")}<input type="date" value={f.valid_to} onChange={(e) => setF({ ...f, valid_to: e.target.value })} /></label>
        </div>
        <label>{t(lang, "maxUses")}<input inputMode="numeric" value={f.max_uses} placeholder={t(lang, "unlimited")} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></label>
        <label className="inline"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t(lang, "active")}</label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}

// The same price the website would show, for a phone or email enquiry.
function PriceCheck({ lang, propertyId, version }: { lang: Lang; propertyId: string; version: number }) {
  const [f, setF] = useState({ check_in: addDays(today(), 30), check_out: addDays(today(), 34), guests: "4", promo: "" });
  const [q, setQ] = useState<Quote | null>(null);
  const loc = locale[lang];

  const run = useCallback(async () => {
    const { data } = await supabase.rpc("quote", { p_villa: propertyId, p_check_in: f.check_in, p_check_out: f.check_out, p_guests: Number(f.guests) || 1, p_promo: f.promo || null });
    setQ(data as Quote);
  }, [propertyId, f, version]);
  useEffect(() => {
    run();
  }, [run]);

  return (
    <section className="panel price-check">
      <h2>
        <span className="h-icon"><Icon name="search" size={16} /></span>
        {t(lang, "priceCheck")}
      </h2>
      <div className="two">
        <label>{t(lang, "arrival")}<input type="date" value={f.check_in} onChange={(e) => e.target.value && setF({ ...f, check_in: e.target.value })} /></label>
        <label>{t(lang, "departure")}<input type="date" value={f.check_out} onChange={(e) => e.target.value && setF({ ...f, check_out: e.target.value })} /></label>
      </div>
      <div className="two">
        <label>{t(lang, "guestsLabel")}<input inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></label>
        <label>{t(lang, "promoCode")}<input className="mono" value={f.promo} onChange={(e) => setF({ ...f, promo: e.target.value.toUpperCase() })} /></label>
      </div>
      {q && !q.available && <p className="banner">{quoteReason(lang, q)}</p>}
      {q?.available && <QuoteBreakdown lang={lang} q={q} />}
      {q?.available && <p className="hint">{format(f.check_in, loc, { weekday: "short", day: "numeric", month: "short" })} → {format(f.check_out, loc, { weekday: "short", day: "numeric", month: "short" })}</p>}
    </section>
  );
}

export function QuoteBreakdown({ lang, q }: { lang: Lang; q: Quote }) {
  const loc = locale[lang];
  return (
    <div className="quote">
      <table className="data">
        <tbody>
          <tr>
            <th>
              {q.nights} {t(lang, "nights")}
              {q.gap && <span className="pill ok">{t(lang, "gapNights")} −{Number(q.gap_discount_pct)} %</span>}
            </th>
            <td>{eur(q.accommodation, loc)}</td>
          </tr>
          {q.extra_guests > 0 && (
            <tr>
              <th>{t(lang, "extraGuests")}</th>
              <td>{eur(q.extra_guests, loc)}</td>
            </tr>
          )}
          {q.cleaning > 0 && (
            <tr>
              <th>{t(lang, "cleaningFee")}</th>
              <td>{eur(q.cleaning, loc)}</td>
            </tr>
          )}
          {q.promo && (
            <tr>
              <th>{t(lang, "promoCode")} {q.promo.code}</th>
              <td>−{Number(q.promo.discount_pct)} %</td>
            </tr>
          )}
        </tbody>
      </table>
      {q.promo_invalid && <p className="error small">{t(lang, "promoInvalid")}</p>}
      <ul className="list">
        {q.options.map((o) => (
          <li key={o.plan} className="item">
            <span>
              <strong>{planName(lang, o)}</strong>
              <small>{[o.discount_pct > 0 && `−${Number(o.discount_pct)} %`, !o.refundable && t(lang, "noRefund")].filter(Boolean).join(" · ") || t(lang, "standardTerms")}</small>
            </span>
            <span className="spacer" />
            <span className="amount">{eur(o.total, loc)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
