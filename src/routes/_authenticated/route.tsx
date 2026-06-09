import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() lit la session locale (localStorage) et rafraîchit le token au
    // besoin SANS dépendre du réseau. getUser() faisait un appel réseau /user à
    // chaque navigation : sur réseau instable (Bunia), le moindre échec éjectait
    // un utilisateur pourtant valide vers /auth (fausse déconnexion en boucle).
    // La sécurité reste assurée côté serveur (RLS + requireSupabaseAuth valident le JWT).
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});