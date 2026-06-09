import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/lib/cart";
import { FavoritesProvider } from "@/lib/favorites";
import { CurrencyProvider } from "@/lib/currency";
import { ThemeProvider } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="text-8xl">🛵</div>
        <h1 className="mt-4 font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-3 text-xl font-semibold">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Retour à l'accueil
          </Link>
          <Link
            to="/catalog"
            className="inline-flex items-center justify-center rounded-xl border px-6 py-2.5 text-sm font-semibold"
          >
            Voir le catalogue
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// Origine Supabase (API + images produits) — on ouvre la connexion tôt pour
// accélérer la 1ère requête sur réseau lent (Bunia).
const SUPABASE_ORIGIN = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Livroto — Bunia livre à ta porte" },
      { name: "description", content: "Première marketplace locale de Bunia : commande accessoires, cuisine locale et livraison. Cash à la livraison via WhatsApp." },
      { property: "og:title", content: "Livroto — Bunia livre à ta porte" },
      { property: "og:description", content: "Première marketplace locale de Bunia : commande accessoires, cuisine locale et livraison. Cash à la livraison via WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Livroto — Bunia livre à ta porte" },
      { name: "twitter:description", content: "Première marketplace locale de Bunia : commande accessoires, cuisine locale et livraison. Cash à la livraison via WhatsApp." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f5385c90-0fee-4057-90e8-4eb7a768fef9/id-preview-9018c7d5--eb4aafa8-f026-40f8-b47a-596d04dffa4f.lovable.app-1780419265195.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f5385c90-0fee-4057-90e8-4eb7a768fef9/id-preview-9018c7d5--eb4aafa8-f026-40f8-b47a-596d04dffa4f.lovable.app-1780419265195.png" },
      { name: "theme-color", content: "#0f3d2e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Livroto" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { name: "author", content: "iNova" },
      { name: "publisher", content: "iNova" },
      { property: "og:site_name", content: "Livroto" },
    ],
    links: [
      ...(SUPABASE_ORIGIN
        ? [
            { rel: "preconnect", href: SUPABASE_ORIGIN, crossOrigin: "anonymous" as const },
            { rel: "dns-prefetch", href: SUPABASE_ORIGIN },
          ]
        : []),
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Applique le thème avant le 1er rendu pour éviter tout flash */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('livroto.theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;if(d)e.classList.add('dark');e.style.colorScheme=d?'dark':'light';}catch(_){}})();",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Auto-mise à jour : recharge la page quand une nouvelle version prend le contrôle.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Vérifie les mises à jour régulièrement et au retour sur l'onglet
        const check = () => reg.update().catch(() => {});
        const interval = setInterval(check, 60_000);
        window.addEventListener("focus", check);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            // Nouvelle version installée alors qu'une ancienne contrôle déjà la page
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" }); // sw.js s'active → controllerchange → reload
            }
          });
        });
        return () => { clearInterval(interval); window.removeEventListener("focus", check); };
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <CurrencyProvider>
            <CartProvider>
              <FavoritesProvider>
                <Outlet />
                <Toaster richColors position="top-center" />
              </FavoritesProvider>
            </CartProvider>
          </CurrencyProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
