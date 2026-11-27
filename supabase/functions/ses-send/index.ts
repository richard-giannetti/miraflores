// SES.Hospedajes connection (being built; see docs/pms/ses-hospedajes.md). For now only a connection check: it
// reaches the Ministry's test and production servers with FNMT's intermediate certificate (fnmt.ts) and reports
// the HTTP status (401 = reachable, credentials needed). Sends no data. Owners and managers only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { FNMT_ACCOMP } from "./fnmt.ts";

const ENDPOINTS = {
  test: "https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion",
  production: "https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion",
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// The Ministry's servers don't send FNMT's intermediate certificate; trust it explicitly for these calls.
// deno-lint-ignore no-explicit-any
export const sesClient = () => (Deno as any).createHttpClient({ caCerts: [FNMT_ACCOMP] });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const { data } = await admin.auth.getUser(token);
  const { data: p } = data.user ? await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle() : { data: null };
  if (p?.role !== "owner" && p?.role !== "manager") return json({ error: "forbidden" }, 403);

  const out: Record<string, unknown> = {};
  for (const [name, url] of Object.entries(ENDPOINTS)) {
    try {
      const res = await fetch(url, { method: "POST", client: sesClient() } as RequestInit);
      out[name] = { status: res.status };
      await res.body?.cancel();
    } catch (e) {
      out[name] = { error: String((e as Error).message ?? e) };
    }
  }
  return json(out);
});
