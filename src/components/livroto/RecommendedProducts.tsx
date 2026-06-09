import { useQuery } from "@tanstack/react-query";
import { Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getViewedIds } from "@/lib/recently-viewed";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";

const SELECT = "id,name,description,price_usd,stock,emoji,image_url,vendor_id,rating_avg,rating_count";

function normalize(rows: any[] | null): DisplayProduct[] {
  return (rows ?? []).map((p) => ({
    ...p,
    price_usd: Number(p.price_usd),
    rating_avg: p.rating_avg ? Number(p.rating_avg) : 0,
    rating_count: p.rating_count ?? 0,
  })) as DisplayProduct[];
}

/**
 * Recommandations anti-cul-de-sac (réflexe Amazon) : « vu récemment » si dispo,
 * sinon les produits populaires. Utilisé sur le panier vide.
 */
export function RecommendedProducts({ limit = 4 }: { limit?: number }) {
  const { data } = useQuery({
    queryKey: ["recommended-products", limit],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const viewed = getViewedIds();
      if (viewed.length > 0) {
        const { data: rows } = await supabase
          .from("products")
          .select(SELECT)
          .eq("approved", true)
          .gt("stock", 0)
          .in("id", viewed);
        // Conserver l'ordre « plus récent d'abord »
        const byId = new Map(normalize(rows).map((p) => [p.id, p]));
        const ordered = viewed.map((id) => byId.get(id)).filter(Boolean) as DisplayProduct[];
        if (ordered.length > 0) {
          return { mode: "recent" as const, products: ordered.slice(0, limit) };
        }
      }
      const { data: rows } = await supabase
        .from("products")
        .select(SELECT)
        .eq("approved", true)
        .gt("stock", 0)
        .order("rating_count", { ascending: false })
        .limit(limit);
      return { mode: "popular" as const, products: normalize(rows) };
    },
  });

  if (!data || data.products.length === 0) return null;
  const recent = data.mode === "recent";

  return (
    <section className="mt-12 text-left">
      <div className="mb-4 flex items-center gap-2">
        {recent ? (
          <Clock className="h-5 w-5 text-[color:var(--brand-dark)]" />
        ) : (
          <TrendingUp className="h-5 w-5 text-[color:var(--brand-dark)]" />
        )}
        <h2 className="font-display text-xl font-bold">
          {recent ? "Reprends où tu t'étais arrêté" : "Populaires à Bunia"}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
