import type { CSSProperties } from "react";
import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { resolveBoutiqueTenantFn } from "@/lib/boutiques/tenant.functions";
import { BoutiqueProvider } from "@/lib/boutiques/BoutiqueProvider";
import { BoutiqueCartProvider } from "@/lib/boutiques/BoutiqueCartContext";

// Layout racine de TOUT l'espace boutique marque blanche (vitrine publique
// /boutique/... ET backoffice /boutique/admin/...). Résout le tenant une
// seule fois ici ; toutes les routes filles héritent du contexte `boutique`
// sans avoir à re-résoudre quoi que ce soit.
//
// Pas de middleware.ts (TanStack Start n'en a pas) : la résolution par
// domaine/slug se fait dans beforeLoad, seul point d'entrée systématiquement
// exécuté avant le rendu de n'importe quelle route de cette arborescence.
//
// ⚠️ Segment de chemin "/boutique" TEMPORAIRE : nécessaire tant qu'aucune
// boutique n'a de domaine réel branché (impossible d'avoir deux fichiers de
// route différents sur le même chemin littéral "/" — celui-ci coexiste avec
// routes/index.tsx, l'accueil du marketplace Livroto). Une fois un vrai
// domaine pointé sur une boutique (ex. hugocollection.cd), il faudra un
// réécriture de chemin au niveau serveur (Nitro/H3, avant le routeur) pour
// que ce visiteur voie sa boutique à la racine "/" sans ce préfixe visible.
// Voir la checklist "nouvelle boutique" pour le suivi de ce point.
export const Route = createFileRoute("/boutique")({
  validateSearch: (search: Record<string, unknown>) => {
    const parsed: { boutique?: string } = {};
    if (typeof search.boutique === "string") parsed.boutique = search.boutique;
    return parsed;
  },
  beforeLoad: async ({ search }) => {
    const { boutique } = await resolveBoutiqueTenantFn({ data: { slug: search.boutique } });
    if (!boutique) throw notFound();
    return { boutique };
  },
  head: ({ match }) => {
    const boutique = (match.context as { boutique?: { nom: string; logo_url: string | null } }).boutique;
    if (!boutique) return {};
    // Le head() du root (__root.tsx) pose ~15 balises meta "Livroto" (og:*,
    // twitter:*, apple-mobile-web-app-title, author, publisher...). TanStack
    // Router fusionne les head() par clé (name/property) : une clé absente
    // ici laisse passer la version Livroto du parent. Il faut donc RÉÉCRIRE
    // explicitement CHAQUE clé du root qui mentionne Livroto — un sous-
    // ensemble partiel a été testé en dev et laissait fuiter twitter:title,
    // twitter:description et apple-mobile-web-app-title. Voir la checklist
    // "nouvelle boutique" : toute clé ajoutée au head() du root DOIT être
    // dupliquée ici.
    const description = `Boutique en ligne ${boutique.nom}`;
    return {
      meta: [
        { title: boutique.nom },
        { name: "description", content: description },
        { property: "og:title", content: boutique.nom },
        { property: "og:description", content: description },
        { property: "og:site_name", content: boutique.nom },
        { property: "og:type", content: "website" },
        ...(boutique.logo_url ? [{ property: "og:image", content: boutique.logo_url }] : []),
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: boutique.nom },
        { name: "twitter:description", content: description },
        ...(boutique.logo_url ? [{ name: "twitter:image", content: boutique.logo_url }] : []),
        { name: "apple-mobile-web-app-title", content: boutique.nom },
        { name: "author", content: boutique.nom },
        { name: "publisher", content: boutique.nom },
      ],
      // Les <link rel="icon"> du root (favicon-32.png, icon-192.png Livroto)
      // sont CONCATÉNÉS, pas remplacés (contrairement aux meta, fusionnées par
      // clé name/property) — et le navigateur préfère l'icône dont `sizes`
      // correspond le mieux. Sans nos propres entrées sizes=32x32/192x192,
      // l'onglet d'une boutique affichait le favicon Livroto (fuite de marque
      // repérée en inspectant le HTML réel). On émet donc les mêmes tailles,
      // déclarées après celles du parent -> le navigateur retient les nôtres.
      links: boutique.logo_url
        ? [
            { rel: "icon", sizes: "32x32", href: boutique.logo_url },
            { rel: "icon", sizes: "192x192", href: boutique.logo_url },
            { rel: "icon", href: boutique.logo_url },
            { rel: "apple-touch-icon", href: boutique.logo_url },
          ]
        : [],
    };
  },
  component: BoutiqueLayout,
  notFoundComponent: BoutiqueIntrouvable,
});

function BoutiqueIntrouvable() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">Boutique introuvable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cette adresse ne correspond à aucune boutique active.
      </p>
    </div>
  );
}

// Applique la marque de la boutique (boutiques.theme = {primary, accent}) à
// TOUT l'espace boutique — vitrine ET admin. Un seul point d'injection ici
// (ancêtre commun de tout /boutique/*) suffit à reteinter toute l'UI — aucun
// composant individuel n'a besoin d'être touché. Sans thème configuré
// (`theme` vide), on ne pose aucune variable et le vert par défaut Livroto
// s'applique tel quel.
//
// ⚠️ Piège CSS découvert en testant dans un vrai navigateur (pas en lisant le
// code) : une custom property comme `--primary: var(--brand);` se RÉSOUT une
// seule fois, à l'endroit où elle est déclarée (ici :root dans styles.css),
// en utilisant la valeur de `--brand` DISPONIBLE À CET ENDROIT — puis c'est
// cette valeur déjà résolue qui est héritée par les descendants. Redéfinir
// seulement `--brand` sur un <div> plus bas dans l'arbre ne change donc RIEN
// à `--primary`/`--secondary`/`--accent`/`--ring` (déjà figés en vert au
// niveau de :root) : `--brand` lui-même reste bien la nouvelle couleur pour
// qui l'utilise directement (`.bg-hero-gradient`, `.shadow-brand`, la
// sélection de texte), mais tous les boutons `bg-primary` restaient verts.
// Il faut donc redéfinir explicitement CHAQUE token consommé par les
// utilitaires Tailwind (`--primary`, `--secondary`, `--accent`, `--ring`...),
// pas seulement la source `--brand` dont ils dérivent d'habitude.
function stylesMarqueBoutique(theme: unknown): CSSProperties | undefined {
  if (!theme || typeof theme !== "object") return undefined;
  const { primary, accent } = theme as { primary?: unknown; accent?: unknown };
  if (typeof primary !== "string" && typeof accent !== "string") return undefined;

  const style: Record<string, string> = {};
  if (typeof primary === "string") {
    const fonce = `color-mix(in oklch, ${primary}, black 35%)`;
    const clair = `color-mix(in oklch, ${primary}, white 88%)`;
    style["--brand"] = primary;
    style["--brand-dark"] = fonce;
    style["--brand-light"] = clair;
    style["--primary"] = primary;
    style["--ring"] = primary;
    style["--secondary"] = clair;
    style["--secondary-foreground"] = fonce;
    style["--accent"] = clair;
    style["--accent-foreground"] = fonce;
  }
  if (typeof accent === "string") style["--amber"] = accent;
  return style as CSSProperties;
}

function BoutiqueLayout() {
  const { boutique } = Route.useRouteContext();
  return (
    <BoutiqueProvider boutique={boutique}>
      {/* Le panier doit englober TOUT ce que /boutique/* rend via <Outlet/> —
          y compris les pages elles-mêmes (index.tsx, panier.tsx), qui
          appellent useBoutiqueCart() à leur propre niveau, pas seulement
          dans un layout qu'elles rendraient comme enfant. Le provider doit
          donc être ICI (ancêtre commun), pas dans BoutiqueSiteLayout : sinon
          une page qui fait `useBoutiqueCart()` puis `<BoutiqueSiteLayout>`
          se trouve hors de son propre provider, qui n'existe que DANS le
          layout qu'elle rend comme enfant — React lève alors une erreur au
          rendu serveur (repéré via un vrai test dans le navigateur, pas
          juste à la lecture du code : le SSR basculait silencieusement en
          rendu client seul).
      */}
      <div className="contents" style={stylesMarqueBoutique(boutique.theme)}>
        <BoutiqueCartProvider boutiqueId={boutique.id}>
          <Outlet />
        </BoutiqueCartProvider>
      </div>
    </BoutiqueProvider>
  );
}
