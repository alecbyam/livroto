import { supabase } from "@/integrations/supabase/client";
import { resetAuthState } from "@/lib/auth-recovery";
import { authLog } from "@/lib/auth-log";

const HEAL_FLAG = "livroto.authHealed";
const GETSESSION_TIMEOUT_MS = 6000;

/**
 * Filet de sécurité au démarrage : si l'auth est FIGÉE (getSession ne répond pas en 6 s —
 * signature d'un verrou Web Lock bloqué), on répare automatiquement (purge + reload),
 * UNE seule fois par session (anti-boucle). L'utilisateur n'a jamais à vider le cache.
 *
 * getSession() est une lecture localStorage quasi instantanée en temps normal : ce timeout
 * ne se déclenche donc PAS sur réseau lent, seulement quand l'auth est réellement bloquée.
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

  if (outcome === "ok") {
    authLog("watchdog:ok");
    // Auth saine : on autorise une future auto-réparation si un blocage survient plus tard.
    try { sessionStorage.removeItem(HEAL_FLAG); } catch {}
    return;
  }

  authLog(outcome === "timeout" ? "watchdog:TIMEOUT — auth figée" : "watchdog:error — auth en échec");

  // Anti-boucle : on ne répare qu'une fois par session de navigation.
  try {
    if (sessionStorage.getItem(HEAL_FLAG) === "1") {
      authLog("watchdog:deja_repare — pas de nouvelle action (anti-boucle)");
      return;
    }
    sessionStorage.setItem(HEAL_FLAG, "1");
  } catch {}

  authLog("watchdog:auto-reparation -> resetAuthState + reload");
  await resetAuthState();
  setTimeout(() => window.location.reload(), 300);
}
