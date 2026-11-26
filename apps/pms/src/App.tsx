import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { initialLang, langs, t, type Lang } from "./lib/i18n";
import { load, save } from "./lib/cache";
import type { Profile, StaffMember } from "./lib/types";
import { STAFF_FIELDS, departmentTabs } from "./lib/staff";
import { Login } from "./components/Login";
import { Calendar } from "./components/Calendar";
import { Today } from "./components/Today";
import { Tasks } from "./components/Tasks";
import { Guests } from "./components/Guests";
import { Invoices } from "./components/Invoices";
import { Settings } from "./components/Settings";
import { Staff } from "./components/Staff";
import { MyTime } from "./components/MyTime";
import { ChangePassword } from "./components/ChangePassword";
import { Maintenance } from "./components/Maintenance";
import { Money } from "./components/Money";
import { Avatar, Icon, type IconName } from "./components/Icon";
import { useVillas } from "./lib/villas";

type Tab = "today" | "calendar" | "cleaning" | "maintenance" | "guests" | "invoices" | "money" | "staff" | "me" | "settings" | "more";
const tabs: Tab[] = ["today", "calendar", "cleaning", "maintenance", "guests", "invoices", "money", "staff", "me", "settings", "more"];
const managerTabs: Tab[] = ["guests", "invoices", "money", "staff", "settings"];
// Reached from the gear in the header (settings) or the phone tab bar (more), not the main navigation.
const hiddenTabs: Tab[] = ["settings", "more"];
// Phones show this many tabs, then "More" for the rest.
const BOTTOM_TABS = 4;
// "#invoices/<id>" opens one invoice; "#staff/schedule" a part of the team screen.
const route = (): { tab: Tab; id: string | null } => {
  const [h, id] = location.hash.slice(1).split("/") as [Tab, string | undefined];
  return { tab: tabs.includes(h) ? h : "today", id: id ?? null };
};

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  // The team record linked to this login, if any: its department picks the screens, and it can clock in.
  const [me, setMe] = useState<StaffMember | null>(() => load("me"));

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
    Promise.all([
      supabase.from("profiles").select("id, full_name, role, language, must_change_password").eq("id", session.user.id).maybeSingle(),
      supabase.from("staff_members").select(STAFF_FIELDS).eq("user_id", session.user.id).is("deleted_at", null).maybeSingle(),
    ]).then(([{ data, error }, s]) => {
      if (error) return setProfile(load<Profile>("profile")); // offline: last known profile
      save("profile", data);
      setProfile(data as Profile | null);
      if (!s.error) {
        save("me", s.data);
        setMe(s.data as StaffMember | null);
      }
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
  if (profile.must_change_password) return <ChangePassword lang={lang} onDone={() => setProfile({ ...profile, must_change_password: false })} />;
  return <Workspace lang={lang} profile={profile} me={me} langPicker={langPicker} />;
}

const tabIcon: Record<Tab, IconName> = {
  today: "today",
  calendar: "calendar",
  cleaning: "cleaning",
  maintenance: "wrench",
  guests: "guests",
  invoices: "invoices",
  money: "money",
  staff: "team",
  me: "clock",
  settings: "settings",
  more: "more",
};

function Workspace({ lang, profile, me, langPicker }: { lang: Lang; profile: Profile; me: StaffMember | null; langPicker: ReactNode }) {
  const villas = useVillas();
  const [{ tab: asked, id }, setRoute] = useState(route);
  const isManager = profile.role === "owner" || profile.role === "manager";
  // Owners and managers see everything; a staff login sees its department's screens (cleaning without a team record).
  const allowed = (x: Tab) =>
    x === "me" ? !!me : x === "more" || isManager ? true : !managerTabs.includes(x) && (me ? departmentTabs[me.department] : ["today", "cleaning", "maintenance"]).includes(x);
  const visible = tabs.filter((x) => allowed(x) && !hiddenTabs.includes(x));
  const tab: Tab = allowed(asked) ? asked : "today";

  useEffect(() => {
    const onHash = () => setRoute(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const link = (x: Tab, on = x === tab) => (
    <a key={x} href={`#${x}`} className={on ? "on" : ""} aria-current={on ? "page" : undefined} title={t(lang, `tab_${x}`)}>
      <Icon name={tabIcon[x]} />
      <span>{t(lang, `tab_${x}`)}</span>
    </a>
  );
  const links = visible.map((x) => link(x));
  // Phones: the first tabs, then "More" (highlighted while on one of the others).
  const overflow = visible.length > BOTTOM_TABS + 1 ? visible.slice(BOTTOM_TABS) : [];
  const bottomLinks = overflow.length ? [...visible.slice(0, BOTTOM_TABS).map((x) => link(x)), link("more", tab === "more" || overflow.includes(tab))] : links;

  const settingsLink = isManager && (
    <a className={`icon-btn${tab === "settings" ? " on-icon" : ""}`} href="#settings" aria-label={t(lang, "settings")} title={t(lang, "settings")}>
      <Icon name="settings" />
    </a>
  );
  const signOut = (
    <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label={t(lang, "signOut")} title={t(lang, "signOut")}>
      <Icon name="logout" />
    </button>
  );

  return (
    <div className="shell">
      {/* Desktop: a floating glass sidebar (macOS 26 Window + Sidebar). */}
      <aside className="sidebar">
        <a className="brand" href="#today" aria-label="Miraflores">
          <img src="/logo.png" alt="" />
        </a>
        <nav className="nav-side">{links}</nav>
        <div className="sidebar-foot">
          {langPicker}
          <div className="sidebar-me">
            <Avatar name={profile.full_name || "?"} />
            <span className="sidebar-name">{profile.full_name}</span>
            {settingsLink}
            {signOut}
          </div>
        </div>
      </aside>
      {/* Phones and tablets: a compact top bar and tabs at the bottom. */}
      <header className="top">
        <a className="brand" href="#today" aria-label="Miraflores">
          <img src="/logo.png" alt="" />
        </a>
        <div className="top-right">
          {langPicker}
          {settingsLink}
          {signOut}
        </div>
      </header>
      <div className="content">
        {tab === "today" && <Today lang={lang} profile={profile} villas={villas} me={me} />}
        {tab === "calendar" && <Calendar lang={lang} role={profile.role} villas={villas} />}
        {tab === "cleaning" && <Tasks lang={lang} profile={profile} villas={villas} />}
        {tab === "maintenance" && <Maintenance lang={lang} profile={profile} villas={villas} view={id} />}
        {tab === "guests" && isManager && <Guests lang={lang} />}
        {tab === "invoices" && isManager && <Invoices lang={lang} profile={profile} openId={id} />}
        {tab === "money" && isManager && <Money lang={lang} villas={villas} view={id} />}
        {tab === "staff" && isManager && <Staff lang={lang} profile={profile} villas={villas} view={id} />}
        {tab === "me" && <MyTime lang={lang} me={me} villas={villas} />}
        {tab === "settings" && isManager && <Settings lang={lang} villas={villas} />}
        {tab === "more" && (
          <main className="page narrow">
            <h1 className="title">{t(lang, "tab_more")}</h1>
            <ul className="list panel more-list">
              {[...(overflow.length ? overflow : visible), ...(isManager ? (["settings"] as Tab[]) : [])].map((x) => (
                <li key={x} className="item">
                  <a className="item-main" href={`#${x}`}>
                    <span className="h-icon"><Icon name={tabIcon[x]} /></span>
                    <span><strong>{t(lang, x === "settings" ? "settings" : `tab_${x}`)}</strong></span>
                  </a>
                  <Icon name="right" size={16} />
                </li>
              ))}
            </ul>
          </main>
        )}
      </div>
      <nav className="nav-bottom">{bottomLinks}</nav>
    </div>
  );
}
