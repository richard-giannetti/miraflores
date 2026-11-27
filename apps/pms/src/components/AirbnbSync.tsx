import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { format } from "../lib/dates";
import { locale, t, type Lang } from "../lib/i18n";
import type { Profile } from "../lib/types";
import type { Villas } from "../lib/villas";
import { Icon } from "./Icon";

interface UnitLink {
  id: string;
  name: string;
  property_id: string;
  airbnb_ical_url: string | null;
  ical_token: string;
}
interface Run {
  unit_id: string;
  ran_at: string;
  ok: boolean;
  created: number;
  updated: number;
  cancelled: number;
  conflicts: { ref: string; checkIn: string; checkOut: string }[];
  error: string | null;
}

export const exportUrl = (token: string) => `https://lkbrydeqxnspsnpvimil.supabase.co/functions/v1/ical-export/${token}.ics`;

// The latest sync per unit (managers only), shared by Settings and the warning on Today.
export function useSyncRuns() {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const refresh = useCallback(async () => {
    const { data } = await supabase.from("ical_sync_runs").select("unit_id, ran_at, ok, created, updated, cancelled, conflicts, error").order("ran_at", { ascending: false }).limit(50);
    const latest: Record<string, Run> = {};
    for (const r of (data ?? []) as Run[]) latest[r.unit_id] ??= r;
    setRuns(latest);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { runs, refresh };
}

// Today: say so when the last Airbnb sync failed or found a booking that clashes with one here.
export function SyncWarning({ lang, villas }: { lang: Lang; villas: Villas }) {
  const { runs } = useSyncRuns();
  const bad = Object.values(runs).filter((r) => !r.ok || r.conflicts.length);
  if (!bad.length) return null;
  return (
    <a className="banner error sync-warning" href="#settings">
      <Icon name="calendar" size={16} />
      <span>
        {bad
          .map((r) => `${villas.unitName(r.unit_id)}: ${r.ok ? `${r.conflicts.length} ${t(lang, "syncConflicts")}` : t(lang, "syncFailed")}`)
          .join(" · ")}
      </span>
    </a>
  );
}

// Settings: each villa's two links (Airbnb → PMS and PMS → Airbnb), the last sync, and "Sync now".
export function AirbnbSync({ lang, profile }: { lang: Lang; profile: Profile }) {
  const isOwner = profile.role === "owner";
  const [units, setUnits] = useState<UnitLink[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { runs, refresh: refreshRuns } = useSyncRuns();
  const loc = locale[lang];

  const load = useCallback(async () => {
    const { data } = await supabase.from("units").select("id, name, property_id, airbnb_ical_url, ical_token").is("deleted_at", null).order("sort");
    const list = (data ?? []) as UnitLink[];
    setUnits(list);
    setUrls(Object.fromEntries(list.map((u) => [u.id, u.airbnb_ical_url ?? ""])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function saveUrl(u: UnitLink) {
    setError(null);
    const url = urls[u.id].trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return setError(t(lang, "badIcalUrl"));
    const { error } = await supabase.from("units").update({ airbnb_ical_url: url || null }).eq("id", u.id);
    if (error) return setError(`${t(lang, "saveFailed")} ${error.message}`);
    await load();
    if (url) syncNow(u.id);
  }

  async function syncNow(unitId?: string) {
    setBusy(unitId ?? "all");
    setError(null);
    const { error } = await supabase.functions.invoke("ical-sync", { body: unitId ? { unit_id: unitId } : {} });
    setBusy(null);
    if (error) setError(`${t(lang, "syncFailed")} ${error.message}`);
    refreshRuns();
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t(lang, "copyByHand"));
    }
  }

  return (
    <section className="settings-grid">
      <div className="page-head">
        <div>
          <h2 className="title">{t(lang, "airbnbSync")}</h2>
          <p className="muted">{t(lang, "airbnbSyncSub")}</p>
        </div>
        <button onClick={() => syncNow()} disabled={!!busy || !units.some((u) => u.airbnb_ical_url)}>
          <Icon name="repeat" size={16} /> {busy ? t(lang, "syncing") : t(lang, "syncNow")}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {units.map((u) => {
        const run = runs[u.id];
        const out = exportUrl(u.ical_token);
        return (
          <div key={u.id} className="guide-edit">
            <header>
              <span>{u.name}</span>
              {run && (
                <span className={`pill ${!run.ok ? "urgent" : run.conflicts.length ? "in_progress" : "ok"}`}>
                  {!run.ok ? t(lang, "syncFailed") : run.conflicts.length ? `${run.conflicts.length} ${t(lang, "syncConflicts")}` : t(lang, "syncOk")}
                </span>
              )}
            </header>
            <label>
              {t(lang, "airbnbToPms")}
              <span className="inline">
                <input
                  value={urls[u.id] ?? ""}
                  placeholder="https://www.airbnb.com/calendar/ical/….ics?s=…"
                  onChange={(e) => setUrls({ ...urls, [u.id]: e.target.value })}
                  disabled={!isOwner}
                  spellCheck={false}
                />
                {isOwner && (
                  <button disabled={(urls[u.id] ?? "") === (u.airbnb_ical_url ?? "") || !!busy} onClick={() => saveUrl(u)}>
                    {t(lang, "save")}
                  </button>
                )}
              </span>
              <small className="muted">{t(lang, "airbnbToPmsHint")}</small>
            </label>
            <label>
              {t(lang, "pmsToAirbnb")}
              <span className="inline">
                <input value={out} readOnly onFocus={(e) => e.target.select()} spellCheck={false} />
                <button onClick={() => copy(out, u.id)}>{copied === u.id ? t(lang, "copied") : t(lang, "copy")}</button>
              </span>
              <small className="muted">{t(lang, "pmsToAirbnbHint")}</small>
            </label>
            {run && (
              <p className="hint">
                {t(lang, "lastSync")} {new Date(run.ran_at).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {run.ok ? ` · ${run.created} ${t(lang, "syncNew")} · ${run.updated} ${t(lang, "syncUpdated")} · ${run.cancelled} ${t(lang, "syncCancelled")}` : ` · ${run.error}`}
              </p>
            )}
            {run?.conflicts.length ? (
              <div className="banner error">
                <span>
                  <strong>{t(lang, "conflictsTitle")}</strong>{" "}
                  {run.conflicts.map((c) => `${format(c.checkIn, loc, { day: "numeric", month: "short" })} → ${format(c.checkOut, loc, { day: "numeric", month: "short" })}`).join(", ")}
                  . {t(lang, "conflictsHint")}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
