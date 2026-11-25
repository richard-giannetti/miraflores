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
import { Avatar, Icon, type IconName } from "./components/Icon";
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

  const langPicker = (
    <div className="langs" role="group" aria-label="Language">
      {langs.map((l) => (
        <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );

  if (session === undefined || (session && profile === undefined)) return <div className="splash"><img src="/logo.png" alt="Miraflores" /></div>;
  if (!session) return <Login lang={lang} langPicker={langPicker} />;
  if (!profile)
    return (
      <div className="splash">
        <img src="/logo.png" alt="Miraflores" />
        <p>{t(lang, "noAccess")}</p>
        <button onClick={() => supabase.auth.signOut()}>{t(lang, "signOut")}</button>
      </div>
    );
  return <Workspace lang={lang} profile={profile} langPicker={langPicker} />;
}

const tabIcon: Record<Tab, IconName> = { today: "today", calendar: "calendar", cleaning: "cleaning", guests: "guests", invoices: "invoices" };

function Workspace({ lang, profile, langPicker }: { lang: Lang; profile: Profile; langPicker: ReactNode }) {
  const villas = useVillas();
  const [{ tab, id }, setRoute] = useState(route);
  const isManager = profile.role === "owner" || profile.role === "manager";
  const visible = tabs.filter((x) => isManager || !managerTabs.includes(x));

  useEffect(() => {
    const onHash = () => setRoute(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const links = visible.map((x) => (
    <a key={x} href={`#${x}`} className={x === tab ? "on" : ""} aria-current={x === tab ? "page" : undefined}>
      <Icon name={tabIcon[x]} />
      <span>{t(lang, `tab_${x}`)}</span>
    </a>
  ));

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#today" aria-label="Miraflores">
          <img src="/logo.png" alt="" />
        </a>
        <nav className="nav-top">{links}</nav>
        <div className="top-right">
          {langPicker}
          <span className="me" title={profile.full_name}>
            <Avatar name={profile.full_name || "?"} />
          </span>
          <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label={t(lang, "signOut")} title={t(lang, "signOut")}>
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <div className="content">
        {tab === "today" && <Today lang={lang} profile={profile} villas={villas} />}
        {tab === "calendar" && <Calendar lang={lang} role={profile.role} villas={villas} />}
        {tab === "cleaning" && <Tasks lang={lang} profile={profile} villas={villas} />}
        {tab === "guests" && isManager && <Guests lang={lang} />}
        {tab === "invoices" && isManager && <Invoices lang={lang} profile={profile} openId={id} />}
      </div>
      <nav className="nav-bottom">{links}</nav>
    </div>
  );
}
