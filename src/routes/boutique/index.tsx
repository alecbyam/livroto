import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BoutiqueSiteLayout } from "@/components/boutiques/BoutiqueSiteLayout";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";

export const Route = createFileRoute("/boutique/")({
  component: BoutiqueAccueil,
});

function BoutiqueAccueil() {
  const boutique = useBoutique();
  const { ajouter } = useBoutiqueCart();
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-produits", boutique.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("id,nom,prix_usd,image_url,categorie,taille,couleur")
        .eq("boutique_id", boutique.id)
        .eq("actif", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <BoutiqueSiteLayout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">{boutique.nom}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Catalogue</p>

        {isLoading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {(data ?? []).map((p) => (
              <div key={p.id} className="rounded-xl border p-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.nom} className="aspect-square w-full rounded-lg object-cover" />
                ) : (
                  <div className="aspect-square w-full rounded-lg bg-muted" />
                )}
                <p className="mt-2 text-sm font-medium">{p.nom}</p>
                <p className="text-sm text-muted-foreground">{p.prix_usd} $</p>
                <Button
                  size="sm" variant="outline" className="mt-2 w-full"
                  onClick={() => ajouter({ produit_id: p.id, nom: p.nom, prix_usd: p.prix_usd, image_url: p.image_url })}
                >
                  Ajouter au panier
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </BoutiqueSiteLayout>
  );
}
