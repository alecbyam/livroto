// ============================================================================
// Edge Function : callback de paiement FlexPay (webhook public, verify_jwt=false)
// FlexPay POST ici à la fin d'une transaction. On RE-VÉRIFIE le statut auprès
// de FlexPay (anti-spoof) avant de marquer la commande payée.
// URL : https://<project>.supabase.co/functions/v1/flexpay-callback
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    try { body = JSON.parse(await req.text()); } catch { body = {}; }
  }

  const orderNumber = String(body.orderNumber ?? body.order_number ?? body.reference ?? "").trim();
  if (!orderNumber) return json({ ok: false, reason: "no_order_number" });

  // Config FlexPay (service_role lit la table sécurisée)
  const { data: cfgRows } = await admin
    .from("integration_settings")
    .select("key,value")
    .in("key", ["flexpay_base_url", "flexpay_token"]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.key] = r.value ?? "";
  const baseUrl = (cfg.flexpay_base_url || "https://backend.flexpay.cd/api/rest/v1").replace(/\/+$/, "");
  const token = cfg.flexpay_token;

  // Localiser le paiement par sa référence passerelle
  const { data: pay } = await admin
    .from("payments")
    .select("id,order_id,status")
    .eq("provider", "flexpay")
    .eq("provider_ref", orderNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Re-vérification auprès de FlexPay (ne pas se fier aveuglément au callback)
  let confirmed: "success" | "failed" | "pending" = "pending";
  if (token) {
    try {
      const res = await fetch(`${baseUrl}/check/${encodeURIComponent(orderNumber)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const j: any = await res.json().catch(() => ({}));
      const tx = j?.transaction ?? {};
      const msg = `${j?.message ?? ""} ${tx?.message ?? ""}`.toLowerCase();
      if (String(tx.status) === "0") confirmed = "success";
      else if (/echou|échou|failed|annul|cancel|reject|rejet|insuffisant|expire/.test(msg)) confirmed = "failed";
    } catch {
      confirmed = "pending";
    }
  } else {
    confirmed = String(body.code) === "0" ? "success" : "pending";
  }

  if (pay && confirmed === "success" && pay.status !== "paid") {
    await admin.from("payments")
      .update({ status: "paid", provider_status: "success", collected_at: new Date().toISOString(), raw: body })
      .eq("id", pay.id);
    await admin.from("orders").update({ payment_status: "paid" }).eq("id", pay.order_id);
  } else if (pay && confirmed === "failed") {
    await admin.from("payments")
      .update({ status: "failed", provider_status: "failed", raw: body })
      .eq("id", pay.id);
    await admin.from("orders").update({ payment_status: "failed" }).eq("id", pay.order_id);
  }

  return json({ ok: true, status: confirmed });
});
