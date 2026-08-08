// ============================================================================
// Manifest PWA dynamique PAR BOUTIQUE (?slug=...) — module boutique générique.
// Indépendant du manifest Hugo Collection (boutique-manifest[.]webmanifest.ts) :
// nouveau fichier neuf, ne touche à rien sous src/routes/boutique/**.
// Réutilise le même service worker global (public/sw.js, scope "/", déjà
// générique/multi-tenant) — aucun changement nécessaire côté SW.
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/shop-manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = (url.searchParams.get("slug") || "").trim();

        const empty = () =>
          new Response(JSON.stringify({ name: "Livroto", short_name: "Livroto", start_url: "/", display: "standalone" }), {
            status: 200,
            headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
          });
        if (!slug) return empty();

        const { data: shop } = await supabaseAdmin
          .from("shops")
          .select("slug,name,logo_url,status,config")
          .eq("slug", slug)
          .eq("status", "approved")
          .maybeSingle();
        if (!shop) return empty();

        const cfg = (shop.config as Record<string, any>) ?? {};
        const themeColor = typeof cfg.theme_color === "string" ? cfg.theme_color : "#0f3d2e";
        const icon = shop.logo_url || "/icon-512.png";
        const shortName = shop.name.length > 14 ? shop.name.slice(0, 13) + "…" : shop.name;

        const manifest = {
          name: shop.name,
          short_name: shortName,
          description: `Commande en ligne — ${shop.name}, via Livroto.`,
          start_url: `/shop/${shop.slug}`,
          scope: `/shop/${shop.slug}`,
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait-primary",
          background_color: themeColor,
          theme_color: themeColor,
          lang: "fr",
          dir: "ltr",
          categories: ["food", "shopping"],
          prefer_related_applications: false,
          icons: [
            { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
          ],
        };

        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
