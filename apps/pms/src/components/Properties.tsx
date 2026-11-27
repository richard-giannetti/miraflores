import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { t, type Lang } from "../lib/i18n";
import type { Profile } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Icon } from "./Icon";

type PropertyKind = "villa" | "hotel";
type UnitKind = "whole_property" | "room";
interface PropertyRow {
  id: string;
  name: string;
  slug: string;
  kind: PropertyKind;
  locality: string;
  check_in_time: string;
  check_out_time: string;
  color: string;
  sort: number;
}
interface UnitRow {
  id: string;
  property_id: string;
  name: string;
  kind: UnitKind;
  capacity: number;
  bedrooms: number | null;
  sort: number;
  active: boolean;
}
interface CheckRow {
  id: string;
  property_id: string;
  label: string;
  sort: number;
}

const hm = (time: string) => time.slice(0, 5);
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "property";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

type Open = { type: "property"; row: PropertyRow | null } | { type: "unit"; row: UnitRow | null; property: PropertyRow } | null;

// Settings → Villas and rooms: the properties (villas, later the hotel), their bookable rooms and each one's
// cleaning checklist. Properties and rooms: owners (database policy); checklists: owners and managers.
export function PropertiesSettings({ lang, profile, villas }: { lang: Lang; profile: Profile; villas: Villas }) {
  const isOwner = profile.role === "owner";
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [open, setOpen] = useState<Open>(null);

  const load = useCallback(async () => {
    const [p, u, c] = await Promise.all([
      supabase.from("properties").select("id, name, slug, kind, locality, check_in_time, check_out_time, color, sort").is("deleted_at", null).order("sort"),
      supabase.from("units").select("id, property_id, name, kind, capacity, bedrooms, sort, active").is("deleted_at", null).order("sort"),
      supabase.from("checklist_items").select("id, property_id, label, sort").is("deleted_at", null).order("sort"),
    ]);
    setProperties((p.data ?? []) as PropertyRow[]);
    setUnits((u.data ?? []) as UnitRow[]);
    setChecks((c.data ?? []) as CheckRow[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const changed = () => {
    load();
    villas.reload();
  };

  return (
    <section className="settings-grid">
      <div className="page-head">
        <div>
          <h2 className="title">{t(lang, "set_properties")}</h2>
          <p className="muted">{t(lang, "propertiesSub")}</p>
        </div>
        {isOwner && (
          <button className="primary" onClick={() => setOpen({ type: "property", row: null })}>
            <Icon name="plus" size={18} /> {t(lang, "newProperty")}
          </button>
        )}
      </div>
      {!isOwner && <p className="hint">{t(lang, "propertiesOwnerOnly")}</p>}

      {properties.map((p) => {
        const mine = units.filter((u) => u.property_id === p.id);
        return (
          <article key={p.id} className="panel property-panel">
            <h2>
              <span className="swatch" style={{ background: p.color }} aria-hidden />
              {p.name}
              <span className="pill">{t(lang, `propKind_${p.kind}`)}</span>
              {isOwner && (
                <button className="small-btn push" onClick={() => setOpen({ type: "property", row: p })}>
                  {t(lang, "edit")}
                </button>
              )}
            </h2>
            <p className="muted small">
              {[p.locality, `${t(lang, "checkInFrom")} ${hm(p.check_in_time)}`, `${t(lang, "checkOutBy")} ${hm(p.check_out_time)}`].filter(Boolean).join(" · ")}
            </p>
            <h3 className="subhead">{t(lang, p.kind === "hotel" ? "roomsTitle" : "unitsTitle")}</h3>
            {mine.length === 0 ? (
              <p className="muted small">{t(lang, "noRooms")}</p>
            ) : (
              <ul className="list">
                {mine.map((u) => (
                  <li key={u.id} className={`item${u.active ? "" : " faded"}`}>
                    <button className="item-main" disabled={!isOwner} onClick={() => setOpen({ type: "unit", row: u, property: p })}>
                      <span className="h-icon">
                        <Icon name="bed" />
                      </span>
                      <span>
                        <strong>{u.name}</strong>
                        <small>
                          {[
                            t(lang, `unitKind_${u.kind}`),
                            `${u.capacity} ${t(lang, "guestsShort")}`,
                            u.bedrooms != null && `${u.bedrooms} ${t(lang, "bedroomsShort")}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    </button>
                    {!u.active && <span className="pill">{t(lang, "switchedOff")}</span>}
                  </li>
                ))}
              </ul>
            )}
            {isOwner && (
              <div className="row-btns">
                <button className="small-btn" onClick={() => setOpen({ type: "unit", row: null, property: p })}>
                  <Icon name="plus" size={16} /> {t(lang, p.kind === "hotel" ? "addRoom" : "addUnit")}
                </button>
              </div>
            )}
            <Checklist lang={lang} propertyId={p.id} items={checks.filter((c) => c.property_id === p.id)} onChanged={load} />
          </article>
        );
      })}

      {open?.type === "property" && (
        <PropertyDialog key={open.row?.id ?? "new"} lang={lang} row={open.row} count={properties.length} onClose={() => setOpen(null)} onSaved={changed} />
      )}
      {open?.type === "unit" && (
        <UnitDialog
          key={open.row?.id ?? "new"}
          lang={lang}
          row={open.row}
          property={open.property}
          count={units.filter((u) => u.property_id === open.property.id).length}
          onClose={() => setOpen(null)}
          onSaved={changed}
        />
      )}
    </section>
  );
}

function PropertyDialog({ lang, row, count, onClose, onSaved }: { lang: Lang; row: PropertyRow | null; count: number; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    name: row?.name ?? "",
    kind: row?.kind ?? ("villa" as PropertyKind),
    locality: row?.locality ?? "",
    check_in_time: hm(row?.check_in_time ?? "16:00"),
    check_out_time: hm(row?.check_out_time ?? "11:00"),
    color: row?.color ?? "#6b7a3a",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = f.name.trim();
    if (!name) return setError(t(lang, "nameRequired"));
    setBusy(true);
    const values = { ...f, name, locality: f.locality.trim() };
    let error;
    if (row) {
      ({ error } = await supabase.from("properties").update(values).eq("id", row.id));
    } else {
      // The slug must be unique (even among removed properties): add a short suffix if it's taken.
      ({ error } = await supabase.from("properties").insert({ ...values, slug: slugify(name), sort: count + 1 }));
      if (error?.code === "23505") ({ error } = await supabase.from("properties").insert({ ...values, slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 4)}`, sort: count + 1 }));
    }
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
    ref.current?.close();
  }

  // Only a property that never had a booking or block can be removed (history stays intact otherwise).
  async function remove() {
    if (!row) return;
    if (!confirming) return setConfirming(true);
    setBusy(true);
    const { data: us } = await supabase.from("units").select("id").eq("property_id", row.id);
    const ids = (us ?? []).map((u) => u.id);
    const { count: used } = ids.length ? await supabase.from("reservations").select("id", { count: "exact", head: true }).in("unit_id", ids) : { count: 0 };
    if (used) {
      setBusy(false);
      setConfirming(false);
      return setError(t(lang, "propertyHasBookings"));
    }
    const now = new Date().toISOString();
    if (ids.length) await supabase.from("units").update({ deleted_at: now }).in("id", ids);
    const { error } = await supabase.from("properties").update({ deleted_at: now }).eq("id", row.id);
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{row ? row.name : t(lang, "newProperty")}</h2>
        <label>
          {t(lang, "name")}
          <input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus={!row} placeholder="Villa…" />
        </label>
        <div className="two">
          <label>
            {t(lang, "propertyKind")}
            <select value={f.kind} onChange={(e) => set("kind", e.target.value as PropertyKind)}>
              <option value="villa">{t(lang, "propKind_villa")}</option>
              <option value="hotel">{t(lang, "propKind_hotel")}</option>
            </select>
          </label>
          <label>
            {t(lang, "locality")}
            <input value={f.locality} onChange={(e) => set("locality", e.target.value)} />
          </label>
        </div>
        <div className="two">
          <label>
            {t(lang, "checkInFrom")}
            <input type="time" value={f.check_in_time} onChange={(e) => set("check_in_time", e.target.value)} />
          </label>
          <label>
            {t(lang, "checkOutBy")}
            <input type="time" value={f.check_out_time} onChange={(e) => set("check_out_time", e.target.value)} />
          </label>
        </div>
        <label className="inline">
          <input type="color" value={f.color} onChange={(e) => set("color", e.target.value)} className="color-input" /> {t(lang, "calendarColour")}
        </label>
        {!row && <p className="hint">{t(lang, "newPropertyHint")}</p>}
        {error && <p className="error small">{error}</p>}
        <div className="actions">
          {row && (
            <button type="button" className={confirming ? "danger confirm" : "danger"} disabled={busy} onClick={remove}>
              {confirming ? t(lang, "confirmRemoveProperty") : t(lang, "delete")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary" disabled={busy}>{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}

function UnitDialog({
  lang,
  row,
  property,
  count,
  onClose,
  onSaved,
}: {
  lang: Lang;
  row: UnitRow | null;
  property: PropertyRow;
  count: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    name: row?.name ?? "",
    kind: row?.kind ?? ((property.kind === "hotel" ? "room" : "whole_property") as UnitKind),
    capacity: String(row?.capacity ?? 2),
    bedrooms: row?.bedrooms?.toString() ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = f.name.trim();
    if (!name) return setError(t(lang, "nameRequired"));
    const capacity = Number(f.capacity);
    if (!(capacity >= 1)) return setError(t(lang, "capacityRequired"));
    const values = { name, kind: f.kind, capacity, bedrooms: f.bedrooms === "" ? null : Number(f.bedrooms) };
    setBusy(true);
    const { error } = row
      ? await supabase.from("units").update(values).eq("id", row.id)
      : await supabase.from("units").insert({ ...values, property_id: property.id, sort: count + 1 });
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
    ref.current?.close();
  }

  // Switching a room off hides it from the calendar; not while it still has bookings to come.
  async function setActive(active: boolean) {
    if (!row) return;
    setBusy(true);
    setError(null);
    if (!active) {
      const { count: ahead } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("unit_id", row.id)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .gte("check_out", today());
      if (ahead) {
        setBusy(false);
        return setError(t(lang, "roomHasBookings").replace("{n}", String(ahead)));
      }
    }
    const { error } = await supabase.from("units").update({ active }).eq("id", row.id);
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{row ? row.name : t(lang, property.kind === "hotel" ? "addRoom" : "addUnit")}</h2>
        <p className="muted small">{property.name}</p>
        <label>
          {t(lang, "name")}
          <input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus={!row} placeholder={property.kind === "hotel" ? "101" : property.name} />
        </label>
        <label>
          {t(lang, "unitKind")}
          <select value={f.kind} onChange={(e) => set("kind", e.target.value as UnitKind)}>
            <option value="whole_property">{t(lang, "unitKind_whole_property")}</option>
            <option value="room">{t(lang, "unitKind_room")}</option>
          </select>
        </label>
        <div className="two">
          <label>
            {t(lang, "maxGuests")}
            <input type="number" min={1} max={40} inputMode="numeric" value={f.capacity} onChange={(e) => set("capacity", e.target.value)} />
          </label>
          <label>
            {t(lang, "bedrooms")}
            <input type="number" min={0} max={40} inputMode="numeric" value={f.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
          </label>
        </div>
        {!row && <p className="hint">{t(lang, "newRoomHint")}</p>}
        {error && <p className="error small">{error}</p>}
        <div className="actions">
          {row && (
            <button type="button" className={row.active ? "danger" : ""} disabled={busy} onClick={() => setActive(!row.active)}>
              {row.active ? t(lang, "switchOffRoom") : t(lang, "switchOnRoom")}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary" disabled={busy}>{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}

// The cleaning checklist ticked on each cleaning task (Spanish first: it's for the staff).
function Checklist({ lang, propertyId, items, onChanged }: { lang: Lang; propertyId: string; items: CheckRow[]; onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const sort = Math.max(0, ...items.map((i) => i.sort)) + 1;
    const { error } = await supabase.from("checklist_items").insert({ property_id: propertyId, label: label.trim(), sort });
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    setLabel("");
    onChanged();
  }
  async function rename(i: CheckRow, value: string) {
    if (!value.trim() || value.trim() === i.label) return;
    await supabase.from("checklist_items").update({ label: value.trim() }).eq("id", i.id);
    onChanged();
  }
  async function remove(i: CheckRow) {
    await supabase.from("checklist_items").update({ deleted_at: new Date().toISOString() }).eq("id", i.id);
    onChanged();
  }

  return (
    <details className="checklist-edit">
      <summary>
        {t(lang, "cleaningChecklist")} <span className="muted">({items.length})</span>
      </summary>
      <ul className="list">
        {items.map((i) => (
          <li key={i.id} className="item">
            <input className="grow-input" defaultValue={i.label} aria-label={t(lang, "checklistItem")} onBlur={(e) => rename(i, e.target.value)} />
            <button type="button" className="small-btn icon-only" onClick={() => remove(i)} aria-label={t(lang, "delete")} title={t(lang, "delete")}>
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form className="inline add-row" onSubmit={add}>
        <input className="grow-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t(lang, "checklistPlaceholder")} />
        <button className="small-btn" disabled={!label.trim()}>
          {t(lang, "add")}
        </button>
      </form>
      {error && <p className="error small">{error}</p>}
    </details>
  );
}
