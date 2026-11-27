import { useState, type FormEvent } from "react";
import { signOut, supabase } from "../lib/supabase";
import { t, type Lang } from "../lib/i18n";

// After signing in with a temporary password from an owner, the person picks their own.
export function ChangePassword({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (a.length < 8) return setError(t(lang, "weakPassword"));
    if (a !== b) return setError(t(lang, "passwordsDiffer"));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: a });
    if (!error) await supabase.rpc("password_changed");
    setBusy(false);
    if (error) return setError(error.code === "same_password" ? t(lang, "samePassword") : `${t(lang, "saveFailed")} ${error.message}`);
    onDone();
  }

  return (
    <div className="splash">
      <form className="login" onSubmit={submit}>
        <img className="login-logo" src="/logo.png" alt="Miraflores Costa Tropical" />
        <h1>{t(lang, "changePasswordTitle")}</h1>
        <p className="muted">{t(lang, "changePasswordSub")}</p>
        <label>
          {t(lang, "newPassword")}
          <input type="password" autoComplete="new-password" required minLength={8} value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label>
          {t(lang, "repeatPassword")}
          <input type="password" autoComplete="new-password" required value={b} onChange={(e) => setB(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={busy}>{t(lang, "continue")}</button>
        <button type="button" className="link" onClick={signOut}>{t(lang, "signOut")}</button>
      </form>
    </div>
  );
}
