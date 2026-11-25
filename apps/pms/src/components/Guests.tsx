import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { format } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import type { GuestFull, ReservationStatus } from "../lib/types";

interface Stay {
  id: string;
  guest_id: string;
  check_in: string;
  check_out: string;
  status: ReservationStatus;
  adults: number;
  children: number;
  total_amount: number | null;
  unit: { name: string } | null;
}

// Guest profiles, shared across stays: find a guest, see every stay, keep notes and preferences.
export function Guests({ lang }: { lang: Lang }) {
  const [guests, setGuests] = useState<GuestFull[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<GuestFull | null>(null);
  const loc = locale[lang];

  async function refresh() {
    const [g, s] = await Promise.all([
      supabase.from("guests").select("id, first_name, last_name, email, phone, notes, language, nationality, updated_at").is("deleted_at", null),
      supabase
        .from("reservations")
        .select("id, guest_id, check_in, check_out, status, adults, children, total_amount, unit:units(name)")
        .is("deleted_at", null)
        .not("guest_id", "is", null)
        .order("check_in", { ascending: false }),
    ]);
    if (g.data) setGuests(g.data as GuestFull[]);
    if (s.data) setStays(s.data as unknown as Stay[]);
  }

  useEffect(() => {
    refresh();
  }, []);

  const staysOf = (id: string) => stays.filter((s) => s.guest_id === id && s.status !== "cancelled");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return guests
      .filter((g) => !needle || [g.first_name, g.last_name, g.email, g.phone].some((v) => v?.toLowerCase().includes(needle)))
      .map((g) => ({ g, s: staysOf(g.id) }))
      .sort((a, b) => (b.s[0]?.check_in ?? "").localeCompare(a.s[0]?.check_in ?? "") || a.g.last_name.localeCompare(b.g.last_name));
  }, [guests, stays, q]);

  const name = (g: GuestFull) => [g.first_name, g.last_name].filter(Boolean).join(" ") || t(lang, "untitled");

  return (
    <main className="page">
      <input className="search" type="search" placeholder={t(lang, "search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? (
        <p className="muted">{t(lang, "noGuests")}</p>
      ) : (
        <ul className="list panel">
          {shown.map(({ g, s }) => (
            <li key={g.id} className="item">
              <button className="item-main" onClick={() => setOpen(g)}>
                <span>
                  <strong>
                    {name(g)} {s.length > 1 && <span className="pill ok">{t(lang, "returning")}</span>}
                  </strong>
                  <small>{[g.email, g.phone, g.nationality].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
              <small className="muted right">
                {s.length} {t(lang, s.length === 1 ? "stay" : "stays").toLowerCase()}
                {s[0] && <><br />{format(s[0].check_in, loc, { month: "short", year: "numeric" })}</>}
              </small>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <GuestDialog
          lang={lang}
          guest={open}
          stays={staysOf(open.id)}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}

function GuestDialog({ lang, guest, stays, onClose, onSaved }: { lang: Lang; guest: GuestFull; stays: Stay[]; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    first_name: guest.first_name,
    last_name: guest.last_name,
    email: guest.email ?? "",
    phone: guest.phone ?? "",
    nationality: guest.nationality ?? "",
    language: guest.language ?? "",
    notes: guest.notes,
  });
  const [error, setError] = useState<string | null>(null);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("guests")
      .update({ ...f, email: f.email.trim() || null, phone: f.phone.trim() || null, nationality: f.nationality.trim() || null, language: f.language.trim() || null })
      .eq("id", guest.id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{t(lang, "guest")}</h2>
        <div className="two">
          <label>{t(lang, "firstName")}<input value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></label>
          <label>{t(lang, "lastName")}<input value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></label>
        </div>
        <div className="two">
          <label>{t(lang, "email")}<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label>{t(lang, "phone")}<input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        </div>
        <div className="two">
          <label>{t(lang, "nationality")}<input value={f.nationality} onChange={(e) => set("nationality", e.target.value)} /></label>
          <label>{t(lang, "guestLanguage")}<input value={f.language} onChange={(e) => set("language", e.target.value)} /></label>
        </div>
        <label>{t(lang, "notes")}<textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>

        <h3>{t(lang, "stays")} ({stays.length})</h3>
        <ul className="list">
          {stays.map((s) => (
            <li key={s.id} className="item">
              <span>
                <strong>{s.unit?.name}</strong>
                <small>
                  {format(s.check_in, loc, { day: "numeric", month: "short", year: "numeric" })} → {format(s.check_out, loc, { day: "numeric", month: "short" })} ·{" "}
                  {s.adults + s.children} {t(lang, "guests")}
                  {s.total_amount != null && ` · ${s.total_amount.toLocaleString(loc, { style: "currency", currency: "EUR" })}`}
                </small>
              </span>
              <span className="pill">{t(lang, `status_${s.status}`)}</span>
            </li>
          ))}
        </ul>

        {error && <p className="error">{error}</p>}
        <div className="actions">
          <span className="spacer" />
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          <button className="primary">{t(lang, "save")}</button>
        </div>
      </form>
    </dialog>
  );
}
