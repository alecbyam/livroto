import { supabase } from "@/integrations/supabase/client";
import { authLog } from "@/lib/auth-log";

const ATTEMPTS_FLAG = "livroto.authHealAttempts";
// Doit rester NETTEMENT au-dessus de LOCK_ACQUIRE_MAX_MS (client.ts, 15 s) : en dessous,
// une simple lenteur (réseau 2G, téléphone lent, verrous en file au démarrage) est prise
// pour un gel. C'est exactement l'oubli du 13/06/2026 (verrou 15 s, watchdog resté à 12 s)
// qui a fait durer l'incident de déconnexions ~3 semaines.
// 4/07/2026 : même à 20 s, un vrai téléphone Android a dépassé le délai à cause des
// callbacks onAuthStateChange qui faisaient la queue sur le verrou (corrigé — voir
// favorites/cart/useUserRoles) ; porté à 30 s pour garder de la marge.
const GETSESSION_TIMEOUT_MS = 30000;

/**
 * Filet de sécurité au démarrage : si getSession() ne répond pas dans le délai (signature
 * d'un blocage côté client), on tente UN reload — recharger libère les Web Locks tenus par
 * CET onglet, et via le repli anti-deadlock (client.ts) la 2ᵉ tentative aboutit presque
 * toujours. Au 2ᵉ dépassement on ABANDONNE, on ne purge JAMAIS automatiquement.
 *
 * HISTORIQUE (pourquoi on ne purge plus) : jusqu'au 6/07/2026, le 2ᵉ dépassement
 * déclenchait resetAuthState() (purge du storage). Le journal de diagnostic d'un appareil
 * réel (4/07/2026, 16:50 UTC) a prouvé que cette escalade détruisait une session VALIDE :
 * SIGNED_IN émis 20 s avant la purge, token encore valable ~3 h. Un dépassement de délai
 * signifie « lent » (2G, appareil modeste, contention de verrous), pas « storage empoisonné » :
 *  - un vrai deadlock de verrou est déjà couvert par deadlockSafeLock (plafond 15 s) ;
 *  - un refresh token réellement révoqué produit une erreur définitive, sur laquelle
 *    supabase-js purge LUI-MÊME le storage (_callRefreshToken → removeSession) ;
 * → il n'existe plus de scénario où purger sur timeout répare quoi que ce soit. Le bouton
 * « Réinitialiser la session » sur /auth reste le recours manuel en dernier ressort.
 */
export async function runAuthWatchdog(): Promise<void> {
  if (typeof window === "undefined") return;

  let outcome: "ok" | "error" | "timeout" = "ok";
  try {
    outcome = await Promise.race([
      supabase.auth
        .getSession()
        .then(() => "ok" as const)
        .catch((e) => {
          authLog("watchdog:getSession_error", String(e?.message ?? e));
          return "error" as const;
        }),
      new Promise<"timeout">((res) => setTimeout(() => res("timeout"), GETSESSION_TIMEOUT_MS)),
    ]);
  } catch (e) {
    outcome = "error";
    authLog("watchdog:exception", String(e));
  }

  if (outcome !== "timeout") {
    authLog(outcome === "ok" ? "watchdog:ok" : "watchdog:error — pas d'action (géré ailleurs)");
    // Auth qui répond : on réarme le compteur.
    try { sessionStorage.removeItem(ATTEMPTS_FLAG); } catch {}
    return;
  }

  authLog("watchdog:TIMEOUT — auth très lente ou figée");

  let attempts = 0;
  try { attempts = Number(sessionStorage.getItem(ATTEMPTS_FLAG)) || 0; } catch {}

  if (attempts >= 1) {
    // 2ᵉ dépassement : on n'insiste pas et surtout on ne purge RIEN (voir historique).
    authLog("watchdog:abandon — reload déjà tenté, pas de purge automatique");
    return;
  }

  try { sessionStorage.setItem(ATTEMPTS_FLAG, String(attempts + 1)); } catch {}
  authLog("watchdog:1er dépassement -> reload simple (sans purge)");
  setTimeout(() => window.location.reload(), 300);
}
