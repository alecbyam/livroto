// ============================================================================
// Webhook Twilio : SMS entrant sur le numéro JuntoxShop — API route TanStack
// Start (pas une Edge Function Supabase, contrairement à whatsapp-webhook : ce
// module tourne directement sur le serveur Railway déjà déployé, pas besoin
// d'une ressource Supabase séparée pour un simple webhook).
//
// URL à coller dans Twilio › Numéro › Messaging › "A message comes in" :
//   https://shop.juntoxrdc.com/api/twilio/sms-webhook   (méthode POST)
//
// Comportement : un client envoie n'importe quel SMS à ce numéro → on retrouve
// sa commande la plus récente (par numéro de téléphone) et on répond
// automatiquement avec son statut. Première brique d'automatisation demandée —
// gestion de commande/clientèle par SMS, sans dépendre d'un humain disponible.
//
// Sécurité : Twilio signe chaque requête webhook (X-Twilio-Signature). On la
// vérifie avant de traiter quoi que ce soit — sinon n'importe qui pourrait
// POSTer de faux messages vers cette URL publique.
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import { getTwilioConfig, verifyTwilioSignature } from "@/lib/integrations/twilio.server";
import { getPublicFlag } from "@/lib/integrations/config.server";
import { phoneDigits } from "@/lib/phone";
import { LIVROTO_WHATSAPP } from "@/lib/whatsapp";

const STATUS_LABEL: Record<string, string> = {
  pending: "en attente de confirmation par le vendeur",
  confirmed: "confirmée, en préparation",
  ready: "prête, un livreur va bientôt la récupérer",
  picked_up: "en route avec le livreur",
  delivered: "livrée",
  cancelled: "annulée",
};

// Derniers 9 chiffres = numéro national significatif RDC (ex : 991234567), quel
// que soit le format saisi par le client à la commande (+243..., 0991..., 991...).
function last9Digits(phone: string): string {
  return phoneDigits(phone).slice(-9);
}

function twiml(message: string): Response {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

// Réponse vide (200, pas de <Message>) : accuse réception sans répondre au
// client — utilisé quand Twilio n'est pas configuré/actif ou la signature échoue,
// pour ne jamais révéler d'info à un appelant non authentifié.
function emptyTwiml(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export const Route = createFileRoute("/api/twilio/sms-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await getPublicFlag("twilio_enabled"))) return emptyTwiml();
        const cfg = await getTwilioConfig();
        if (!cfg) return emptyTwiml();

        const rawBody = await request.text();
        const params = Object.fromEntries(new URLSearchParams(rawBody));

        const signature = request.headers.get("X-Twilio-Signature");
        // Twilio calcule la signature sur l'URL exacte qu'il a appelée — Railway est
        // derrière un proxy, on reconstruit donc l'URL publique plutôt que d'utiliser
        // request.url (qui peut porter un schéma/host internes).
        const appBase = (process.env.APP_URL || "https://shop.juntoxrdc.com").replace(/\/+$/, "");
        const publicUrl = `${appBase}/api/twilio/sms-webhook`;
        const valid = await verifyTwilioSignature(cfg.authToken, publicUrl, params, signature);
        if (!valid) {
          console.warn("[twilio-webhook] signature invalide — requête ignorée");
          return emptyTwiml();
        }

        const from = params.From;
        if (!from) return emptyTwiml();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const digits = last9Digits(from);

        // Pas d'index dédié pour une recherche par téléphone normalisé — le volume de
        // commandes reste modeste (marketplace locale Bunia), donc on relit les plus
        // récentes et on compare en mémoire plutôt que de dépendre d'un format de
        // stockage de customer_phone qui n'a jamais été normalisé à la saisie.
        const { data: candidates } = await supabaseAdmin
          .from("orders")
          .select("id,code,customer_id,customer_phone,status,total_usd,delivery_fee,created_at")
          .not("customer_phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(1000);

        const order = (candidates ?? []).find((o) => digits && last9Digits(o.customer_phone ?? "") === digits);

        let reply: string;
        if (!order) {
          reply =
            `JuntoxShop: aucune commande recente trouvee pour ce numero. ` +
            `Pour commander ou parler a un humain: wa.me/${LIVROTO_WHATSAPP}`;
        } else {
          const codeLabel = order.code ?? order.id.slice(0, 8);
          const label = STATUS_LABEL[order.status] ?? order.status;
          const total = Number(order.total_usd) + Number(order.delivery_fee ?? 0);
          reply =
            `JuntoxShop: ta commande #${codeLabel} est ${label}. Total: $${total.toFixed(2)} (livraison incluse). ` +
            `Besoin d'aide ? wa.me/${LIVROTO_WHATSAPP}`;

          // Journal in-app seulement si la commande a un compte client rattaché
          // (notifications.user_id est NOT NULL) — les vieilles commandes invité
          // n'en ont pas, on répond quand même au SMS mais sans log en base.
          if (order.customer_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: order.customer_id,
              order_id: order.id,
              to_phone: from,
              channel: "sms",
              status: "sent",
              sent_at: new Date().toISOString(),
              payload: { kind: "twilio_sms_auto_reply", code: codeLabel, incoming_body: params.Body ?? "" },
            }).then(undefined, () => {});
          }
        }

        return twiml(reply);
      },
    },
  },
});
