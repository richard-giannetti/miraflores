import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { t, type Lang } from "../lib/i18n";

export function Login({ lang }: { lang: Lang }) {
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
    <form className="login" onSubmit={submit}>
      <label>
        {t(lang, "email")}
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        {t(lang, "password")}
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error">{t(lang, "signInFailed")}</p>}
      <button className="primary" disabled={busy}>{t(lang, "signIn")}</button>
    </form>
  );
}
