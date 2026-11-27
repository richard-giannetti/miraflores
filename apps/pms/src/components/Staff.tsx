import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { sessionEnded, supabase } from "../lib/supabase";
import { t, type Key, type Lang } from "../lib/i18n";
import { load, save } from "../lib/cache";
import { STAFF_FIELDS } from "../lib/staff";
import { contracts, departments, type Profile, type Role, type StaffMember } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Avatar, Icon } from "./Icon";
import { Schedule } from "./Schedule";
import { Hours } from "./Hours";

export function useStaff() {
  const [list, setList] = useState<StaffMember[]>(() => load("staff") ?? []);
  // Each login's permissions (owners can read every profile; others only their own).
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const refresh = useCallback(async () => {
    const [{ data }, p] = await Promise.all([
      supabase.from("staff_members").select(STAFF_FIELDS).is("deleted_at", null).order("full_name"),
      supabase.from("profiles").select("id, role"),
    ]);
    if (data) {
      save("staff", data);
      setList(data as StaffMember[]);
    }
    if (p.data) setRoles(Object.fromEntries(p.data.map((x) => [x.id, x.role as Role])));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { list, roles, refresh };
}

export type StaffList = ReturnType<typeof useStaff>;

const views = ["team", "schedule", "hours"] as const;
type View = (typeof views)[number];

// The team: who works here and in which department, their logins, the weekly schedule and the hours register.
export function Staff({ lang, profile, villas, view }: { lang: Lang; profile: Profile; villas: Villas; view: string | null }) {
  const staff = useStaff();
  const v: View = (views as readonly string[]).includes(view ?? "") ? (view as View) : "team";
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="title">{t(lang, "tab_staff")}</h1>
        <div className="segmented" role="tablist">
          {views.map((x) => (
            <button key={x} role="tab" aria-selected={x === v} className={x === v ? "on" : ""} onClick={() => (location.hash = x === "team" ? "#staff" : `#staff/${x}`)}>
              {t(lang, x)}
            </button>
          ))}
        </div>
      </div>
      {v === "team" && <Team lang={lang} profile={profile} staff={staff} />}
      {v === "schedule" && <Schedule lang={lang} villas={villas} staff={staff.list} />}
      {v === "hours" && <Hours lang={lang} villas={villas} staff={staff.list} />}
    </main>
  );
}

function Team({ lang, profile, staff }: { lang: Lang; profile: Profile; staff: StaffList }) {
  const [open, setOpen] = useState<StaffMember | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const shown = staff.list
    .filter((s) => showInactive || s.active)
    .sort((a, b) => departments.indexOf(a.department) - departments.indexOf(b.department) || a.full_name.localeCompare(b.full_name));
  const roleOf = (s: StaffMember) => (s.user_id ? staff.roles[s.user_id] : undefined);
  // The open record, kept current after a refresh (a new login, access turned off…).
  const current = open === "new" || !open ? open : (staff.list.find((s) => s.id === open.id) ?? open);

  return (
    <>
      <div className="toolbar">
        <label className="inline">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t(lang, "showInactive")}
        </label>
        <button className="primary" onClick={() => setOpen("new")}>
          <Icon name="plus" size={18} /> {t(lang, "newStaff")}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t(lang, "noStaff")}</p>
      ) : (
        <ul className="list panel">
          {shown.map((s) => (
            <li key={s.id} className={`item${s.active ? "" : " faded"}`}>
              <button className="item-main" onClick={() => setOpen(s)}>
                <Avatar name={s.full_name} />
                <span>
                  <strong>{s.full_name}</strong>
                  <small>{[t(lang, `contract_${s.contract}`), s.phone, s.weekly_hours != null && `${s.weekly_hours} h/${t(lang, "week").toLowerCase()}`].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
              <span className={`pill dept-${s.department}`}>{t(lang, `dept_${s.department}`)}</span>
              <span className={`pill ${s.user_id ? (s.active ? "ok" : "") : ""}`}>
                {s.user_id ? (s.active ? t(lang, `role_${roleOf(s) ?? "staff"}` as Key).split(" (")[0] : t(lang, "accessOff")) : t(lang, "noLogin")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <StaffDialog
          key={current === "new" ? "new" : current.id}
          lang={lang}
          member={current === "new" ? null : current}
          isOwner={profile.role === "owner"}
          role={current === "new" ? undefined : roleOf(current)}
          onClose={() => setOpen(null)}
          onSaved={(keepOpen) => {
            staff.refresh();
            if (!keepOpen) setOpen(null);
          }}
          onCreated={(m) => {
            staff.refresh();
            setOpen(m);
          }}
        />
      )}
    </>
  );
}

// The function's error codes, shown in the reader's language.
async function invoke(lang: Lang, body: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.functions.invoke("staff-admin", { body });
  if (!error) return null;
  if (await sessionEnded()) return null;
  let code = error.message;
  try {
    code = (await (error as { context?: Response }).context?.json())?.error ?? code;
  } catch {}
  const known: Record<string, Key> = { email_exists: "emailExists", weak_password: "weakPassword", forbidden: "ownerOnly" };
  return known[code] ? t(lang, known[code]) : `${t(lang, "saveFailed")} ${code}`;
}

function StaffDialog({
  lang,
  member,
  isOwner,
  role,
  onClose,
  onSaved,
  onCreated,
}: {
  lang: Lang;
  member: StaffMember | null;
  isOwner: boolean;
  role: Role | undefined;
  onClose: () => void;
  onSaved: (keepOpen?: boolean) => void;
  onCreated: (m: StaffMember) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    full_name: member?.full_name ?? "",
    department: member?.department ?? "housekeeping",
    contract: member?.contract ?? "employee",
    phone: member?.phone ?? "",
    email: member?.email ?? "",
    weekly_hours: member?.weekly_hours?.toString() ?? "",
    notes: member?.notes ?? "",
  });
  const [login, setLogin] = useState({ password: "", role: (role === "manager" ? "manager" : "staff") as "staff" | "manager" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.full_name.trim()) return setError(t(lang, "nameRequired"));
    const row = {
      ...f,
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      weekly_hours: f.weekly_hours === "" ? null : Number(f.weekly_hours),
    };
    if (!member) {
      const { data, error } = await supabase.from("staff_members").insert(row).select(STAFF_FIELDS).single();
      if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
      // Stay open on the new person, so a login can be added straight away.
      return onCreated(data as StaffMember);
    }
    const { error } = await supabase.from("staff_members").update(row).eq("id", member.id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    // Keep the login's display name in step with the team record.
    if (member?.user_id && isOwner) await supabase.from("profiles").update({ full_name: row.full_name }).eq("id", member.user_id);
    onSaved();
  }

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const err = await invoke(lang, { staff_id: member!.id, ...body });
    setBusy(false);
    if (err) return setError(err);
    setLogin((x) => ({ ...x, password: "" }));
    setNotice(done);
    onSaved(true);
  }

  async function setRole(r: "staff" | "manager") {
    setLogin((x) => ({ ...x, role: r }));
    if (!member?.user_id) return;
    const { error } = await supabase.from("profiles").update({ role: r }).eq("id", member.user_id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    setNotice(t(lang, "saved"));
    onSaved(true);
  }

  const createLogin = () => {
    if (!f.email.trim()) return setError(t(lang, "emailRequired"));
    if (login.password.length < 8) return setError(t(lang, "weakPassword"));
    run({ action: "create_login", email: f.email.trim(), password: login.password, role: login.role }, t(lang, "saved"));
  };

  async function setActive(active: boolean) {
    // With a login, turning someone off also blocks their sign-in.
    if (member?.user_id && isOwner) return run({ action: "set_access", enabled: active }, t(lang, "saved"));
    const { error } = await supabase.from("staff_members").update({ active }).eq("id", member!.id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{member ? member.full_name : t(lang, "newStaff")}</h2>
        <label>{t(lang, "fullName")}<input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} autoFocus={!member} /></label>
        <div className="two">
          <label>
            {t(lang, "department")}
            <select value={f.department} onChange={(e) => set("department", e.target.value)}>
              {departments.map((d) => <option key={d} value={d}>{t(lang, `dept_${d}`)}</option>)}
            </select>
          </label>
          <label>
            {t(lang, "contract")}
            <select value={f.contract} onChange={(e) => set("contract", e.target.value)}>
              {contracts.map((c) => <option key={c} value={c}>{t(lang, `contract_${c}`)}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label>{t(lang, "phone")}<input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label>
            {t(lang, "email")}
            <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={!!member?.user_id} />
          </label>
        </div>
        <label>{t(lang, "weeklyHours")}<input type="number" min={0} max={80} step={0.5} inputMode="decimal" value={f.weekly_hours} onChange={(e) => set("weekly_hours", e.target.value)} /></label>
        <label>{t(lang, "notes")}<textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>

        {member && (
          <section className="subpanel">
            <h3>{t(lang, "access")}</h3>
            <p className="muted">{t(lang, "accessSub")}</p>
            {!isOwner ? (
              <p className="muted">{t(lang, "ownerOnly")}</p>
            ) : (
              <>
                {member.user_id && role === "owner" ? null : (
                  <label>
                    {t(lang, "role")}
                    <select value={login.role} onChange={(e) => setRole(e.target.value as "staff" | "manager")} disabled={busy}>
                      <option value="staff">{t(lang, "role_staff")}</option>
                      <option value="manager">{t(lang, "role_manager")}</option>
                    </select>
                  </label>
                )}
                {member.active && role !== "owner" && (
                  <label>
                    {member.user_id ? t(lang, "setPassword") : t(lang, "tempPassword")}
                    <input type="text" autoComplete="off" spellCheck={false} value={login.password} onChange={(e) => setLogin((x) => ({ ...x, password: e.target.value }))} />
                    <small className="muted">{t(lang, "tempPasswordHint")}</small>
                  </label>
                )}
                <div className="actions">
                  {!member.user_id && member.active && (
                    <button type="button" className="primary" disabled={busy} onClick={createLogin}>{t(lang, "createLogin")}</button>
                  )}
                  {member.user_id && member.active && role !== "owner" && (
                    <button type="button" disabled={busy || !login.password} onClick={() => (login.password.length < 8 ? setError(t(lang, "weakPassword")) : run({ action: "set_password", password: login.password }, t(lang, "saved")))}>
                      {t(lang, "setPassword")}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {notice && <p className="ok-text">{notice}</p>}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {member && role !== "owner" && (
            <button type="button" className={member.active ? "danger" : ""} disabled={busy} onClick={() => setActive(!member.active)}>
              {member.active ? (member.user_id ? t(lang, "disableAccess") : t(lang, "deactivate")) : member.user_id ? t(lang, "enableAccess") : t(lang, "reactivate")}
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
