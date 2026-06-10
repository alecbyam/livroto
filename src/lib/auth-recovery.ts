import { supabase } from "@/integrations/supabase/client";

const PROJECT = "joaepnfhhewadcklsquk";

/**
 * Filet de secours anti-blocage : purge l'état d'auth local. À utiliser depuis l'UI
 * (bouton « Réinitialiser la session ») pour que l'utilisateur ne soit JAMAIS obligé
 * de vider le cache / les cookies du navigateur lui-même.
 */
export async function resetAuthState(): Promise<void> {
  // signOut local (best-effort) — borné pour ne jamais bloquer.
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch {
    /* ignore */
  }
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("sb-") && k.includes("-auth-token")) localStorage.removeItem(k);
    });
    localStorage.removeItem(`sb-${PROJECT}-auth-token-code-verifier`);
  } catch {
    /* ignore */
  }
}
