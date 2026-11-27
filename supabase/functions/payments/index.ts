// Stripe, from the PMS side. Two actions:
// - checkout (anyone with a payment's link): opens a fresh Stripe Checkout session for a pending payment and
//   returns its URL. Sessions last at most 24 h, so the guest's link creates a new one each time it's opened.
// - refund (owners and managers): refunds a paid payment, in full or in part. The webhook records the result.
// Needs the STRIPE_SECRET_KEY secret (a restricted key: Checkout Sessions write, Refunds write).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PMS = "https://pms.miraflorescostatropical.com";

// Stripe's API takes form-encoded bodies with bracketed keys.
async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe ${res.status}`);
  return data;
}

const kindLabel: Record<string, Record<string, string>> = {
  deposit: { es: "Depósito", en: "Deposit", fr: "Acompte" },
  balance: { es: "Resto de la estancia", en: "Balance", fr: "Solde" },
  full: { es: "Estancia", en: "Stay", fr: "Séjour" },
  extra: { es: "Extra", en: "Extra", fr: "Supplément" },
  other: { es: "Pago", en: "Payment", fr: "Paiement" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "not_configured" }, 503);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "checkout") {
      if (!/^[0-9a-f-]{36}$/i.test(body.token ?? "")) return json({ error: "not_found" }, 404);
      const { data: p } = await admin
        .from("payments")
        .select("id, token, kind, description, amount, currency, status, reservation:reservations(id, check_in, check_out, unit:units(property:properties(name)), guest:guests(email, language))")
        .eq("token", body.token)
        .maybeSingle();
      if (!p) return json({ error: "not_found" }, 404);
      if (p.status !== "pending") return json({ error: "not_pending", status: p.status }, 409);
      const r = p.reservation as unknown as { id: string; check_in: string; check_out: string; unit: { property: { name: string } }; guest: { email: string | null; language: string | null } | null };
      const lang = ["es", "fr"].includes((r.guest?.language ?? "").slice(0, 2).toLowerCase()) ? r.guest!.language!.slice(0, 2).toLowerCase() : "en";
      const name = `${kindLabel[p.kind]?.[lang] ?? "Payment"} · ${r.unit.property.name} · ${r.check_in} → ${r.check_out}`;
      const session = await stripe("checkout/sessions", {
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": p.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(Math.round(Number(p.amount) * 100)),
        "line_items[0][price_data][product_data][name]": name,
        ...(p.description && { "line_items[0][price_data][product_data][description]": p.description }),
        success_url: `${PMS}/pay/${p.token}?done=1`,
        cancel_url: `${PMS}/pay/${p.token}`,
        client_reference_id: p.id,
        "metadata[payment_id]": p.id,
        "metadata[reservation_id]": r.id,
        "payment_intent_data[metadata][payment_id]": p.id,
        "payment_intent_data[metadata][reservation_id]": r.id,
        locale: lang,
        expires_at: String(Math.floor(Date.now() / 1000) + 60 * 60),
        ...(r.guest?.email && { customer_email: r.guest.email }),
      });
      await admin.from("payments").update({ stripe_session_id: session.id }).eq("id", p.id);
      return json({ url: session.url });
    }

    if (body.action === "refund") {
      const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      const { data: who } = await admin.auth.getUser(token);
      if (!who.user) return json({ error: "unauthorized" }, 401);
      const { data: prof } = await admin.from("profiles").select("role").eq("id", who.user.id).maybeSingle();
      if (prof?.role !== "owner" && prof?.role !== "manager") return json({ error: "forbidden" }, 403);
      const { data: p } = await admin.from("payments").select("id, amount, refunded_amount, status, stripe_payment_intent").eq("id", body.payment_id).maybeSingle();
      if (!p || !p.stripe_payment_intent || !["paid", "partially_refunded"].includes(p.status)) return json({ error: "not_refundable" }, 409);
      const left = Number(p.amount) - Number(p.refunded_amount);
      const amount = body.amount == null ? left : Number(body.amount);
      if (!(amount > 0) || amount > left + 0.001) return json({ error: "bad_amount" }, 400);
      await stripe("refunds", {
        payment_intent: p.stripe_payment_intent,
        amount: String(Math.round(amount * 100)),
        "metadata[payment_id]": p.id,
        "metadata[refunded_by]": who.user.id,
      });
      return json({ ok: true });
    }

    return json({ error: "action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
