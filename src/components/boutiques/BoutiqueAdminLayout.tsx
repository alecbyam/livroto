// Coquille du backoffice boutique (POS, produits, commandes, fournisseurs,
// factures, promo, rapports, paramètres) : jusqu'ici chaque page vivait sans
// aucune navigation commune, seulement atteignable en tapant l'URL exacte.
// Ce layout donne à CHAQUE boutique cliente (Hugo Collection = la première)
// une vraie gestion autonome, avec sa propre identité (logo/nom), sans
// jamais mentionner Livroto — même philosophie que <BoutiqueSiteLayout>.
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Package,
  ShoppingCart,
  ClipboardList,
  Truck,
  Receipt,
  Tag,
  LayoutGrid,
  CreditCard,
  BarChart3,
  Settings,
  Store,
  LogOut,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";

const SECTIONS = [
  { to: "/boutique/admin/pos", label: "Caisse", icon: ShoppingCart },
  { to: "/boutique/admin/produits", label: "Produits", icon: Package },
  { to: "/boutique/admin/categories", label: "Catégories", icon: LayoutGrid },
  { to: "/boutique/admin/commandes", label: "Commandes", icon: ClipboardList },
  { to: "/boutique/admin/credits", label: "Crédits", icon: CreditCard },
  { to: "/boutique/admin/fournisseurs", label: "Fournisseurs", icon: Truck },
  { to: "/boutique/admin/factures", label: "Factures", icon: Receipt },
  { to: "/boutique/admin/promo", label: "Promotions", icon: Tag },
  { to: "/boutique/admin/rapports", label: "Rapports", icon: BarChart3 },
  { to: "/boutique/admin/equipe", label: "Équipe", icon: Users },
  { to: "/boutique/admin/parametres", label: "Paramètres", icon: Settings },
] as const;

export function BoutiqueAdminLayout({ children }: { children: ReactNode }) {
  const boutique = useBoutique();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const seDeconnecter = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/boutique", search: { boutique: boutique.slug } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Link
            to="/boutique/admin/produits"
            search={{ boutique: boutique.slug }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            {boutique.logo_url ? (
              <img
                src={boutique.logo_url}
                alt={boutique.nom}
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary font-bold text-primary-foreground">
                {boutique.nom.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{boutique.nom}</p>
              <p className="text-xs text-muted-foreground">Gestion</p>
            </div>
          </Link>
          <Link
            to="/boutique"
            search={{ boutique: boutique.slug }}
            className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:flex"
          >
            <Store className="h-4 w-4" /> Voir la boutique
          </Link>
          <button
            type="button"
            onClick={seDeconnecter}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
        <nav className="container mx-auto overflow-x-auto px-4 pb-2">
          <ul className="flex gap-1 whitespace-nowrap">
            {SECTIONS.map((s) => {
              const active = pathname.startsWith(s.to);
              const Icon = s.icon;
              return (
                <li key={s.to}>
                  <Link
                    to={s.to}
                    search={{ boutique: boutique.slug }}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
