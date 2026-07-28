import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasStoredSupabaseSession } from "@/lib/auth-recovery";
import { BoutiqueAdminLayout } from "@/components/boutiques/BoutiqueAdminLayout";

// Backoffice boutique (stock, POS, facturation, fournisseurs, promo,
// rapports). Accès : staff de LA boutique résolue par le layout parent
// _boutique (n'importe quel rôle — admin/vendeur/caissier ; le filtrage fin
// par rôle se fait page par page, cf. is_boutique_staff(..., roles) dans
// chaque serverFn).
//
// ssr: false + getSession() (jamais getUser() côté client) : même choix que
// _authenticated/route.tsx, pour la même raison (réseau Bunia instable — un
// getUser() réseau qui échoue transitoirement ne doit jamais éjecter un
// staff pourtant valide). La sécurité réelle reste RLS + vérification
// serveur dans chaque serverFn, jamais ce hook client seul.
export const Route = createFileRoute("/boutique/admin")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const boutique = (context as { boutique: { id: string } }).boutique;

    try {
      const { data, error } = await supabase.auth.getSession();
      if (!data.session) {
        if (!(error && hasStoredSupabaseSession())) {
          throw redirect({ to: "/auth" });
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
      if (!hasStoredSupabaseSession()) throw redirect({ to: "/auth" });
    }

    const { data: estStaff } = await supabase.rpc("is_boutique_staff", {
      p_boutique_id: boutique.id,
    });
    if (!estStaff) {
      throw redirect({ to: "/boutique" });
    }

    return {};
  },
  component: () => (
    <BoutiqueAdminLayout>
      <Outlet />
    </BoutiqueAdminLayout>
  ),
});
