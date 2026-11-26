import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { t, type Lang } from "../lib/i18n";
import { ThemeButton } from "./ThemeButton";

export function Login({ lang, langPicker }: { lang: Lang; langPicker: ReactNode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    setError(!!error);
  }

  return (
    <div className="login-page">
      <div className="login-photo" aria-hidden="true" />
      <div className="login-side">
        <div className="login-lang">{langPicker}<ThemeButton lang={lang} /></div>
        <form className="login" onSubmit={submit}>
          <img className="login-logo" src="/logo.png" alt="Miraflores Costa Tropical" />
          <h1>{t(lang, "welcome")}</h1>
          <p className="muted">{t(lang, "welcomeSub")}</p>
          <label>
            {t(lang, "email")}
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            {t(lang, "password")}
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error">{t(lang, "signInFailed")}</p>}
          <button className="primary big" disabled={busy}>
            {t(lang, "signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
