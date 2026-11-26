import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { format, today } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import { photoUrls, removePhotos, uploadPhoto } from "../lib/photos";
import { issuePriorities, issueStatuses, type Issue, type IssueStatus, type Profile, type RecurringJob } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Icon } from "./Icon";

export const ISSUE_FIELDS =
  "id, property_id, title, description, location, priority, status, photos, assigned_to, due_date, recurring_job_id, cost, resolution, reported_by, resolved_at, created_at";
const JOB_FIELDS = "id, property_id, title, notes, every, unit, next_due, assigned_to, active";

const statusTone: Record<IssueStatus, string> = { open: "todo", in_progress: "in_progress", waiting: "", done: "ok" };
const rank = (i: Issue) => (i.status === "done" ? 3 : 0) + (i.priority === "urgent" ? 0 : i.priority === "normal" ? 1 : 2);

// Open issues, live; shared by the Maintenance screen and Today.
export function useIssues(withDone: boolean) {
  const [list, setList] = useState<Issue[]>([]);
  const refresh = useCallback(async () => {
    let q = supabase.from("issues").select(ISSUE_FIELDS).is("deleted_at", null).order("created_at", { ascending: false });
    if (!withDone) q = q.neq("status", "done");
    else q = q.limit(200);
    const { data } = await q;
    if (data) setList((data as Issue[]).sort((a, b) => rank(a) - rank(b)));
  }, [withDone]);
  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`issues-${withDone}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, withDone]);
  return { list, refresh };
}

export function IssueRow({ issue, lang, villas, onOpen }: { issue: Issue; lang: Lang; villas: Villas; onOpen: () => void }) {
  const villa = villas.properties.find((v) => v.id === issue.property_id);
  const who = villas.team.find((p) => p.id === issue.assigned_to)?.full_name;
  const loc = locale[lang];
  const late = issue.due_date && issue.status !== "done" && issue.due_date < today();
  return (
    <li className={`item${issue.status === "done" ? " faded" : ""}`}>
      <button className="item-main" onClick={onOpen}>
        <span className="avatar" style={{ ["--tint" as string]: villa?.color }}>
          <Icon name={issue.recurring_job_id ? "repeat" : "wrench"} size={14} />
        </span>
        <span>
          <strong>{issue.title}</strong>
          <small>
            {[villa?.name, issue.location, who, issue.due_date && `${t(lang, "dueOn")} ${format(issue.due_date, loc, { day: "numeric", month: "short" })}`, issue.photos.length > 0 && `${issue.photos.length} ${t(lang, issue.photos.length === 1 ? "photoShort" : "photosShort")}`]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </span>
      </button>
      {issue.priority === "urgent" && issue.status !== "done" && <span className="pill urgent">{t(lang, "prio_urgent")}</span>}
      {late && <span className="pill urgent">{t(lang, "overdue")}</span>}
      <span className={`pill ${statusTone[issue.status]}`}>{t(lang, `issue_${issue.status}`)}</span>
    </li>
  );
}

const views = ["issues", "jobs"] as const;

// Problems in the villas, from "the pool pump is noisy" to the yearly AC service.
export function Maintenance({ lang, profile, villas, view }: { lang: Lang; profile: Profile; villas: Villas; view: string | null }) {
  const isManager = profile.role === "owner" || profile.role === "manager";
  const v = isManager && view === "jobs" ? "jobs" : "issues";
  const [showDone, setShowDone] = useState(false);
  const issues = useIssues(showDone);
  const [open, setOpen] = useState<Issue | "new" | null>(null);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="title">{t(lang, "tab_maintenance")}</h1>
        {isManager && (
          <div className="segmented" role="tablist">
            {views.map((x) => (
              <button key={x} role="tab" aria-selected={x === v} className={x === v ? "on" : ""} onClick={() => (location.hash = x === "issues" ? "#maintenance" : "#maintenance/jobs")}>
                {t(lang, x === "issues" ? "issues" : "recurringJobs")}
              </button>
            ))}
          </div>
        )}
      </div>

      {v === "jobs" ? (
        <Jobs lang={lang} villas={villas} />
      ) : (
        <>
          <div className="toolbar">
            <label className="inline">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {t(lang, "showDone")}
            </label>
            <button className="primary" onClick={() => setOpen("new")}>
              <Icon name="plus" size={16} /> {t(lang, "reportIssue")}
            </button>
          </div>
          {issues.list.length === 0 ? (
            <p className="muted">{t(lang, "noIssues")}</p>
          ) : (
            <ul className="list panel">
              {issues.list.map((i) => (
                <IssueRow key={i.id} issue={i} lang={lang} villas={villas} onOpen={() => setOpen(i)} />
              ))}
            </ul>
          )}
        </>
      )}

      {open && (
        <IssueDialog
          lang={lang}
          profile={profile}
          villas={villas}
          issue={open === "new" ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            issues.refresh();
          }}
        />
      )}
    </main>
  );
}

export function IssueDialog({
  lang,
  profile,
  villas,
  issue,
  onClose,
  onSaved,
}: {
  lang: Lang;
  profile: Profile;
  villas: Villas;
  issue: Issue | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const isManager = profile.role === "owner" || profile.role === "manager";
  const canEdit = !issue || isManager || issue.assigned_to === profile.id || issue.reported_by === profile.id;
  // A new issue gets its id now, so its photos can be uploaded before it's saved.
  const [id] = useState(() => issue?.id ?? crypto.randomUUID());
  const [f, setF] = useState({
    property_id: issue?.property_id ?? villas.properties[0]?.id ?? "",
    title: issue?.title ?? "",
    location: issue?.location ?? "",
    description: issue?.description ?? "",
    priority: issue?.priority ?? "normal",
    status: issue?.status ?? "open",
    assigned_to: issue?.assigned_to ?? "",
    due_date: issue?.due_date ?? "",
    cost: issue?.cost?.toString() ?? "",
    resolution: issue?.resolution ?? "",
    photos: issue?.photos ?? [],
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loc = locale[lang];
  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    photoUrls(f.photos.filter((p) => !urls[p])).then((u) => setUrls((x) => ({ ...x, ...u })));
  }, [f.photos]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const paths: string[] = [];
      for (const file of Array.from(files)) paths.push(await uploadPhoto(id, file));
      setF((x) => ({ ...x, photos: [...x.photos, ...paths] }));
    } catch (e) {
      setError(`${t(lang, "photoFailed")} ${(e as Error).message}`);
    }
    setBusy(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setError(t(lang, "titleRequired"));
    const row = {
      property_id: f.property_id,
      title: f.title.trim(),
      location: f.location.trim(),
      description: f.description,
      priority: f.priority,
      photos: f.photos,
      ...(issue && { status: f.status, resolution: f.resolution }),
      ...(isManager && {
        assigned_to: f.assigned_to || null,
        due_date: f.due_date || null,
        cost: f.cost === "" ? null : Number(f.cost.replace(",", ".")),
      }),
    };
    setBusy(true);
    const { error } = issue ? await supabase.from("issues").update(row).eq("id", issue.id) : await supabase.from("issues").insert({ id, ...row });
    setBusy(false);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    await removePhotos((issue?.photos ?? []).filter((p) => !f.photos.includes(p)));
    onSaved();
  }

  const reporter = villas.team.find((p) => p.id === issue?.reported_by)?.full_name;

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{issue ? issue.title : t(lang, "reportIssue")}</h2>
        {issue && (
          <p className="muted">
            {[reporter && `${t(lang, "reportedBy")} ${reporter}`, new Date(issue.created_at).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }), issue.recurring_job_id && t(lang, "fromRecurring")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <fieldset disabled={!canEdit}>
          <label>{t(lang, "whatsWrong")}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!issue} /></label>
          <div className="two">
            <label>
              {t(lang, "villa")}
              <select value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}>
                {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label>{t(lang, "whereInVilla")}<input value={f.location} placeholder={t(lang, "wherePlaceholder")} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
          </div>
          <label>{t(lang, "details")}<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="segmented" role="radiogroup" aria-label={t(lang, "priority")}>
            {issuePriorities.map((p) => (
              <button type="button" key={p} role="radio" aria-checked={f.priority === p} className={f.priority === p ? "on" : ""} onClick={() => setF({ ...f, priority: p })}>
                {t(lang, `prio_${p}`)}
              </button>
            ))}
          </div>

          <div className="photos">
            {f.photos.map((p) => (
              <figure key={p} className="photo">
                {urls[p] ? (
                  <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" /></a>
                ) : (
                  <span className="photo-wait" />
                )}
                {canEdit && (
                  <button type="button" className="icon-btn" aria-label={t(lang, "delete")} onClick={() => setF({ ...f, photos: f.photos.filter((x) => x !== p) })}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </figure>
            ))}
            {canEdit && (
              <label className="photo-add">
                <Icon name="camera" size={20} />
                <span>{t(lang, "addPhoto")}</span>
                <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>

          {issue && (
            <>
              <h3>{t(lang, "status")}</h3>
              <div className="segmented" role="radiogroup" aria-label={t(lang, "status")}>
                {issueStatuses.map((s) => (
                  <button type="button" key={s} role="radio" aria-checked={f.status === s} className={f.status === s ? "on" : ""} onClick={() => setF({ ...f, status: s })}>
                    {t(lang, `issue_${s}`)}
                  </button>
                ))}
              </div>
            </>
          )}
          {isManager && (
            <div className="two">
              <label>
                {t(lang, "assignedTo")}
                <select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
                  <option value="">{t(lang, "nobody")}</option>
                  {villas.team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>)}
                </select>
              </label>
              <label>{t(lang, "dueDate")}<input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
            </div>
          )}
          {issue && (
            <div className="two">
              <label>{t(lang, "whatWasDone")}<input value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} /></label>
              {isManager && <label>{t(lang, "cost")}<input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></label>}
            </div>
          )}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={() => ref.current?.close()}>{t(lang, "close")}</button>
          {canEdit && <button className="primary" disabled={busy}>{issue ? t(lang, "save") : t(lang, "send")}</button>}
        </div>
      </form>
    </dialog>
  );
}

function Jobs({ lang, villas }: { lang: Lang; villas: Villas }) {
  const [jobs, setJobs] = useState<RecurringJob[]>([]);
  const [open, setOpen] = useState<RecurringJob | "new" | null>(null);
  const loc = locale[lang];

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("recurring_jobs").select(JOB_FIELDS).is("deleted_at", null).order("next_due");
    if (data) setJobs(data as RecurringJob[]);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <div className="toolbar">
        <p className="muted">{t(lang, "jobsHint")}</p>
        <button className="primary" onClick={() => setOpen("new")}>
          <Icon name="plus" size={16} /> {t(lang, "newJob")}
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="muted">{t(lang, "noJobs")}</p>
      ) : (
        <ul className="list panel">
          {jobs.map((j) => {
            const villa = villas.properties.find((v) => v.id === j.property_id);
            return (
              <li key={j.id} className={`item${j.active ? "" : " faded"}`}>
                <button className="item-main" onClick={() => setOpen(j)}>
                  <span className="avatar" style={{ ["--tint" as string]: villa?.color }}><Icon name="repeat" size={14} /></span>
                  <span>
                    <strong>{j.title}</strong>
                    <small>
                      {[villa?.name, `${t(lang, "every")} ${j.every} ${t(lang, j.unit === "week" ? (j.every === 1 ? "unit_week" : "unit_weeks") : j.every === 1 ? "unit_month" : "unit_months")}`, villas.team.find((p) => p.id === j.assigned_to)?.full_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </button>
                <small className="muted right">
                  {t(lang, "nextDue")}
                  <br />
                  {format(j.next_due, loc, { day: "numeric", month: "short", year: "numeric" })}
                </small>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <JobDialog
          lang={lang}
          villas={villas}
          job={open === "new" ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function JobDialog({ lang, villas, job, onClose, onSaved }: { lang: Lang; villas: Villas; job: RecurringJob | null; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    property_id: job?.property_id ?? villas.properties[0]?.id ?? "",
    title: job?.title ?? "",
    notes: job?.notes ?? "",
    every: job?.every ?? 1,
    unit: job?.unit ?? "month",
    next_due: job?.next_due ?? today(),
    assigned_to: job?.assigned_to ?? "",
    active: job?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => ref.current?.showModal(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setError(t(lang, "titleRequired"));
    const row = { ...f, title: f.title.trim(), every: Math.max(1, Math.min(60, Number(f.every) || 1)), assigned_to: f.assigned_to || null };
    const { error } = job ? await supabase.from("recurring_jobs").update(row).eq("id", job.id) : await supabase.from("recurring_jobs").insert(row);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    const { error } = await supabase.from("recurring_jobs").update({ deleted_at: new Date().toISOString() }).eq("id", job!.id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    onSaved();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{job ? job.title : t(lang, "newJob")}</h2>
        <div className="two">
          <label>
            {t(lang, "villa")}
            <select value={f.property_id} onChange={(e) => setF({ ...f, property_id: e.target.value })}>
              {villas.properties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label>{t(lang, "jobTitle")}<input value={f.title} placeholder={t(lang, "jobPlaceholder")} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!job} /></label>
        </div>
        <div className="two">
          <label>
            {t(lang, "every")}
            <span className="inline">
              <input type="number" min={1} max={60} value={f.every} onChange={(e) => setF({ ...f, every: Number(e.target.value) })} style={{ width: 80 }} />
              <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as "week" | "month" })}>
                <option value="week">{t(lang, "unit_weeks")}</option>
                <option value="month">{t(lang, "unit_months")}</option>
              </select>
            </span>
          </label>
          <label>{t(lang, "nextDue")}<input type="date" value={f.next_due} onChange={(e) => e.target.value && setF({ ...f, next_due: e.target.value })} required /></label>
        </div>
        <label>
          {t(lang, "assignedTo")}
          <select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
            <option value="">{t(lang, "nobody")}</option>
            {villas.team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <label>{t(lang, "notes")}<textarea rows={2} value={f.notes} placeholder={t(lang, "jobNotesPlaceholder")} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <label className="inline">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t(lang, "active")}
        </label>
        <p className="hint">{t(lang, "jobsHint")}</p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {job && (
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
