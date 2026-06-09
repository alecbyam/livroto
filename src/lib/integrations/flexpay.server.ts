// ============================================================================
// Service FlexPay — passerelle de paiement mobile money RDC (M-Pesa, Orange, Airtel)
// SERVER ONLY. Docs : https://flexpay.cd  (API REST v1)
//
// Flux mobile money :
//   1) POST {base}/paymentService  -> envoie un push USSD au téléphone du client,
//      renvoie un `orderNumber` (référence passerelle).
//   2) On confirme soit par le webhook (callbackUrl), soit en interrogeant
//      GET {base}/check/{orderNumber} (polling).
//
// Tant que `flexpay_merchant`/`flexpay_token` ne sont pas renseignés dans
// l'interface admin, getFlexpayConfig() renvoie null et rien n'est appelé.
// ============================================================================
import { loadIntegrationConfig } from "./config.server";

export type FlexpayConfig = {
  baseUrl: string;
  merchant: string;
  token: string;
  currency: string; // 'CDF' | 'USD'
  callbackUrl: string;
};

/** Renvoie la config FlexPay si elle est complète, sinon null (intégration dormante). */
export async function getFlexpayConfig(cfg?: Record<string, string>): Promise<FlexpayConfig | null> {
  const c = cfg ?? (await loadIntegrationConfig());
  if (!c.flexpay_merchant || !c.flexpay_token) return null;
  return {
    baseUrl: (c.flexpay_base_url || "https://backend.flexpay.cd/api/rest/v1").replace(/\/+$/, ""),
    merchant: c.flexpay_merchant,
    token: c.flexpay_token,
    currency: (c.flexpay_currency || "CDF").toUpperCase(),
    callbackUrl: c.flexpay_callback_url || "",
  };
}

export type FlexpayInitResult =
  | { ok: true; orderNumber: string; reference: string; raw: any }
  | { ok: false; error: string; raw?: any };

/**
 * Initie un paiement mobile money (type "1"). Le client reçoit un push USSD.
 * `amount` est exprimé dans `currency` (entier conseillé pour le CDF).
 */
export async function flexpayInitiateMobileMoney(params: {
  cfg: FlexpayConfig;
  phone: string;
  amount: number;
  reference: string;
  currency?: string;
}): Promise<FlexpayInitResult> {
  const { cfg } = params;
  const phone = params.phone.replace(/[^\d]/g, "");
  const payload: Record<string, string> = {
    merchant: cfg.merchant,
    type: "1", // 1 = mobile money
    phone,
    reference: params.reference,
    amount: String(params.amount),
    currency: (params.currency || cfg.currency).toUpperCase(),
  };
  if (cfg.callbackUrl) payload.callbackUrl = cfg.callbackUrl;

  try {
    const res = await fetch(`${cfg.baseUrl}/paymentService`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    // FlexPay : code "0" = requête acceptée + orderNumber renvoyé.
    if (res.ok && String(json.code) === "0" && json.orderNumber) {
      return {
        ok: true,
        orderNumber: String(json.orderNumber),
        reference: String(json.reference ?? params.reference),
        raw: json,
      };
    }
    return { ok: false, error: json?.message || `HTTP ${res.status}`, raw: json };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network_error" };
  }
}

export type FlexpayStatus = "success" | "pending" | "failed";

/**
 * Interroge le statut d'une transaction.
 * Convention FlexPay : transaction.status "0" => succès.
 * Pour rester prudent on ne marque "failed" que sur un signal explicite,
 * sinon on reste "pending" (le poller finit par expirer).
 */
export async function flexpayCheck(
  orderNumber: string,
  cfg: FlexpayConfig,
): Promise<{ status: FlexpayStatus; raw: any }> {
  try {
    const res = await fetch(`${cfg.baseUrl}/check/${encodeURIComponent(orderNumber)}`, {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    });
    const json: any = await res.json().catch(() => ({}));
    const tx = json?.transaction ?? {};
    const txStatus = String(tx.status ?? "");
    const msg = `${json?.message ?? ""} ${tx?.message ?? ""}`.toLowerCase();

    let status: FlexpayStatus = "pending";
    if (txStatus === "0") {
      status = "success";
    } else if (/echou|échou|failed|annul|cancel|reject|rejet|insuffisant|expire/.test(msg)) {
      status = "failed";
    }
    return { status, raw: json };
  } catch (e: any) {
    return { status: "pending", raw: { error: e?.message ?? "network_error" } };
  }
}

/** Vérifie la joignabilité/autorisation : utilisé par le bouton "Tester" de l'admin. */
export async function flexpayPing(cfg: FlexpayConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    // Pas d'endpoint "ping" public : on interroge un check bidon. Une réponse JSON
    // (même "transaction introuvable") prouve que l'URL + le token répondent.
    const res = await fetch(`${cfg.baseUrl}/check/PING-${Date.now()}`, {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: "Token refusé (401/403) — vérifie le token FlexPay." };
    }
    return { ok: true, detail: json?.message ? `Réponse FlexPay : ${json.message}` : `HTTP ${res.status} — endpoint joignable.` };
  } catch (e: any) {
    return { ok: false, detail: `Injoignable : ${e?.message ?? "network_error"}` };
  }
}
