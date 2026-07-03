import { supabase } from "@/integrations/supabase/client";

const PROJECT = "joaepnfhhewadcklsquk";

/**
 * Filet de secours anti-blocage : purge l'état d'auth local. À utiliser depuis l'UI
 * (bouton « Réinitialiser la session ») pour que l'utilisateur ne soit JAMAIS obligé
 * de vider le cache / les cookies du navigateur lui-même.
 */
/**
 * Vrai s'il reste un token Supabase stocké localement — même si un appel `getSession()`
 * précis vient d'échouer. supabase-js ne vide le storage QUE sur une erreur d'auth
 * définitive (refresh token invalide/révoqué) ; une erreur réseau retryable (2G Bunia)
 * laisse le storage intact et se contente de renvoyer `{session: null, error}` pour CET
 * appel. Sert à distinguer "vraiment déconnecté" d'un simple hoquet réseau avant de
 * rediriger vers /auth (voir `_authenticated/route.tsx`).
 */
export function hasStoredSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Object.keys(localStorage).some(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
  } catch {
    return false;
  }
}

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
