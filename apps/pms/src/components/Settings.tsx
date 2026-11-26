import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { t, type Lang } from "../lib/i18n";
import type { Villas } from "../lib/villas";
import type { Multi } from "../lib/checkin";
import { Icon } from "./Icon";

type Kind = "wifi" | "directions" | "rules" | "info";
interface Item {
  id: string;
  property_id: string;
  kind: Kind;
  title: Multi;
  body: Multi;
  sort: number;
}
const textLangs = ["en", "es", "fr"] as const;
const kinds: Kind[] = ["wifi", "directions", "info", "rules"];

// What guests see after checking in, per villa, defined by the family.
export function Settings({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [items, setItems] = useState<Item[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const property = propertyId ?? villas.properties[0]?.id ?? null;

  async function load() {
    const { data } = await supabase.from("guide_items").select("id, property_id, kind, title, body, sort").is("deleted_at", null).order("sort");
    setItems((data as Item[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!property) return;
    const sort = Math.max(0, ...items.filter((i) => i.property_id === property).map((i) => i.sort)) + 1;
    await supabase.from("guide_items").insert({ property_id: property, kind: "info", title: { en: "", es: "", fr: "" }, body: {}, sort });
    load();
  }

  const mine = items.filter((i) => i.property_id === property);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t(lang, "settings")}</p>
          <h1 className="title">{t(lang, "guestInfo")}</h1>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 14 }}>
        {t(lang, "guestInfoSub")}
      </p>
      <div className="toolbar">
        <div className="segmented">
          {villas.properties.map((p) => (
            <button key={p.id} className={p.id === property ? "on" : ""} onClick={() => setPropertyId(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <button onClick={add}>
          <Icon name="plus" size={18} /> {t(lang, "addSection").replace("+ ", "")}
        </button>
      </div>
      <div className="settings-grid">
        {mine.map((it) => (
          <GuideItem key={it.id} lang={lang} item={it} onChanged={load} />
        ))}
      </div>
    </main>
  );
}

function GuideItem({ lang, item, onChanged }: { lang: Lang; item: Item; onChanged: () => void }) {
  const [f, setF] = useState(item);
  const [textLang, setTextLang] = useState<(typeof textLangs)[number]>(lang);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(item);

  async function save() {
    setState("saving");
    const { error } = await supabase.from("guide_items").update({ kind: f.kind, title: f.title, body: f.body }).eq("id", item.id);
    setState(error ? "idle" : "saved");
    if (!error) onChanged();
  }

  async function remove() {
    if (!confirming) return setConfirming(true);
    await supabase.from("guide_items").update({ deleted_at: new Date().toISOString() }).eq("id", item.id);
    onChanged();
  }

  return (
    <section className="guide-edit">
      <header>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })} style={{ width: "auto" }}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(lang, `kind_${k}`)}
            </option>
          ))}
        </select>
        <div className="segmented" aria-label={t(lang, "guide_edit_lang")}>
          {textLangs.map((l) => (
            <button key={l} className={l === textLang ? "on" : ""} onClick={() => setTextLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <label>
        {t(lang, "sectionTitle")}
        <input value={f.title[textLang] ?? ""} onChange={(e) => setF({ ...f, title: { ...f.title, [textLang]: e.target.value } })} />
      </label>
      <label>
        {t(lang, "sectionBody")}
        <textarea rows={f.kind === "rules" ? 6 : 4} value={f.body[textLang] ?? ""} onChange={(e) => setF({ ...f, body: { ...f.body, [textLang]: e.target.value } })} />
      </label>
      <div className="actions" style={{ position: "static", margin: 0, padding: "10px 0 0" }}>
        <button className={confirming ? "danger confirm" : "danger"} onClick={remove}>
          {confirming ? t(lang, "confirmDeleteSection") : t(lang, "delete")}
        </button>
        <span className="spacer" />
        {state === "saved" && !dirty && <span className="muted">✓ {t(lang, "saved")}</span>}
        <button className="primary" disabled={!dirty || state === "saving"} onClick={save}>
          {t(lang, "save")}
        </button>
      </div>
    </section>
  );
}
