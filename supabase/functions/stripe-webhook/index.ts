// Stripe → PMS. Stripe calls this when a checkout completes or a charge is refunded; the signature is checked
// with the STRIPE_WEBHOOK_SECRET secret before anything is believed.
// - checkout.session.completed (paid): the payment is marked paid, an option booking becomes confirmed, and the
//   income goes into Money (once: keyed by the payment intent).
// - charge.refunded: the payment's refunded amount and status follow Stripe, and each refund goes into Money as
//   a "refunds" expense.
// Stripe retries until it gets a 2xx, so everything here is safe to run twice.
import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function verify(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]).filter(([k]) => k === "t"));
  const t = parts.t;
  const sigs = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`)));
  return sigs.some((s) => s.length === expected.length && s === expected);
}

const madridDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const kindName: Record<string, string> = { deposit: "Depósito", balance: "Resto", full: "Estancia", extra: "Extra", other: "Pago" };

Deno.serve(async (req) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get("Stripe-Signature") ?? "", secret))) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(raw);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    const paymentId = s.metadata?.payment_id;
    if (!paymentId || s.payment_status !== "paid") return new Response("ignored");
    const { data: p } = await admin
      .from("payments")
      .select("id, kind, amount, reservation:reservations(id, status, unit:units(property_id), guest:guests(first_name, last_name))")
      .eq("id", paymentId)
      .maybeSingle();
    if (!p) return new Response("unknown payment");
    const r = p.reservation as unknown as { id: string; status: string; unit: { property_id: string }; guest: { first_name: string; last_name: string } | null };
    await admin
      .from("payments")
      .update({ status: "paid", paid_at: new Date(s.created * 1000).toISOString(), stripe_payment_intent: s.payment_intent, stripe_session_id: s.id })
      .eq("id", p.id)
      .in("status", ["pending", "cancelled"]);
    if (r.status === "option") await admin.from("reservations").update({ status: "confirmed" }).eq("id", r.id);
    // The unique external_ref makes a retried webhook a no-op here.
    await admin.from("transactions").insert({
      kind: "income",
      category: "stay",
      property_id: r.unit.property_id,
      reservation_id: r.id,
      day: madridDay(),
      amount: Number(s.amount_total) / 100,
      method: "card",
      counterparty: [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(" "),
      description: `${kindName[p.kind] ?? "Pago"} · Stripe`,
      external_ref: `stripe:${s.payment_intent}`,
    });
    return new Response("ok");
  }

  if (event.type === "charge.refunded") {
    const c = event.data.object;
    const { data: p } = await admin
      .from("payments")
      .select("id, amount, refunded_amount, reservation:reservations(id, unit:units(property_id), guest:guests(first_name, last_name))")
      .eq("stripe_payment_intent", c.payment_intent)
      .maybeSingle();
    if (!p) return new Response("unknown payment");
    const total = Number(c.amount_refunded) / 100;
    const delta = Math.round((total - Number(p.refunded_amount)) * 100) / 100;
    await admin
      .from("payments")
      .update({ refunded_amount: total, status: total >= Number(p.amount) ? "refunded" : "partially_refunded" })
      .eq("id", p.id);
    if (delta > 0) {
      const r = p.reservation as unknown as { id: string; unit: { property_id: string }; guest: { first_name: string; last_name: string } | null };
      await admin.from("transactions").insert({
        kind: "expense",
        category: "refunds",
        property_id: r.unit.property_id,
        reservation_id: r.id,
        day: madridDay(),
        amount: delta,
        method: "card",
        counterparty: [r.guest?.first_name, r.guest?.last_name].filter(Boolean).join(" "),
        description: "Devolución · Stripe",
        external_ref: `stripe-refund:${c.id}:${c.amount_refunded}`,
      });
    }
    return new Response("ok");
  }

  return new Response("ignored");
});
