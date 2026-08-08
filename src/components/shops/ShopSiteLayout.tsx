// ============================================================================
// Coquille indépendante pour le module boutique générique — PAS de Navbar/
// Footer/MobileTabBar/WhatsAppFab/InstallPWA de SiteLayout (marketplace
// Livroto). Chaque boutique (Muungano, et les suivantes) est une entité à
// part entière : ses visiteurs ne doivent voir QUE sa marque, jamais la
// navigation Livroto (catalogue, autres vendeurs, panier marketplace...).
// Même principe que le shell dédié des boutiques Hugo Collection — schéma
// et composants entièrement neufs ici, aucun code partagé avec eux.
// ============================================================================
import type { ReactNode } from "react";
import { Store, MessageCircle } from "lucide-react";

export type ShopBrand = {
  slug: string;
  name: string;
  logo_url: string | null;
  whatsapp_display: string | null;
};

export function ShopSiteLayout({
  shop, children, backHref,
}: {
  shop: ShopBrand | null;
  children: ReactNode;
  /** Lien du logo/nom dans l'en-tête (par défaut : vitrine de la boutique). */
  backHref?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 py-2.5 flex items-center gap-3">
          <a href={backHref ?? (shop ? `/shop/${shop.slug}` : "#")} className="flex items-center gap-2.5 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted overflow-hidden">
              {shop?.logo_url ? <img src={shop.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4" />}
            </div>
            <span className="font-display font-bold truncate">{shop?.name ?? "…"}</span>
          </a>
          {shop?.whatsapp_display && (
            <a
              href={`https://wa.me/${shop.whatsapp_display.replace(/[^0-9]/g, "")}`}
              target="_blank" rel="noreferrer"
              className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t py-5 text-center text-xs text-muted-foreground">
        {shop && <p className="font-medium text-foreground">{shop.name}</p>}
        <p className="mt-1">
          Commande en ligne propulsée par{" "}
          <a href="https://livroto-frontend-production.up.railway.app" className="underline hover:text-foreground">Livroto</a>
        </p>
      </footer>
    </div>
  );
}
