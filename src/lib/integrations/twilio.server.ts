// ============================================================================
// Service Twilio (SMS + WhatsApp Business) — SERVER ONLY.
// Docs SMS      : https://www.twilio.com/docs/sms/send-messages
// Docs WhatsApp : https://www.twilio.com/docs/whatsapp (Twilio agit comme BSP —
//   fournisseur intermédiaire agréé par Meta — pour envoyer/recevoir sur WhatsApp)
//
// Deux canaux possibles depuis le même numéro/compte :
//   - SMS classique : `From` = numéro Twilio nu (+243...) — utilisable dès l'achat
//     du numéro, aucune validation externe requise.
//   - WhatsApp       : `From`/`To` préfixés "whatsapp:" — nécessite un Sender
//     WhatsApp approuvé par Meta dans la console Twilio (pas encore fait pour
//     JuntoxShop au 1/09/2026 — voir mémoire integrations_flexpay_whatsapp).
//     Tant que `twilio_whatsapp_number` n'est pas renseigné, sendTwilioWhatsApp()
//     échoue proprement sans appel réseau.
//
// Tant que account_sid/auth_token/phone_number ne sont pas renseignés,
// getTwilioConfig() renvoie null et rien n'est appelé — même pattern que
// flexpay.server.ts / whatsapp.server.ts (intégration "dormante" jusqu'aux clés).
// ============================================================================
import { loadIntegrationConfig } from "./config.server";
import { phoneE164 } from "@/lib/phone";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  smsFrom: string; // numéro Twilio SMS, E.164
  whatsappFrom: string; // numéro Twilio WhatsApp, E.164 (vide si non activé)
};

export async function getTwilioConfig(cfg?: Record<string, string>): Promise<TwilioConfig | null> {
  const c = cfg ?? (await loadIntegrationConfig());
  if (!c.twilio_account_sid || !c.twilio_auth_token || !c.twilio_phone_number) return null;
  return {
    accountSid: c.twilio_account_sid,
    authToken: c.twilio_auth_token,
    smsFrom: phoneE164(c.twilio_phone_number),
    whatsappFrom: c.twilio_whatsapp_number ? phoneE164(c.twilio_whatsapp_number) : "",
  };
}

type SendResult = { ok: boolean; error?: string; sid?: string };

function basicAuth(accountSid: string, authToken: string): string {
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

async function postMessage(cfg: TwilioConfig, from: string, to: string, body: string): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(cfg.accountSid, cfg.authToken)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.sid) return { ok: true, sid: json.sid };
    return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network_error" };
  }
}

/** SMS classique via le numéro Twilio. */
export async function sendTwilioSMS(cfg: TwilioConfig, to: string, body: string): Promise<SendResult> {
  return postMessage(cfg, cfg.smsFrom, phoneE164(to), body);
}

/** WhatsApp via Twilio (BSP) — échoue proprement si aucun sender WhatsApp n'est configuré. */
export async function sendTwilioWhatsApp(cfg: TwilioConfig, to: string, body: string): Promise<SendResult> {
  if (!cfg.whatsappFrom) return { ok: false, error: "whatsapp_sender_not_configured" };
  return postMessage(cfg, `whatsapp:${cfg.whatsappFrom}`, `whatsapp:${phoneE164(to)}`, body);
}

/** Vérifie les identifiants (bouton "Tester" admin) — lit le compte via l'API Twilio. */
export async function twilioPing(cfg: TwilioConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}.json`, {
      headers: { Authorization: `Basic ${basicAuth(cfg.accountSid, cfg.authToken)}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.status) {
      return { ok: true, detail: `✅ Compte "${json.friendly_name ?? cfg.accountSid}" — statut ${json.status}` };
    }
    return { ok: false, detail: json?.message ?? `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, detail: `Injoignable : ${e?.message ?? "network_error"}` };
  }
}

/**
 * Vérifie la signature `X-Twilio-Signature` d'une requête webhook entrante — sans
 * ça, n'importe qui pourrait POSTer de faux "messages entrants" vers notre webhook
 * public et déclencher de fausses réponses automatiques ou polluer les logs.
 * Algo officiel Twilio : HMAC-SHA1(authToken, url + paramètres triés par clé et
 * concaténés "clé"+"valeur"), encodé en base64.
 * Docs : https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export async function verifyTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  let data = fullUrl;
  for (const key of Object.keys(params).sort()) data += key + params[key];

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const computed = Buffer.from(sigBuf).toString("base64");
  return computed === signatureHeader;
}
