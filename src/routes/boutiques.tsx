import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, MapPin, Store, Package, X } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/boutiques")({
  head: () => ({
    meta: [
      { title: "Boutiques — Livroto Bunia" },
      { name: "description", content: "Découvre toutes les boutiques de Bunia sur Livroto : produits locaux, livraison à ta porte, paiement cash." },
      { property: "og:title", content: "Boutiques de Bunia — Livroto" },
      { property: "og:description", content: "Parcours les vendeurs locaux de Bunia et commande en quelques tapes." },
    ],
  }),
  component: BoutiquesPage,
});

type VendorCard = {
  id: string;
  slug: string;
  shop_name: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  rating_avg: number;
  rating_count: number;
  zones: string[];
  productCount: number;
};

type SortKey = "rating" | "products" | "name";

const EMPTY_VENDORS: VendorCard[] = [];

function BoutiquesPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");

  // Annuaire des boutiques mis en cache (react-query) -> retour instantané, moins de data.
  const { data: vendors = EMPTY_VENDORS, isLoading: loading } = useQuery({
    queryKey: ["boutiques-data"],
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<VendorCard[]> => {
      const [{ data: vRows }, { data: zoneRows }, { data: vzRows }, { data: prodRows }] = await Promise.all([
        supabase
          .from("vendors")
          .select("id,owner_id,slug,shop_name,description,logo_url,cover_url,rating_avg,rating_count,base_zone_id")
          .eq("status", "approved"),
        supabase.from("zones").select("id,name").eq("active", true),
        supabase.from("vendor_zones").select("vendor_id,zone_id"),
        supabase.from("products").select("vendor_id").eq("approved", true),
      ]);

      const zoneName = new Map<string, string>((zoneRows ?? []).map((z: any) => [z.id, z.name]));
      const zonesByVendorRowId = new Map<string, Set<string>>();
      (vzRows ?? []).forEach((vz: any) => {
        const set = zonesByVendorRowId.get(vz.vendor_id) ?? new Set<string>();
        set.add(vz.zone_id);
        zonesByVendorRowId.set(vz.vendor_id, set);
      });
      // products.vendor_id = owner_id du vendeur
      const countByOwner = new Map<string, number>();
      (prodRows ?? []).forEach((p: any) => {
        if (!p.vendor_id) return;
        countByOwner.set(p.vendor_id, (countByOwner.get(p.vendor_id) ?? 0) + 1);
      });

      return (vRows ?? []).map((v: any) => {
        const zoneIds = new Set<string>(zonesByVendorRowId.get(v.id) ?? []);
        if (v.base_zone_id) zoneIds.add(v.base_zone_id);
        const zones = Array.from(zoneIds).map((id) => zoneName.get(id)).filter(Boolean) as string[];
        return {
          id: v.id,
          slug: v.slug,
          shop_name: v.shop_name ?? "",
          description: v.description ?? null,
          logo_url: v.logo_url ?? null,
          cover_url: v.cover_url ?? null,
          rating_avg: v.rating_avg ? Number(v.rating_avg) : 0,
          rating_count: v.rating_count ?? 0,
          zones,
          productCount: countByOwner.get(v.owner_id) ?? 0,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = vendors.filter((v) => {
      if (!needle) return true;
      const hay = `${v.shop_name} ${v.description ?? ""} ${v.zones.join(" ")}`.toLowerCase();
      return hay.includes(needle);
    });
    const sorted = [...list];
    switch (sort) {
      case "products": sorted.sort((a, b) => b.productCount - a.productCount); break;
      case "name": sorted.sort((a, b) => a.shop_name.localeCompare(b.shop_name)); break;
      default:
        // Mieux notés d'abord ; à note égale, le plus de produits
        sorted.sort((a, b) =>
          b.rating_avg - a.rating_avg || b.rating_count - a.rating_count || b.productCount - a.productCount);
        break;
    }
    return sorted;
  }, [vendors, q, sort]);

  return (
    <SiteLayout>
      <section className="container mx-auto px-4 pt-10 md:pt-14">
        <h1 className="font-display text-3xl md:text-5xl font-bold">Boutiques de Bunia</h1>
        <p className="mt-2 text-muted-foreground">Découvre les vendeurs locaux. Commande, Livroto arrive. 🛵</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une boutique ou un quartier…"
              className="pl-9 pr-10 min-h-[48px]"
            />
            {q && (
              <button
                type="button"
                aria-label="Effacer"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium min-h-[48px]"
            aria-label="Trier les boutiques"
          >
            <option value="rating">Mieux notées</option>
            <option value="products">Plus de produits</option>
            <option value="name">Ordre alphabétique</option>
          </select>
          <span className="text-xs text-muted-foreground sm:ml-1">
            {filtered.length} boutique{filtered.length > 1 ? "s" : ""}
          </span>
        </div>
      </section>

      <section className="container mx-auto px-4 mt-8 mb-16">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="skeleton h-24" />
                <div className="space-y-2 p-4 pt-7">
                  <div className="skeleton h-5 w-2/3 rounded" />
                  <div className="skeleton h-4 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            {vendors.length === 0
              ? "Aucune boutique active pour le moment. Reviens bientôt !"
              : "Aucune boutique ne correspond à ta recherche."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((v, i) => (
              <Link
                key={v.id}
                to="/vendor/$slug"
                params={{ slug: v.slug }}
                className="group animate-fade-up overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              >
                {/* Cover */}
                <div className="relative h-24 overflow-hidden bg-gradient-to-br from-[color:var(--brand-dark)] to-[color:var(--brand-light)]">
                  {v.cover_url && (
                    <img src={v.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  )}
                </div>
                <div className="px-4 pb-4">
                  {/* Logo overlapping */}
                  <div className="grid h-14 w-14 -mt-7 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-[color:var(--brand-light)] text-xl shadow-sm">
                    {v.logo_url
                      ? <img src={v.logo_url} alt={v.shop_name} className="h-full w-full object-cover" />
                      : <Store className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <h2 className="mt-2 font-display text-lg font-bold leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                    {v.shop_name}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {v.rating_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-foreground">{v.rating_avg.toFixed(1)}</span>
                        <span>· {v.rating_count} avis</span>
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Nouveau</Badge>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" /> {v.productCount} produit{v.productCount > 1 ? "s" : ""}
                    </span>
                  </div>
                  {v.zones.length > 0 && (
                    <p className="mt-1.5 inline-flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{v.zones.join(" · ")}</span>
                    </p>
                  )}
                  {v.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{v.description}</p>
                  )}
                  <span className="mt-3 inline-block text-sm font-semibold text-[color:var(--brand-dark)] group-hover:underline">
                    Voir la boutique →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
