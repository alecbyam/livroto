import { supabase } from "@/integrations/supabase/client";
import { resetAuthState } from "@/lib/auth-recovery";
import { authLog } from "@/lib/auth-log";

const ATTEMPTS_FLAG = "livroto.authHealAttempts";
// INCIDENT (5 juillet 2026) : ce timeout était resté à 12 s alors que le verrou
// anti-deadlock (client.ts, LOCK_ACQUIRE_MAX_MS) a été porté à 15 s le 13/06/2026
// pour couvrir les refreshes lents sur 2G Bunia (6-12 s, parfois plus). Le watchdog
// se déclenchait donc AVANT que le verrou n'ait fini d'attendre un refresh pourtant
// légitime : getSession() (qui passe par le même verrou) était pris à tort pour un
// gel, et au 2ᵉ épisode dans la session de navigation, resetAuthState() purgeait une
// session VALIDE => déconnexion + reconnexion forcée. Confirmé par les logs Supabase
// (auth) : le même compte se reconnectait plusieurs fois en quelques minutes, avec un
// `token_revoked` explicite. Le watchdog doit toujours rester largement AU-DESSUS du
// timeout du verrou, jamais en dessous — sinon une simple lenteur réseau (pas un vrai
// gel) déclenche l'auto-réparation à tort. 20 s laisse ~5 s de marge au-delà des 15 s
// du verrou.
const GETSESSION_TIMEOUT_MS = 20000;

/**
 * Filet de sécurité au démarrage : si l'auth est réellement FIGÉE (getSession ne répond
 * pas en 12 s — signature d'un verrou Web Lock bloqué), on répare automatiquement.
 *
 * Escalade DOUCE (on ne détruit jamais une session valide au premier hoquet) :
 *   1er gel  -> simple reload. Recharger libère les Web Locks tenus par CET onglet et
 *              relance getSession ; via le repli anti-deadlock (5 s) la 2ᵉ tentative
 *              aboutit le plus souvent SANS rien effacer.
 *   2ᵉ gel   -> resetAuthState (purge) + reload, en dernier recours.
 *   3ᵉ gel   -> on abandonne (anti-boucle) pour ne pas recharger en boucle.
 *
 * On n'agit QUE sur un vrai TIMEOUT (gel) : une erreur "normale" de getSession (ex. hors
 * ligne) est déjà gérée ailleurs (garde de route -> /auth) et ne doit pas purger l'auth.
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
    // Auth qui répond : on réarme le compteur pour une future auto-réparation.
    try { sessionStorage.removeItem(ATTEMPTS_FLAG); } catch {}
    return;
  }

  authLog("watchdog:TIMEOUT — auth figée");

  // Escalade selon le nombre de gels déjà rencontrés dans cette session de navigation.
  let attempts = 0;
  try { attempts = Number(sessionStorage.getItem(ATTEMPTS_FLAG)) || 0; } catch {}

  if (attempts >= 2) {
    authLog("watchdog:abandon — 2 réparations déjà tentées (anti-boucle)");
    return;
  }

  try { sessionStorage.setItem(ATTEMPTS_FLAG, String(attempts + 1)); } catch {}

  if (attempts === 0) {
    // 1er gel : reload simple, SANS purge -> ne déconnecte pas une session valide.
    authLog("watchdog:1er gel -> reload simple (sans purge)");
    setTimeout(() => window.location.reload(), 300);
    return;
  }

  // 2ᵉ gel : le reload n'a pas suffi -> purge + reload en dernier recours.
  authLog("watchdog:2e gel -> resetAuthState + reload");
  await resetAuthState();
  setTimeout(() => window.location.reload(), 300);
}
