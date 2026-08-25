// Layout marque blanche de la vitrine publique d'une boutique. Volontairement
// SÉPARÉ de <SiteLayout> (composant marketplace JuntoxShop : Navbar/Footer avec
// branding JuntoxShop, WhatsAppFab pointant vers le WhatsApp JuntoxShop, etc.) —
// aucun de ces éléments ne doit apparaître ici. Chaque boutique cliente doit
// pouvoir se croire seule sur sa propre plateforme.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart, Facebook, MessageCircle } from "lucide-react";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";

// lucide-react n'a pas d'icône TikTok (icônes de marque dépréciées dans cette
// lib) — tracé minimal maison plutôt qu'ajouter une dépendance juste pour un
// glyphe.
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82c-.9-.94-1.4-2.13-1.44-3.32h-3.02v13.5a2.59 2.59 0 1 1-1.83-2.48V10.5a5.6 5.6 0 1 0 4.85 5.55V9.35a7.6 7.6 0 0 0 4.44 1.42V7.75c-1.05 0-2.09-.35-2.93-1.03a4.3 4.3 0 0 1-.07-.9Z" />
    </svg>
  );
}

function normaliserUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function EnTete() {
  const boutique = useBoutique();
  const { articles } = useBoutiqueCart();
  const total = articles.reduce((s, a) => s + a.quantite, 0);
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex items-center gap-3 px-4 py-4">
        <Link to="/boutique" search={{ boutique: boutique.slug }} className="flex flex-1 items-center gap-3">
          {boutique.logo_url ? (
            <img src={boutique.logo_url} alt={boutique.nom} className="h-10 w-auto max-w-[9rem] shrink-0 object-contain" />
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
          {(boutique.facebook_url || boutique.tiktok_url || boutique.whatsapp_url) && (
            <div className="mt-3 flex gap-3">
              {boutique.facebook_url && (
                <a
                  href={normaliserUrl(boutique.facebook_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {boutique.tiktok_url && (
                <a
                  href={normaliserUrl(boutique.tiktok_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <TikTokIcon className="h-5 w-5" />
                </a>
              )}
              {boutique.whatsapp_url && (
                <a
                  href={normaliserUrl(boutique.whatsapp_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              )}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
