// Manifest PWA PAR BOUTIQUE — jamais /manifest.webmanifest (fichier statique
// servi directement par Nitro depuis public/, une route dynamique au même
// chemin ne serait jamais atteinte). Nom de fichier volontairement différent
// pour ne collisionner avec aucun fichier existant sous public/.
//
// Installé sur téléphone/ordinateur, l'icône doit ouvrir DIRECTEMENT la
// gestion de LA boutique concernée (pas le catalogue Livroto) — d'où
// `start_url` pointant vers la caisse (l'écran que le staff ouvre en premier
// chaque jour), pas la vitrine ni l'accueil marketplace.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/boutique-manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("boutique")?.trim().toLowerCase();
        // Deux apps installables bien distinctes depuis le même manifest
        // dynamique : la vitrine cliente (cible=site, par défaut) et la
        // gestion staff (cible=admin) — sans ce paramètre, une installation
        // depuis la vitrine ouvrirait à tort la caisse au lieu du catalogue.
        const cible = url.searchParams.get("cible") === "admin" ? "admin" : "site";

        const notFound = () =>
          new Response(JSON.stringify({ error: "boutique introuvable" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        if (!slug) return notFound();

        const { data: boutique } = await supabaseAdmin
          .from("boutiques")
          .select("nom,slogan,logo_url,theme,actif")
          .eq("slug", slug)
          .eq("actif", true)
          .maybeSingle();
        if (!boutique) return notFound();

        const theme = (boutique.theme ?? {}) as { primary?: string; accent?: string };
        const couleur = theme.primary ?? "#0f3d2e";
        // Une seule image (logo_url, dimensions arbitraires) réutilisée à
        // toutes les tailles déclarées — le navigateur redimensionne ;
        // même convention déjà en place pour les <link rel="icon"> par
        // boutique (src/routes/boutique/route.tsx).
        const icone = boutique.logo_url;
        // `type` doit refléter le VRAI format du fichier (logo_url peut être
        // un .jpg — cf. scripts/uploader-logo-boutique.mjs) : un type déclaré
        // erroné ("image/png" pour un jpeg) peut faire ignorer l'icône par
        // Chrome lors du contrôle d'installabilité PWA.
        const extension = icone?.split(".").pop()?.toLowerCase();
        const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
        const icons = icone
          ? [
              { src: icone, sizes: "192x192", type: mime, purpose: "any" },
              { src: icone, sizes: "192x192", type: mime, purpose: "maskable" },
              { src: icone, sizes: "512x512", type: mime, purpose: "any" },
              { src: icone, sizes: "512x512", type: mime, purpose: "maskable" },
            ]
          : [
              { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
              { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            ];

        const manifest = {
          name: cible === "admin" ? boutique.nom : `${boutique.nom} — Boutique en ligne`,
          short_name: boutique.nom.length > 15 ? boutique.nom.slice(0, 15) : boutique.nom,
          description:
            cible === "admin"
              ? `Gestion de ${boutique.nom}`
              : boutique.slogan || `Boutique en ligne ${boutique.nom}`,
          start_url:
            cible === "admin"
              ? `/boutique/admin/pos?boutique=${encodeURIComponent(slug)}`
              : `/boutique?boutique=${encodeURIComponent(slug)}`,
          scope: "/boutique",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait-primary",
          background_color: couleur,
          theme_color: couleur,
          lang: "fr",
          dir: "ltr",
          categories: ["business", "shopping"],
          prefer_related_applications: false,
          icons,
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
