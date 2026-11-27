import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { locale, t, type Key, type Lang } from "../lib/i18n";
import { pickLang, type Multi } from "../lib/checkin";
import { eur } from "../lib/money";
import type { Villas } from "../lib/villas";
import { Icon } from "./Icon";

interface Category {
  id: string;
  property_id: string | null;
  name: Multi;
  sort: number;
}
interface Item {
  id: string;
  category_id: string;
  name: Multi;
  description: Multi;
  price: number;
  vat_rate: number;
  allergens: string[];
  available: boolean;
  sort: number;
}

// The 14 allergens EU law requires on menus (same list as the database check).
export const allergens = ["gluten", "crustaceans", "eggs", "fish", "peanuts", "soy", "milk", "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"] as const;
const vatRates = [10, 21, 4, 0];
const textLangs = ["es", "en", "fr"] as const;
type TextLang = (typeof textLangs)[number];

// Settings → Restaurant menu: categories and items (dishes, drinks, extras) with prices incl. VAT and
// allergens, ready for the hotel's restaurant. Owners and managers edit; the whole team can read it.
export function MenuSettings({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<{ type: "category"; row: Category | null } | { type: "item"; row: Item | null; categoryId: string } | null>(null);
  const loc = locale[lang];

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from("menu_categories").select("id, property_id, name, sort").is("deleted_at", null).order("sort"),
      supabase.from("menu_items").select("id, category_id, name, description, price, vat_rate, allergens, available, sort").is("deleted_at", null).order("sort"),
    ]);
    setCats((c.data ?? []) as Category[]);
    setItems((i.data ?? []) as Item[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(i: Item) {
    await supabase.from("menu_items").update({ available: !i.available }).eq("id", i.id);
    load();
  }

  const where = (c: Category) => (c.property_id ? villas.properties.find((p) => p.id === c.property_id)?.name : t(lang, "allProperties"));

  return (
    <section className="settings-grid">
      <div className="page-head">
        <div>
          <h2 className="title">{t(lang, "set_menu")}</h2>
          <p className="muted">{t(lang, "menuSub")}</p>
        </div>
        <button className="primary" onClick={() => setOpen({ type: "category", row: null })}>
          <Icon name="plus" size={18} /> {t(lang, "newCategory")}
        </button>
      </div>

      {cats.length === 0 && <p className="muted">{t(lang, "menuEmpty")}</p>}
      {cats.map((c) => {
        const mine = items.filter((i) => i.category_id === c.id);
        return (
          <article key={c.id} className="panel">
            <h2>
              {pickLang(c.name, lang) || "—"}
              <span className="pill">{where(c)}</span>
              <button className="small-btn push" onClick={() => setOpen({ type: "category", row: c })}>
                {t(lang, "edit")}
              </button>
            </h2>
            {mine.length > 0 && (
              <ul className="list">
                {mine.map((i) => (
                  <li key={i.id} className={`item${i.available ? "" : " faded"}`}>
                    <button className="item-main" onClick={() => setOpen({ type: "item", row: i, categoryId: c.id })}>
                      <span>
                        <strong>{pickLang(i.name, lang) || "—"}</strong>
                        <small>
                          {[pickLang(i.description, lang), i.allergens.map((a) => t(lang, `allergen_${a}` as Key)).join(", ")].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                    </button>
                    <span className="menu-price">
                      <strong>{eur(Number(i.price), loc)}</strong>
                      <small>
                        {t(lang, "vat")} {Number(i.vat_rate)} %
                      </small>
                    </span>
                    <label className="inline small" title={t(lang, "availableHint")}>
                      <input type="checkbox" checked={i.available} onChange={() => toggle(i)} /> {t(lang, "available")}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="row-btns">
              <button className="small-btn" onClick={() => setOpen({ type: "item", row: null, categoryId: c.id })}>
                <Icon name="plus" size={16} /> {t(lang, "newMenuItem")}
              </button>
            </div>
          </article>
        );
      })}

      {open?.type === "category" && (
        <CategoryDialog
          key={open.row?.id ?? "new"}
          lang={lang}
          villas={villas}
          row={open.row}
          count={cats.length}
          itemCount={open.row ? items.filter((i) => i.category_id === open.row!.id).length : 0}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}
      {open?.type === "item" && (
        <ItemDialog
          key={open.row?.id ?? "new"}
          lang={lang}
          cats={cats}
          row={open.row}
          categoryId={open.categoryId}
          count={items.filter((i) => i.category_id === open.categoryId).length}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}

// ES / EN / FR switch for the texts being edited; a dot marks a language still empty.
function LangSwitch({ value, onChange, filled }: { value: TextLang; onChange: (l: TextLang) => void; filled: (l: TextLang) => boolean }) {
  return (
    <div className="segmented">
      {textLangs.map((l) => (
        <button type="button" key={l} className={l === value ? "on" : ""} onClick={() => onChange(l)}>
          {l.toUpperCase()}
          {!filled(l) && <span className="dot" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

const firstLang = (lang: Lang): TextLang => ((textLangs as readonly string[]).includes(lang) ? (lang as TextLang) : "es");
const clean = (m: Multi): Multi => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v));

function CategoryDialog({
  lang,
  villas,
  row,
  count,
  itemCount,
  onClose,
  onSaved,
}: {
  lang: Lang;
  villas: Villas;
  row: Category | null;
  count: number;
  itemCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState<Multi>(row?.name ?? {});
  const [property, setProperty] = useState(row?.property_id ?? "");
  const [textLang, setTextLang] = useState<TextLang>(firstLang(lang));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    // The dialog focuses its first button (the language switch); start in the name field instead.
    ref.current?.querySelector("input")?.focus();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pickLang(name, lang)) return setError(t(lang, "nameRequired"));
    const values = { name: clean(name), property_id: property || null };
    const { error } = row
      ? await supabase.from("menu_categories").update(values).eq("id", row.id)
      : await supabase.from("menu_categories").insert({ ...values, sort: count + 1 });
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
    ref.current?.close();
  }

  async function remove() {
    if (!row) return;
    if (itemCount) return setError(t(lang, "categoryNotEmpty"));
    if (!confirming) return setConfirming(true);
    await supabase.from("menu_categories").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    onSaved();
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{row ? pickLang(row.name, lang) : t(lang, "newCategory")}</h2>
        <LangSwitch value={textLang} onChange={setTextLang} filled={(l) => !!name[l]?.trim()} />
        <label>
          {t(lang, "name")} ({textLang.toUpperCase()})
          <input value={name[textLang] ?? ""} onChange={(e) => setName({ ...name, [textLang]: e.target.value })} autoFocus placeholder={t(lang, "categoryPlaceholder")} />
        </label>
        <label>
          {t(lang, "servedAt")}
          <select value={property} onChange={(e) => setProperty(e.target.value)}>
            <option value="">{t(lang, "allProperties")}</option>
            {villas.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="actions">
          {row && (
            <button type="button" className={confirming ? "danger confirm" : "danger"} onClick={remove}>
              {confirming ? t(lang, "confirmDeleteCategory") : t(lang, "delete")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}

function ItemDialog({
  lang,
  cats,
  row,
  categoryId,
  count,
  onClose,
  onSaved,
}: {
  lang: Lang;
  cats: Category[];
  row: Item | null;
  categoryId: string;
  count: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    category_id: row?.category_id ?? categoryId,
    name: row?.name ?? ({} as Multi),
    description: row?.description ?? ({} as Multi),
    price: row ? String(row.price).replace(".", locale[lang].startsWith("en") ? "." : ",") : "",
    vat_rate: row?.vat_rate ?? 10,
    allergens: row?.allergens ?? [],
    available: row?.available ?? true,
  });
  const [textLang, setTextLang] = useState<TextLang>(firstLang(lang));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    // The dialog focuses its first button (the language switch); start in the name field instead.
    ref.current?.querySelector("input")?.focus();
  }, []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleAllergen = (a: string) => set("allergens", f.allergens.includes(a) ? f.allergens.filter((x) => x !== a) : [...f.allergens, a]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pickLang(f.name, lang)) return setError(t(lang, "nameRequired"));
    const price = Number(f.price.replace(",", "."));
    if (f.price.trim() === "" || !(price >= 0)) return setError(t(lang, "amountRequired"));
    const values = { ...f, name: clean(f.name), description: clean(f.description), price: Math.round(price * 100) / 100 };
    const { error } = row
      ? await supabase.from("menu_items").update(values).eq("id", row.id)
      : await supabase.from("menu_items").insert({ ...values, sort: count + 1 });
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
    ref.current?.close();
  }

  async function remove() {
    if (!row) return;
    if (!confirming) return setConfirming(true);
    await supabase.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    onSaved();
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{row ? pickLang(row.name, lang) : t(lang, "newMenuItem")}</h2>
        <LangSwitch value={textLang} onChange={setTextLang} filled={(l) => !!f.name[l]?.trim()} />
        <label>
          {t(lang, "name")} ({textLang.toUpperCase()})
          <input value={f.name[textLang] ?? ""} onChange={(e) => set("name", { ...f.name, [textLang]: e.target.value })} autoFocus={!row} placeholder={t(lang, "itemPlaceholder")} />
        </label>
        <label>
          {t(lang, "description")} ({textLang.toUpperCase()})
          <textarea rows={2} value={f.description[textLang] ?? ""} onChange={(e) => set("description", { ...f.description, [textLang]: e.target.value })} />
        </label>
        <div className="two">
          <label>
            {t(lang, "priceInclVat")}
            <input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="0,00" />
          </label>
          <label>
            {t(lang, "vat")}
            <select value={f.vat_rate} onChange={(e) => set("vat_rate", Number(e.target.value))}>
              {vatRates.map((v) => (
                <option key={v} value={v}>
                  {v} %{v === 10 ? ` · ${t(lang, "vatFood")}` : v === 21 ? ` · ${t(lang, "vatAlcohol")}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t(lang, "category")}
          <select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {pickLang(c.name, lang) || "—"}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="field-label">{t(lang, "allergens")}</legend>
          <div className="allergen-grid">
            {allergens.map((a) => (
              <label key={a} className="inline small">
                <input type="checkbox" checked={f.allergens.includes(a)} onChange={() => toggleAllergen(a)} /> {t(lang, `allergen_${a}` as Key)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline">
          <input type="checkbox" checked={f.available} onChange={(e) => set("available", e.target.checked)} /> {t(lang, "available")}
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="actions">
          {row && (
            <button type="button" className={confirming ? "danger confirm" : "danger"} onClick={remove}>
              {confirming ? t(lang, "confirmDeleteItem") : t(lang, "delete")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}
