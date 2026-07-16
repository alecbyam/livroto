// ============================================================================
// Service WhatsApp Cloud API (Meta) — SERVER ONLY.
// Docs : https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Deux types d'envoi :
//   - sendWhatsAppText  : message texte libre. Ne fonctionne QUE dans la fenêtre
//     de service client de 24h (le client a écrit récemment).
//   - sendWhatsAppTemplate : message à partir d'un template pré-approuvé par Meta.
//     Obligatoire pour initier une conversation (notifs de statut de commande).
//
// Tant que `whatsapp_phone_number_id`/`whatsapp_token` ne sont pas renseignés,
// getWhatsappConfig() renvoie null et rien n'est appelé.
// ============================================================================
import { loadIntegrationConfig } from "./config.server";
import { phoneDigits } from "@/lib/phone";

export type WhatsappConfig = {
  baseUrl: string;
  phoneNumberId: string;
  token: string;
  lang: string; // code langue par défaut des templates, ex: 'fr'
};

export async function getWhatsappConfig(cfg?: Record<string, string>): Promise<WhatsappConfig | null> {
  const c = cfg ?? (await loadIntegrationConfig());
  if (!c.whatsapp_phone_number_id || !c.whatsapp_token) return null;
  return {
    baseUrl: (c.whatsapp_base_url || "https://graph.facebook.com/v21.0").replace(/\/+$/, ""),
    phoneNumberId: c.whatsapp_phone_number_id,
    token: c.whatsapp_token,
    lang: c.whatsapp_lang || "fr",
  };
}

type SendResult = { ok: boolean; error?: string; raw?: any };

async function postMessage(cfg: WhatsappConfig, body: Record<string, any>): Promise<SendResult> {
  try {
    const res = await fetch(`${cfg.baseUrl}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json.messages) && json.messages.length > 0) {
      return { ok: true, raw: json };
    }
    return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}`, raw: json };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network_error" };
  }
}

/** Message texte libre (fenêtre 24h). */
export async function sendWhatsAppText(cfg: WhatsappConfig, to: string, body: string): Promise<SendResult> {
  return postMessage(cfg, {
    to: phoneDigits(to),
    type: "text",
    text: { preview_url: false, body },
  });
}

/**
 * Message template pré-approuvé. `bodyParams` remplit les variables {{1}}, {{2}}…
 * du corps du template, dans l'ordre.
 */
export async function sendWhatsAppTemplate(
  cfg: WhatsappConfig,
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  langCode?: string,
): Promise<SendResult> {
  const components =
    bodyParams.length > 0
      ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) }]
      : [];
  return postMessage(cfg, {
    to: phoneDigits(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: langCode || cfg.lang },
      ...(components.length ? { components } : {}),
    },
  });
}

/**
 * Vérifie la validité du token + du numéro (bouton "Tester" admin).
 * Appelle GET {base}/{phone_number_id}?fields=verified_name,display_phone_number
 */
export async function whatsappPing(cfg: WhatsappConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(
      `${cfg.baseUrl}/${cfg.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${cfg.token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.display_phone_number) {
      return {
        ok: true,
        detail: `✅ ${json.verified_name ?? "Numéro"} (${json.display_phone_number})${json.quality_rating ? ` — qualité ${json.quality_rating}` : ""}`,
      };
    }
    return { ok: false, error: json?.error?.message, detail: json?.error?.message ?? `HTTP ${res.status}` } as any;
  } catch (e: any) {
    return { ok: false, detail: `Injoignable : ${e?.message ?? "network_error"}` };
  }
}
