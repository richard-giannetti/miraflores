import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase, OVERLAP } from "../lib/supabase";
import { daysBetween } from "../lib/dates";
import { t, type Lang } from "../lib/i18n";
import { newInvoice } from "./Invoices";
import { CheckinPanel } from "./CheckinPanel";
import { MessagesPanel } from "./Messages";
import { PaymentsPanel } from "./PaymentsPanel";
import { sources, statuses, type Guest, type Property, type ReservationKind, type ReservationSource, type ReservationStatus, type Unit } from "../lib/types";

// What the form edits: a reservation plus its guest's main details.
export interface Draft {
  id?: string;
  unit_id: string;
  guest_id?: string | null;
  kind?: ReservationKind;
  status?: ReservationStatus;
  source?: ReservationSource;
  check_in: string;
  check_out: string;
  adults?: number;
  children?: number;
  total_amount?: number | null;
  title?: string;
  notes?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

interface Props {
  lang: Lang;
  draft: Draft;
  units: Unit[];
  properties: Property[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ReservationDialog({ lang, draft, units, properties, canEdit, onClose, onSaved }: Props) {
  const [f, setF] = useState<Required<Omit<Draft, "id" | "guest_id">>>({
    unit_id: draft.unit_id,
    kind: draft.kind ?? "booking",
    status: draft.status ?? "confirmed",
    source: draft.source ?? "airbnb",
    check_in: draft.check_in,
    check_out: draft.check_out,
    adults: draft.adults ?? 2,
    children: draft.children ?? 0,
    total_amount: draft.total_amount ?? null,
    title: draft.title ?? "",
    notes: draft.notes ?? "",
    first_name: draft.first_name ?? "",
    last_name: draft.last_name ?? "",
    email: draft.email ?? "",
    phone: draft.phone ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The guest this booking is linked to; picking an existing guest avoids duplicates for returning guests.
  const [guestId, setGuestId] = useState<string | null>(draft.guest_id ?? null);
  const [known, setKnown] = useState<Guest[]>([]);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    if (canEdit)
      supabase
        .from("guests")
        .select("id, first_name, last_name, email, phone, notes")
        .is("deleted_at", null)
        .then(({ data }) => setKnown((data as Guest[]) ?? []));
  }, [canEdit]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const nights = daysBetween(f.check_in, f.check_out);
  const isBlock = f.kind === "block";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (nights < 1) return setError(t(lang, "badDates"));
    setBusy(true);
    setError(null);

    // The guest: update the linked one, or create one if a name or contact was given.
    let linked = guestId;
    const guest = { first_name: f.first_name.trim(), last_name: f.last_name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null };
    const hasGuest = !isBlock && (guest.first_name || guest.last_name || guest.email || guest.phone);
    if (hasGuest) {
      const res = linked
        ? await supabase.from("guests").update(guest).eq("id", linked).select("id").single()
        : await supabase.from("guests").insert(guest).select("id").single();
      if (res.error) return fail(res.error.message);
      linked = res.data.id;
    }

    const row = {
      unit_id: f.unit_id,
      guest_id: isBlock ? null : linked,
      kind: f.kind,
      status: f.status,
      source: isBlock ? "other" : f.source,
      check_in: f.check_in,
      check_out: f.check_out,
      adults: isBlock ? 0 : f.adults,
      children: isBlock ? 0 : f.children,
      total_amount: isBlock ? null : f.total_amount,
      title: f.title.trim(),
      notes: f.notes,
    } as const;
    const res = draft.id ? await supabase.from("reservations").update(row).eq("id", draft.id) : await supabase.from("reservations").insert(row);
    if (res.error) return fail(res.error.code === OVERLAP ? t(lang, "overlap") : `${t(lang, "saveFailed")} ${res.error.message}`);
    setBusy(false);
    onSaved();
  }

  // Deleting takes two clicks: the button turns into "Delete this reservation?" first.
  async function remove() {
    if (!draft.id) return;
    if (!confirming) return setConfirming(true);
    setBusy(true);
    // Soft delete, so offline devices can sync the deletion later (Wave 4).
    const res = await supabase.from("reservations").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id);
    if (res.error) return fail(`${t(lang, "saveFailed")} ${res.error.message}`);
    onSaved();
  }

  // A draft invoice for this stay: the guest as customer, one line for the stay at the booking's amount.
  async function invoice() {
    if (!draft.id) return;
    setBusy(true);
    const unit = units.find((u) => u.id === f.unit_id);
    const fmt = (d: string) => d.split("-").reverse().join("/");
    await newInvoice({
      reservationId: draft.id,
      customer: [f.first_name, f.last_name].filter(Boolean).join(" "),
      email: f.email,
      description: `${t("es", "stayLine")} ${unit?.name ?? ""}, ${fmt(f.check_in)} – ${fmt(f.check_out)} (${nights} ${t("es", "nights")})`,
      gross: f.total_amount,
      operationDate: f.check_out,
    });
    ref.current?.close();
  }

  function fail(msg: string) {
    setBusy(false);
    setError(msg);
  }

  // Existing guests matching what's typed in the name fields (only while no guest is linked).
  const needle = `${f.first_name} ${f.last_name}`.trim().toLowerCase();
  const matches =
    !guestId && needle.length >= 2
      ? known.filter((g) => `${g.first_name} ${g.last_name}`.toLowerCase().includes(needle) || g.email?.toLowerCase().includes(needle)).slice(0, 5)
      : [];
  function pick(g: Guest) {
    setGuestId(g.id);
    setF((x) => ({ ...x, first_name: g.first_name, last_name: g.last_name, email: g.email ?? "", phone: g.phone ?? "" }));
  }
  function unlink() {
    setGuestId(null);
    setF((x) => ({ ...x, first_name: "", last_name: "", email: "", phone: "" }));
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{draft.id ? t(lang, "editReservation") : t(lang, "newReservation")}</h2>
        <fieldset disabled={!canEdit || busy}>
          <div className="seg" role="radiogroup">
            {(["booking", "block"] as const).map((k) => (
              <button type="button" key={k} className={f.kind === k ? "on" : ""} onClick={() => set("kind", k)}>
                {t(lang, k)}
              </button>
            ))}
          </div>

          <label>
            {t(lang, "villa")}
            <select value={f.unit_id} onChange={(e) => set("unit_id", e.target.value)}>
              {properties.flatMap((p) => units.filter((u) => u.property_id === p.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </label>

          <div className="two">
            <label>
              {t(lang, "arrival")}
              <input type="date" required value={f.check_in} onChange={(e) => set("check_in", e.target.value)} />
            </label>
            <label>
              {t(lang, "departure")}
              <input type="date" required value={f.check_out} onChange={(e) => set("check_out", e.target.value)} />
            </label>
          </div>
          <p className="muted">{nights > 0 ? `${nights} ${t(lang, "nights")}` : t(lang, "badDates")}</p>

          {isBlock ? (
            <label>
              {t(lang, "blockReason")}
              <input value={f.title} onChange={(e) => set("title", e.target.value)} />
            </label>
          ) : (
            <>
              {guestId && (
                <p className="linked">
                  <span className="pill ok">{t(lang, "existingGuest")}</span>
                  {canEdit && (
                    <button type="button" className="link" onClick={unlink}>
                      {t(lang, "otherGuest")}
                    </button>
                  )}
                </p>
              )}
              <div className="two">
                <label>
                  {t(lang, "firstName")}
                  <input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} />
                </label>
                <label>
                  {t(lang, "lastName")}
                  <input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} />
                </label>
              </div>
              {matches.length > 0 && (
                <ul className="suggest" aria-label={t(lang, "existingGuest")}>
                  {matches.map((g) => (
                    <li key={g.id}>
                      <button type="button" onClick={() => pick(g)}>
                        <strong>{[g.first_name, g.last_name].filter(Boolean).join(" ")}</strong>
                        <small>{[g.email, g.phone].filter(Boolean).join(" · ")}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="two">
                <label>
                  {t(lang, "email")}
                  <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
                </label>
                <label>
                  {t(lang, "phone")}
                  <input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
                </label>
              </div>
              <div className="two">
                <label>
                  {t(lang, "adults")}
                  <input type="number" min={0} value={f.adults} onChange={(e) => set("adults", Number(e.target.value))} />
                </label>
                <label>
                  {t(lang, "children")}
                  <input type="number" min={0} value={f.children} onChange={(e) => set("children", Number(e.target.value))} />
                </label>
              </div>
              <div className="two">
                <label>
                  {t(lang, "source")}
                  <select value={f.source} onChange={(e) => set("source", e.target.value as ReservationSource)}>
                    {sources.map((s) => <option key={s} value={s}>{t(lang, `source_${s}`)}</option>)}
                  </select>
                </label>
                <label>
                  {t(lang, "status")}
                  <select value={f.status} onChange={(e) => set("status", e.target.value as ReservationStatus)}>
                    {statuses.map((s) => <option key={s} value={s}>{t(lang, `status_${s}`)}</option>)}
                  </select>
                </label>
              </div>
              <label>
                {t(lang, "amount")}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={f.total_amount ?? ""}
                  onChange={(e) => set("total_amount", e.target.value === "" ? null : Number(e.target.value))}
                />
              </label>
            </>
          )}

          {canEdit && draft.id && !isBlock && (
            <CheckinPanel
              lang={lang}
              reservationId={draft.id}
              guestName={[f.first_name, f.last_name].filter(Boolean).join(" ")}
              guestEmail={f.email}
              guestPhone={f.phone}
              villa={units.find((u) => u.id === f.unit_id)?.name ?? ""}
              checkIn={f.check_in}
            />
          )}
          {canEdit && draft.id && !isBlock && (
            <PaymentsPanel
              lang={lang}
              reservationId={draft.id}
              propertyId={units.find((u) => u.id === f.unit_id)?.property_id}
              total={f.total_amount == null ? null : Number(f.total_amount)}
              checkIn={f.check_in}
              guestName={[f.first_name, f.last_name].filter(Boolean).join(" ")}
              guestPhone={f.phone}
              guestEmail={f.email}
              villa={units.find((u) => u.id === f.unit_id)?.name ?? ""}
            />
          )}
          {canEdit && draft.id && !isBlock && <MessagesPanel lang={lang} reservationId={draft.id} villa={units.find((u) => u.id === f.unit_id)?.name ?? ""} />}

          <label>
            {t(lang, "notes")}
            <textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          {canEdit && draft.id && (
            <button type="button" className={confirming ? "danger confirm" : "danger"} onClick={remove} disabled={busy}>
              {t(lang, confirming ? "confirmDelete" : "delete")}
            </button>
          )}
          <span className="spacer" />
          {canEdit && draft.id && !isBlock && (
            <button type="button" onClick={invoice} disabled={busy}>
              {t(lang, "createInvoice")}
            </button>
          )}
          <button type="button" onClick={() => ref.current?.close()}>
            {t(lang, "cancel")}
          </button>
          {canEdit && (
            <button className="primary" disabled={busy}>
              {t(lang, "save")}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
