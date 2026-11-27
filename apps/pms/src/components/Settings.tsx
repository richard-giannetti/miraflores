import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { t, type Lang } from "../lib/i18n";
import type { Villas } from "../lib/villas";
import type { Multi } from "../lib/checkin";
import { Icon, type IconName } from "./Icon";
import { PropertiesSettings } from "./Properties";
import { MenuSettings } from "./Menu";
import { EmailSettingsPanel } from "./Emails";
import { TemplatesEditor } from "./Messages";
import { AirbnbSync } from "./AirbnbSync";
import type { Profile } from "../lib/types";

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

const sections = ["properties", "menu", "team", "guide", "messages", "emails", "airbnb"] as const;
type Section = (typeof sections)[number];
const sectionIcon: Record<Section, IconName> = { properties: "bed", menu: "tag", team: "team", guide: "message", messages: "phone", emails: "mail", airbnb: "repeat" };

// The admin's settings: one menu of sections (System Settings style). Desktop shows the list and the open
// section side by side; phones show the list, then the section with a way back.
export function Settings({ lang, villas, profile, section }: { lang: Lang; villas: Villas; profile: Profile; section: string | null }) {
  const asked = (sections as readonly string[]).includes(section ?? "") ? (section as Section) : null;
  const current: Section = asked && asked !== "team" ? asked : "properties";
  return (
    <main className="page settings-page">
      <div className={`settings-layout${asked ? " has-section" : ""}`}>
        <nav className="settings-nav" aria-label={t(lang, "settings")}>
          <h1 className="title">{t(lang, "settings")}</h1>
          <ul className="list panel more-list">
            {sections.map((x) => (
              <li key={x} className={`item${x === current ? " on" : ""}`}>
                {/* The team already has its own screen; the menu just leads there. */}
                <a className="item-main" href={x === "team" ? "#staff" : `#settings/${x}`} aria-current={x === current ? "page" : undefined}>
                  <span className="h-icon">
                    <Icon name={sectionIcon[x]} />
                  </span>
                  <span>
                    <strong>{t(lang, `set_${x}`)}</strong>
                    <small>{t(lang, `set_${x}_sub`)}</small>
                  </span>
                </a>
                <Icon name="right" size={16} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-body">
          <a className="back-link" href="#settings">
            <Icon name="left" size={16} /> {t(lang, "settings")}
          </a>
          {current === "properties" && <PropertiesSettings lang={lang} profile={profile} villas={villas} />}
          {current === "menu" && <MenuSettings lang={lang} villas={villas} />}
          {current === "guide" && <GuideSettings lang={lang} villas={villas} />}
          {current === "messages" && <TemplatesEditor lang={lang} />}
          {current === "emails" && <EmailSettingsPanel lang={lang} />}
          {current === "airbnb" && <AirbnbSync lang={lang} profile={profile} />}
        </div>
      </div>
    </main>
  );
}

// What guests see after checking in, per villa, defined by the family.
function GuideSettings({ lang, villas }: { lang: Lang; villas: Villas }) {
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
    <section className="settings-grid">
      <div className="page-head">
        <div>
          <h2 className="title">{t(lang, "guestInfo")}</h2>
          <p className="muted">{t(lang, "guestInfoSub")}</p>
        </div>
      </div>
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
      {mine.map((it) => (
        <GuideItem key={it.id} lang={lang} item={it} onChanged={load} />
      ))}
    </section>
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
