import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { logServerError } from "./lib/error-reporting.functions";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

// Durcissement sécurité (audit du 5/08/2026) : aucun en-tête de ce type n'était posé avant.
// Volontairement PAS de Content-Security-Policy ici — trop de surface à auditer d'abord
// (WebUSB/Bluetooth imprimante + caméra scan côté module boutique, script inline anti-flash
// du thème dans __root.tsx, Supabase Realtime en WebSocket...) pour la poser sans risque de
// casser une fonctionnalité en prod à l'aveugle. À faire dans une passe dédiée, testée.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
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
