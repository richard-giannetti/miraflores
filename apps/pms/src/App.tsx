import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { initialLang, langs, t, type Lang } from "./lib/i18n";
import { load, save } from "./lib/cache";
import type { Profile } from "./lib/types";
import { Login } from "./components/Login";
import { Calendar } from "./components/Calendar";
import { Today } from "./components/Today";
import { Tasks } from "./components/Tasks";
import { Guests } from "./components/Guests";
import { Invoices } from "./components/Invoices";
import { useVillas } from "./lib/villas";

type Tab = "today" | "calendar" | "cleaning" | "guests" | "invoices";
const tabs: Tab[] = ["today", "calendar", "cleaning", "guests", "invoices"];
const managerTabs: Tab[] = ["guests", "invoices"];
// "#invoices/<id>" opens one invoice.
const route = (): { tab: Tab; id: string | null } => {
  const [h, id] = location.hash.slice(1).split("/") as [Tab, string | undefined];
  return { tab: tabs.includes(h) ? h : "today", id: id ?? null };
};

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(session === null ? null : undefined);
      return;
    }
    supabase
      .from("profiles")
      .select("id, full_name, role, language")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setProfile(load<Profile>("profile")); // offline: last known profile
        save("profile", data);
        setProfile(data as Profile | null);
      });
  }, [session]);

  const header = (
    <header className="top">
      <strong>{t(lang, "appName")}</strong>
      <div className="top-right">
        <div className="langs" role="group" aria-label="Language">
          {langs.map((l) => (
            <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        {session && (
          <button className="link" onClick={() => supabase.auth.signOut()}>
            {t(lang, "signOut")}
          </button>
        )}
      </div>
    </header>
  );

  if (session === undefined || (session && profile === undefined)) return <>{header}</>;
  if (!session) return (<>{header}<Login lang={lang} /></>);
  if (!profile) return (<>{header}<p className="notice">{t(lang, "noAccess")}</p></>);
  return <Workspace lang={lang} profile={profile} header={header} />;
}

function Workspace({ lang, profile, header }: { lang: Lang; profile: Profile; header: ReactNode }) {
  const villas = useVillas();
  const [{ tab, id }, setRoute] = useState(route);
  const isManager = profile.role === "owner" || profile.role === "manager";
  const visible = tabs.filter((x) => isManager || !managerTabs.includes(x));

  useEffect(() => {
    const onHash = () => setRoute(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      {header}
      <nav className="tabs">
        {visible.map((x) => (
          <a key={x} href={`#${x}`} className={x === tab ? "on" : ""}>
            {t(lang, `tab_${x}`)}
          </a>
        ))}
      </nav>
      {tab === "today" && <Today lang={lang} profile={profile} villas={villas} />}
      {tab === "calendar" && <Calendar lang={lang} role={profile.role} villas={villas} />}
      {tab === "cleaning" && <Tasks lang={lang} profile={profile} villas={villas} />}
      {tab === "guests" && isManager && <Guests lang={lang} />}
      {tab === "invoices" && isManager && <Invoices lang={lang} profile={profile} openId={id} />}
    </>
  );
}
