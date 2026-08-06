import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { logServerError } from "./lib/error-reporting.functions";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

// Durcissement sécurité (audit du 5/08/2026, CSP ajoutée le 6/08 après audit dédié complet
// des origines réellement contactées par le navigateur — voir le message du commit qui
// introduit cette CSP pour le détail). Constat clé de l'audit : FlexPay, Africa's Talking,
// CallMeBot et WhatsApp Business (Graph API) sont TOUS appelés côté serveur uniquement
// (*.server.ts / *.functions.ts, jamais fetch() côté navigateur) — la seule origine externe
// réellement contactée depuis le navigateur est Supabase (REST + Realtime WebSocket).
const SUPABASE_ORIGIN = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_WSS_ORIGIN = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' assumé (pas de nonce par requête) : JSON-LD dynamique (about/produit/
  // vendeur) + script anti-flash du thème dans __root.tsx sont des <script> inline légitimes
  // dont le contenu change à chaque page/requête (donc pas hashable statiquement). Un nonce
  // par requête demanderait de le faire transiter de server.ts jusqu'à 4 sites de rendu React
  // — architecture pas encore utilisée dans ce repo, jugé trop risqué à poser sans navigateur
  // réel pour vérifier (décision utilisateur du 6/08). Reste protecteur malgré tout : bloque
  // le chargement de script depuis un domaine étranger, et connect-src/img-src stricts
  // ci-dessous limitent fortement l'exfiltration même si un script inline s'exécutait.
  "script-src 'self' 'unsafe-inline'",
  // 'unsafe-inline' nécessaire : attributs style={{...}} inline utilisés partout dans l'app
  // React (animations, couleurs de graphique dynamiques...) — aucune alternative réaliste
  // sans réécrire tous les composants. Risque bien moindre que script-src (pas d'exécution de
  // code arbitraire via une valeur CSS).
  "style-src 'self' 'unsafe-inline'",
  // data:/blob: : compression d'image côté navigateur (aperçu avant upload) et export CSV —
  // aucune donnée n'en sort, ce sont des ressources déjà locales au navigateur.
  `img-src 'self' data: blob:${SUPABASE_ORIGIN ? ` ${SUPABASE_ORIGIN}` : ""}`,
  "font-src 'self'", // polices auto-hébergées (public/fonts/), aucun CDN externe
  `connect-src 'self'${SUPABASE_ORIGIN ? ` ${SUPABASE_ORIGIN} ${SUPABASE_WSS_ORIGIN}` : ""}`,
  "media-src 'self'",
  "object-src 'none'", // aucun plugin/Flash, toujours sûr à bloquer entièrement
  "base-uri 'self'", // empêche l'injection d'une balise <base> qui détournerait les chemins relatifs
  "form-action 'self'", // tous les formulaires soumettent en interne (serverFn), jamais vers un domaine tiers
  "frame-src 'none'", // aucun <iframe> dans l'app
  "frame-ancestors 'none'", // défense en profondeur, redondant avec X-Frame-Options: DENY déjà posé
  "worker-src 'self'", // service worker (public/sw.js)
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": CSP,
};

function withSecurityHeaders(response: Response): Response {
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  } catch {
    // Certains runtimes renvoient des Headers immuables (réponse déjà "scellée") — on
    // reconstruit alors une nouvelle Response avec le même body/status + en-têtes fusionnés.
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(captured);
  // Fire-and-forget : ne jamais retarder la réponse d'erreur pour l'utilisateur en attendant
  // l'écriture du log (le process Node reste vivant après le retour, contrairement à un
  // Worker edge — l'insertion a le temps de partir).
  void logServerError({
    source: "ssr",
    message: captured instanceof Error ? captured.message : String(captured),
    stack: captured instanceof Error ? captured.stack ?? null : null,
  });
  return withSecurityHeaders(new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  }));
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      void logServerError({
        source: "ssr",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
        url: request.url,
      });
      return withSecurityHeaders(new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
    }
  },
};
