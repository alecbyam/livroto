import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoutiqueSiteLayout } from "@/components/boutiques/BoutiqueSiteLayout";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";

export const Route = createFileRoute("/boutique/")({
  component: BoutiqueAccueil,
});

type Produit = {
  id: string;
  nom: string;
  prix_usd: number;
  image_url: string | null;
  categorie_id: string | null;
  taille: string | null;
  couleur: string | null;
  quantite: number;
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
        .select("id,nom,prix_usd,image_url,categorie_id,taille,couleur,quantite,sous_categories(nom),boutique_categories(nom,icone)")
        .eq("boutique_id", boutique.id)
        .eq("actif", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Produit[];
    },
  });
  const produits = data ?? [];

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
          {boutique.adresse && (
            <p className="mt-2 text-sm text-muted-foreground">{boutique.adresse}</p>
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
            {(categories ?? []).map((c) => (
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
          <p className="mt-16 text-center text-sm text-muted-foreground">
            {produits.length === 0
              ? "Aucun article en ligne pour le moment."
              : "Aucun article ne correspond."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {produitsFiltres.map((p) => {
              const enRupture = p.quantite <= 0;
              return (
                <div
                  key={p.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-md"
                >
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
                    {enRupture && (
                      <span className="absolute inset-x-0 top-0 bg-foreground/80 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-background">
                        Rupture de stock
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{p.nom}</p>
                    {(p.sous_categories?.nom || p.taille || p.couleur) && (
                      <p className="text-xs text-muted-foreground">
                        {[p.sous_categories?.nom, p.taille, p.couleur].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="font-display text-base font-bold">{p.prix_usd} $</span>
                    </div>
                    <Button
                      size="sm"
                      className="mt-1 w-full"
                      disabled={enRupture}
                      onClick={() =>
                        ajouter({
                          produit_id: p.id,
                          nom: p.nom,
                          prix_usd: p.prix_usd,
                          image_url: p.image_url,
                        })
                      }
                    >
                      {enRupture ? "Indisponible" : "Ajouter au panier"}
                    </Button>
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
