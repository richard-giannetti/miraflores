import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { initialLang, langs, t, type Lang } from "./lib/i18n";
import { load, save } from "./lib/cache";
import type { Profile } from "./lib/types";
import { Login } from "./components/Login";
import { Calendar } from "./components/Calendar";

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
  return (
    <>
      {header}
      <Calendar lang={lang} role={profile.role} />
    </>
  );
}
