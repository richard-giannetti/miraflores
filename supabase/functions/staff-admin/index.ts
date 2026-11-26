// Owner-only account management for the team: create a login for a staff member with a temporary
// password, set a new temporary password, turn access off or on (which also marks them inactive). Creating auth users needs the
// service key, so it lives here instead of in the app. Deployed with verify_jwt off: the caller's
// token is checked below, and only an owner gets through.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Body =
  | { action: "create_login"; staff_id: string; email: string; password: string; role: "staff" | "manager" }
  | { action: "set_password"; staff_id: string; password: string }
  | { action: "set_access"; staff_id: string; enabled: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await admin.from("profiles").select("role").eq("id", caller.user.id).maybeSingle();
  if (me?.role !== "owner") return json({ error: "forbidden" }, 403);

  const body = (await req.json()) as Body;
  const { data: staff } = await admin.from("staff_members").select("id, user_id, full_name").eq("id", body.staff_id).is("deleted_at", null).maybeSingle();
  if (!staff) return json({ error: "not_found" }, 404);
  if ("password" in body && (body.password ?? "").length < 8) return json({ error: "weak_password" }, 400);

  if (body.action === "create_login") {
    if (staff.user_id) return json({ error: "has_login" }, 409);
    const email = body.email.trim().toLowerCase();
    const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true, user_metadata: { full_name: staff.full_name } });
    if (created.error) return json({ error: created.error.code === "email_exists" ? "email_exists" : created.error.message }, 400);
    const id = created.data.user.id;
    const role = body.role === "manager" ? "manager" : "staff";
    const p = await admin.from("profiles").insert({ id, full_name: staff.full_name, role, language: "es", must_change_password: true });
    const s = p.error ? p : await admin.from("staff_members").update({ user_id: id, email }).eq("id", staff.id);
    if (p.error || s.error) {
      await admin.auth.admin.deleteUser(id);
      return json({ error: (p.error ?? s.error)!.message }, 500);
    }
    return json({ ok: true, user_id: id });
  }

  if (!staff.user_id) return json({ error: "no_login" }, 409);
  if (staff.user_id === caller.user.id) return json({ error: "self" }, 400);

  if (body.action === "set_password") {
    const r = await admin.auth.admin.updateUserById(staff.user_id, { password: body.password });
    if (r.error) return json({ error: r.error.message }, 400);
    await admin.from("profiles").update({ must_change_password: true }).eq("id", staff.user_id);
    return json({ ok: true });
  }

  if (body.action === "set_access") {
    // A ban signs them out everywhere at the next token refresh and blocks new sign-ins.
    const r = await admin.auth.admin.updateUserById(staff.user_id, { ban_duration: body.enabled ? "none" : "876000h" });
    if (r.error) return json({ error: r.error.message }, 400);
    await admin.from("staff_members").update({ active: body.enabled }).eq("id", staff.id);
    return json({ ok: true });
  }

  return json({ error: "action" }, 400);
});
