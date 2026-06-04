import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites } from "@/lib/favorites";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Mes favoris — Livroto Bunia" },
      { name: "description", content: "Retrouve tes produits favoris sur Livroto, la marketplace locale de Bunia." },
      { property: "og:title", content: "Mes favoris — Livroto" },
      { property: "og:description", content: "Tes produits préférés à portée de clic." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { ids, ready } = useFavorites();
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (ids.size === 0) { setProducts([]); setLoading(false); return; }
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id,name,description,price_usd,stock,emoji,image_url,vendor_id,rating_avg,rating_count")
        .in("id", Array.from(ids));
      if (cancel) return;
      setProducts((data ?? []).map((p: any) => ({
        ...p, price_usd: Number(p.price_usd),
        rating_avg: p.rating_avg ? Number(p.rating_avg) : 0,
        rating_count: p.rating_count ?? 0,
      })));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [ids, ready]);

  return (
    <SiteLayout>
      <section className="container mx-auto px-4 pt-10 md:pt-14">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-500">
            <Heart className="h-6 w-6 fill-current" />
          </div>
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">Mes favoris</h1>
            <p className="text-muted-foreground text-sm">Tes produits préférés, prêts à commander.</p>
          </div>
        </div>
      </section>
      <section className="container mx-auto px-4 mt-8 mb-12">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="text-muted-foreground">Aucun favori pour le moment.</p>
            <Button asChild className="mt-4"><Link to="/catalog">Découvrir le catalogue</Link></Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}