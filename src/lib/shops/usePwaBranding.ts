// ============================================================================
// Rend une boutique installable en tant qu'app à part entière (nom + icône
// propres sur l'écran d'accueil), sans toucher au manifest global JuntoxShop ni
// au manifest Hugo Collection : on swap juste le <link rel="manifest"> + les
// meta iOS pendant que la page boutique est affichée, et on restaure l'état
// global en quittant. Le service worker (public/sw.js, scope "/") reste
// partagé — déjà générique, aucune modification nécessaire.
// ============================================================================
import { useEffect } from "react";

export function useShopPwaBranding(shop: { slug: string; name: string; logo_url: string | null } | null | undefined) {
  useEffect(() => {
    if (!shop || typeof document === "undefined") return;

    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const prevManifestHref = manifestLink?.getAttribute("href") ?? null;
    if (manifestLink) manifestLink.setAttribute("href", `/shop-manifest.webmanifest?slug=${encodeURIComponent(shop.slug)}`);

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    const prevAppleTitle = appleTitle?.getAttribute("content") ?? null;
    if (appleTitle) appleTitle.setAttribute("content", shop.name);

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    const prevAppleIconHref = appleIcon?.getAttribute("href") ?? null;
    if (appleIcon && shop.logo_url) appleIcon.setAttribute("href", shop.logo_url);

    const prevTitle = document.title;
    document.title = shop.name;

    return () => {
      if (manifestLink && prevManifestHref) manifestLink.setAttribute("href", prevManifestHref);
      if (appleTitle && prevAppleTitle) appleTitle.setAttribute("content", prevAppleTitle);
      if (appleIcon && prevAppleIconHref) appleIcon.setAttribute("href", prevAppleIconHref);
      document.title = prevTitle;
    };
  }, [shop?.slug, shop?.name, shop?.logo_url]);
}
