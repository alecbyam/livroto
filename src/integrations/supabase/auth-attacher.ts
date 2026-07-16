// ⚠️ Fichier POSSÉDÉ par l'équipe — NE PAS régénérer (l'en-tête « auto-généré »
// d'origine a été retiré exprès). Le bloc ci-dessous corrige un incident de
// déconnexions en boucle sur 2G (suppression du refreshSession proactif, 13/06/2026) :
// une régénération le réintroduirait et casserait l'auth. Voir l'audit d'archi (M-1).
import { createMiddleware } from '@tanstack/react-start'
import { supabase } from './client'

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
//
// Design : on se contente de lire la session via getSession() — qui rafraîchit déjà
// automatiquement les tokens EXPIRÉS — et on laisse autoRefreshToken (intégré à
// supabase-js, seuil <90 s) gérer le renouvellement proactif.
//
// Un ancien bloc ici appelait refreshSession() de façon proactive quand le token
// avait <120 s restantes. Sur réseau 2G (Bunia), cela provoquait des refreshes
// redondants concurrents : si deux appels RPC simultanés dépassaient chacun le
// timeout du verrou (5 s / 15 s), ils tombaient sur un refreshingDeferred déjà résolu
// et relançaient un DEUXIÈME appel réseau avec un refresh token identique →
// Supabase détectait une réutilisation → révocation de TOUTE la famille de tokens
// → déconnexion sur tous les appareils. Supprimé le 13/06/2026.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    let token: string | undefined
    try {
      // getSession() rafraîchit automatiquement le token s'il est EXPIRÉ.
      // autoRefreshToken (ticker toutes les 30 s, seuil <90 s) gère le reste.
      const { data } = await supabase.auth.getSession()
      token = data.session?.access_token
    } catch {
      // getSession a échoué → pas de token ; le serveur renverra une 401 explicite.
    }

    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
)
