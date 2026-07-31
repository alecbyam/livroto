// Layout marque blanche de la vitrine publique d'une boutique. Volontairement
// SÉPARÉ de <SiteLayout> (composant marketplace Livroto : Navbar/Footer avec
// branding Livroto, WhatsAppFab pointant vers le WhatsApp Livroto, etc.) —
// aucun de ces éléments ne doit apparaître ici. Chaque boutique cliente doit
// pouvoir se croire seule sur sa propre plateforme.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";

function EnTete() {
  const boutique = useBoutique();
  const { articles } = useBoutiqueCart();
  const total = articles.reduce((s, a) => s + a.quantite, 0);
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex items-center gap-3 px-4 py-4">
        <Link to="/boutique" search={{ boutique: boutique.slug }} className="flex flex-1 items-center gap-3">
          {boutique.logo_url ? (
            <img src={boutique.logo_url} alt={boutique.nom} className="h-10 w-10 rounded-md object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              {boutique.nom.charAt(0)}
            </div>
          )}
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold leading-tight">{boutique.nom}</span>
            {boutique.slogan && (
              <span className="hidden truncate text-xs italic text-muted-foreground sm:block">{boutique.slogan}</span>
            )}
          </span>
        </Link>
        <Link to="/boutique/panier" search={{ boutique: boutique.slug }} className="relative">
          <ShoppingCart className="h-6 w-6" />
          {total > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {total}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

// Le <BoutiqueCartProvider> vit dans le layout de route (/boutique/route.tsx),
// pas ici : les pages qui utilisent useBoutiqueCart() (index.tsx, panier.tsx)
// le font à LEUR propre niveau, avant de rendre <BoutiqueSiteLayout> comme
// enfant — le provider doit donc être un ancêtre commun aux pages ET à ce
// layout, jamais imbriqué à l'intérieur de ce dernier.
export function BoutiqueSiteLayout({ children }: { children: ReactNode }) {
  const boutique = useBoutique();
  return (
    <div className="flex min-h-screen flex-col">
      <EnTete />
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-background">
        <div className="container mx-auto px-4 py-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{boutique.nom}</p>
          {boutique.slogan && <p className="italic">{boutique.slogan}</p>}
          {boutique.adresse && <p>{boutique.adresse}</p>}
          <div className="mt-1 flex flex-wrap gap-x-4">
            {boutique.telephone && <span>{boutique.telephone}</span>}
            {boutique.email && <span>{boutique.email}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}
