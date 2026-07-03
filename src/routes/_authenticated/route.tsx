import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasStoredSupabaseSession } from "@/lib/auth-recovery";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() lit la session locale (localStorage) et rafraîchit le token au
    // besoin SANS dépendre du réseau. getUser() faisait un appel réseau /user à
    // chaque navigation : sur réseau instable (Bunia), le moindre échec éjectait
    // un utilisateur pourtant valide vers /auth (fausse déconnexion en boucle).
    // La sécurité reste assurée côté serveur (RLS + requireSupabaseAuth valident le JWT).
    //
    // INCIDENT (5 juillet 2026) : même avec getSession(), un token proche de
    // l'expiration déclenche un refresh RÉSEAU (voir __loadSession dans
    // @supabase/auth-js). Si ce refresh échoue transitoirement (2G Bunia), getSession()
    // renvoie {session: null, error} pour CET appel précis — MAIS supabase-js ne vide
    // le storage QUE sur une erreur d'auth définitive, jamais sur une erreur réseau
    // retryable. Rediriger vers /auth dans ce cas déconnectait un utilisateur dont la
    // session était en réalité toujours valide. On ne redirige donc que si, en plus de
    // l'échec de cet appel, aucun token n'est trouvé dans le storage local (= vraiment
    // jamais connecté / vraiment déconnecté).
    try {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) return { user: data.session.user };
      if (error && hasStoredSupabaseSession()) return {};
    } catch {
      if (hasStoredSupabaseSession()) return {};
    }
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});