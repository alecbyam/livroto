// ============================================================================
// Edge Function : webhook WhatsApp Cloud API (public, verify_jwt=false)
//   - GET  : handshake de vérification Meta (hub.challenge / hub.verify_token)
//   - POST : réception des événements (statuts de messages, messages entrants)
// URL : https://<project>.supabase.co/functions/v1/whatsapp-webhook
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) Vérification de l'abonnement (Meta appelle en GET lors de la config)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const tokenQ = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await admin
      .from("integration_settings")
      .select("value")
      .eq("key", "whatsapp_verify_token")
      .maybeSingle();
    const expected = (data?.value ?? "").trim();

    if (mode === "subscribe" && tokenQ && expected && tokenQ === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  // 2) Réception des événements — répondre 200 rapidement (Meta réessaie sinon)
  if (req.method === "POST") {
    try {
      await req.json();
      // (Traitement détaillé des accusés de livraison/lecture possible plus tard ;
      //  on accuse simplement réception pour valider l'abonnement.)
    } catch {
      // ignore parse errors, on répond quand même 200
    }
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
});
