// Coquille du backoffice boutique (POS, produits, commandes, fournisseurs,
// factures, promo, rapports, paramètres) : jusqu'ici chaque page vivait sans
// aucune navigation commune, seulement atteignable en tapant l'URL exacte.
// Ce layout donne à CHAQUE boutique cliente (Hugo Collection = la première)
// une vraie gestion autonome, avec sa propre identité (logo/nom), sans
// jamais mentionner Livroto — même philosophie que <BoutiqueSiteLayout>.
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { boutiqueObtenirMonRole } from "@/lib/boutiques/staff.functions";

type Role = "admin" | "vendeur" | "caissier";

// Rôles autorisés à voir chaque section — reflète exactement ce que le
// serveur autorise déjà (assertBoutiqueStaff dans chaque *.functions.ts) :
// pas une règle de sécurité en soi (le serveur revérifie toujours), mais
// masquer une section où un rôle n'a de toute façon aucun droit d'écriture
// évite d'atterrir sur une page où chaque bouton échoue silencieusement.
const SECTIONS: { to: string; label: string; icon: typeof Package; roles: Role[] }[] = [
  { to: "/boutique/admin/pos", label: "Caisse", icon: ShoppingCart, roles: ["admin", "vendeur", "caissier"] },
  { to: "/boutique/admin/produits", label: "Produits", icon: Package, roles: ["admin", "vendeur"] },
  { to: "/boutique/admin/categories", label: "Catégories", icon: LayoutGrid, roles: ["admin", "vendeur"] },
  { to: "/boutique/admin/commandes", label: "Commandes", icon: ClipboardList, roles: ["admin", "vendeur", "caissier"] },
  { to: "/boutique/admin/credits", label: "Crédits", icon: CreditCard, roles: ["admin", "vendeur", "caissier"] },
  { to: "/boutique/admin/fournisseurs", label: "Fournisseurs", icon: Truck, roles: ["admin", "vendeur"] },
  { to: "/boutique/admin/factures", label: "Factures", icon: Receipt, roles: ["admin", "vendeur", "caissier"] },
  { to: "/boutique/admin/promo", label: "Promotions", icon: Tag, roles: ["admin", "vendeur"] },
  { to: "/boutique/admin/rapports", label: "Rapports", icon: BarChart3, roles: ["admin", "vendeur", "caissier"] },
  { to: "/boutique/admin/equipe", label: "Équipe", icon: Users, roles: ["admin"] },
  { to: "/boutique/admin/parametres", label: "Paramètres", icon: Settings, roles: ["admin"] },
];

const LIBELLE_ROLE: Record<Role, string> = {
  admin: "Admin",
  vendeur: "Vendeur",
  caissier: "Caissier",
};

export function BoutiqueAdminLayout({ children }: { children: ReactNode }) {
  const boutique = useBoutique();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const monRoleFn = useServerFn(boutiqueObtenirMonRole);
  const { data: monRole } = useQuery({
    queryKey: ["boutique-mon-role", boutique.id],
    queryFn: () => monRoleFn({ data: { boutique_id: boutique.id } }),
  });
  const role = monRole?.role as Role | null | undefined;
  // Tant que le rôle n'est pas encore chargé, tout afficher plutôt que de
  // faire clignoter la nav (elle se réduira dès que la réponse arrive).
  const sectionsVisibles = role ? SECTIONS.filter((s) => s.roles.includes(role)) : SECTIONS;

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
              <p className="truncate text-xs text-muted-foreground">
                {boutique.slogan ? <span className="italic">{boutique.slogan}</span> : "Gestion"}
              </p>
            </div>
          </Link>
          {role && (
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:flex">
              {LIBELLE_ROLE[role]}
            </span>
          )}
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
            {sectionsVisibles.map((s) => {
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
