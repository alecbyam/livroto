import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, PackageSearch, Search, Share2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoutiqueSiteLayout } from "@/components/boutiques/BoutiqueSiteLayout";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";
import { getPrixEffectif } from "@/lib/boutiques/prix-promo";
import { estNouveau, stockBas } from "@/lib/boutiques/produit-affichage";
import { urlProduit, whatsAppCommanderProduitUrl } from "@/lib/boutiques/whatsapp-links";

// Web Share API si disponible (Android/iOS/desktop récents) sinon copie du
// lien dans le presse-papiers — jamais d'échec silencieux, l'utilisateur a
// toujours un retour (partage natif OU confirmation de copie).
async function partagerProduit(url: string, texte: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: texte, url });
    } catch {
      // Annulé par l'utilisateur (bouton retour de la feuille de partage) —
      // ce n'est pas une erreur à signaler.
    }
    return;
  }
  await navigator.clipboard.writeText(url);
  toast.success("Lien de l'article copié !");
}

export const Route = createFileRoute("/boutique/")({
  component: BoutiqueAccueil,
});

type Produit = {
  id: string;
  nom: string;
  prix_usd: number;
  prix_promo_usd: number | null;
  promo_actif: boolean | null;
  promo_debut: string | null;
  promo_fin: string | null;
  image_url: string | null;
  categorie_id: string | null;
  taille: string | null;
  couleur: string | null;
  quantite: number;
  created_at: string;
  sous_categories: { nom: string } | null;
  boutique_categories: { nom: string; icone: string | null } | null;
};

function BoutiqueAccueil() {
  const boutique = useBoutique();
  const { ajouter } = useBoutiqueCart();
  const [categorieId, setCategorieId] = useState<string>("tous");
  const [recherche, setRecherche] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["boutique-categories-public", boutique.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boutique_categories")
        .select("id,nom,icone")
        .eq("boutique_id", boutique.id)
        .eq("actif", true)
        .order("nom", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["boutique-produits", boutique.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select(
          "id,nom,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,image_url,categorie_id,taille,couleur,quantite,created_at,sous_categories(nom),boutique_categories(nom,icone)",
        )
        .eq("boutique_id", boutique.id)
        .eq("actif", true)
        .gt("quantite", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Produit[];
    },
  });
  const produits = data ?? [];

  const compteParCategorie = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of produits) {
      if (p.categorie_id) m.set(p.categorie_id, (m.get(p.categorie_id) ?? 0) + 1);
    }
    return m;
  }, [produits]);

  const produitsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return produits.filter((p) => {
      if (categorieId !== "tous" && p.categorie_id !== categorieId) return false;
      if (!q) return true;
      return (
        p.nom.toLowerCase().includes(q) ||
        p.sous_categories?.nom.toLowerCase().includes(q) ||
        p.couleur?.toLowerCase().includes(q)
      );
    });
  }, [produits, categorieId, recherche]);

  return (
    <BoutiqueSiteLayout>
      <section className="border-b bg-gradient-to-b from-muted/60 to-background">
        <div className="container mx-auto px-4 py-10 text-center">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{boutique.nom}</h1>
          {boutique.slogan && (
            <p className="mt-1 text-sm italic text-muted-foreground">{boutique.slogan}</p>
          )}
          {boutique.adresse && (
            <p className="mt-2 text-sm text-muted-foreground">{boutique.adresse}</p>
          )}
          {!isLoading && produits.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {produits.length} article{produits.length > 1 ? "s" : ""} en ligne
            </p>
          )}
        </div>
      </section>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un article..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setCategorieId("tous")}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                categorieId === "tous"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              Tout
            </button>
            {(categories ?? [])
              .filter((c) => (compteParCategorie.get(c.id) ?? 0) > 0)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategorieId(c.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    categorieId === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c.icone ? `${c.icone} ` : ""}
                  {c.nom}
                  <span className={categorieId === c.id ? "opacity-80" : "text-muted-foreground/70"}>
                    {" "}
                    · {compteParCategorie.get(c.id)}
                  </span>
                </button>
              ))}
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : produitsFiltres.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {produits.length === 0
                ? "Aucun article en ligne pour le moment."
                : "Aucun article ne correspond à ta recherche."}
            </p>
            {produits.length > 0 && (recherche || categorieId !== "tous") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRecherche("");
                  setCategorieId("tous");
                }}
              >
                Réinitialiser les filtres
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {produitsFiltres.map((p) => {
              const promo = getPrixEffectif(p);
              return (
                <div
                  key={p.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-md hover:-translate-y-0.5"
                >
                  <Link to="/boutique/produit" search={{ boutique: boutique.slug, produit: p.id }}>
                    <div className="relative aspect-square w-full bg-muted">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.nom}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : p.boutique_categories?.icone ? (
                        <div className="grid h-full w-full place-items-center text-4xl">
                          {p.boutique_categories.icone}
                        </div>
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <Tag className="h-10 w-10 text-muted-foreground/50" />
                        </div>
                      )}
                      {promo.enPromo && (
                        <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground shadow-sm">
                          −{promo.pourcentage}%
                        </span>
                      )}
                      {!promo.enPromo && estNouveau(p.created_at) && (
                        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm">
                          Nouveau
                        </span>
                      )}
                      {stockBas(p.quantite) && (
                        <span className="absolute bottom-2 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                          Plus que {p.quantite} !
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 p-3 pb-0">
                      <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:underline">{p.nom}</p>
                      {(p.sous_categories?.nom || p.taille || p.couleur) && (
                        <p className="text-xs text-muted-foreground">
                          {[p.sous_categories?.nom, p.taille, p.couleur].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="flex flex-col gap-0.5 pt-1">
                        {promo.enPromo ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="font-display text-base font-bold text-destructive">
                                {promo.prix} $
                              </span>
                              <span className="text-sm text-muted-foreground line-through">
                                {promo.prixOriginal} $
                              </span>
                            </div>
                            <span className="text-[11px] font-medium text-destructive">
                              Vous économisez {promo.economie.toFixed(2)} $
                            </span>
                          </>
                        ) : (
                          <span className="font-display text-base font-bold">{p.prix_usd} $</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex flex-1 flex-col gap-1 p-3 pt-2">
                    <Button
                      size="sm"
                      className="mt-1 w-full"
                      onClick={() =>
                        ajouter({
                          produit_id: p.id,
                          nom: p.nom,
                          prix_usd: promo.prix,
                          prix_original_usd: promo.enPromo ? promo.prixOriginal : null,
                          image_url: p.image_url,
                        })
                      }
                    >
                      Ajouter au panier
                    </Button>
                    <div className="mt-1 flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 px-2 text-xs"
                        onClick={() =>
                          partagerProduit(urlProduit(boutique.slug, p.id), `${p.nom} — ${promo.prix} $ chez ${boutique.nom}`)
                        }
                      >
                        <Share2 className="h-3.5 w-3.5" /> Partager
                      </Button>
                      {boutique.telephone && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1 border-green-600/40 px-2 text-xs text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
                        >
                          <a
                            href={whatsAppCommanderProduitUrl({
                              telephoneBoutique: boutique.telephone,
                              boutiqueNom: boutique.nom,
                              nom: p.nom,
                              prixUsd: promo.prix,
                              url: urlProduit(boutique.slug, p.id),
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Commander
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BoutiqueSiteLayout>
  );
}
