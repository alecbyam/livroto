import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MapPin, MessageCircle, Star, Store, ShieldCheck } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ReportDialog } from "@/components/livroto/ReportDialog";
import { PRODUCT_LIST_SELECT } from "@/lib/products";

export const Route = createFileRoute("/vendor/$slug")({
  component: VendorPublicPage,
  head: ({ params }) => ({
    meta: [
      { title: `Boutique ${params.slug} — JuntoxShop Bunia` },
      { name: "description", content: `Découvre les produits de ${params.slug} sur JuntoxShop, livrés à Bunia.` },
    ],
  }),
  errorComponent: ({ error }) => (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 text-center">
        <p role="alert" className="text-destructive">Erreur : {error.message}</p>
      </div>
    </SiteLayout>
  ),
  notFoundComponent: () => (
    <SiteLayout>
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Boutique introuvable</h1>
        <p className="mt-2 text-muted-foreground">Cette boutique n'existe pas ou n'est plus active.</p>
      </div>
    </SiteLayout>
  ),
  // SSR du 1er écran (audit perf du 10/08/2026, même principe que index.tsx/
  // catalog.tsx/product.$productId.tsx) : plus de spinner client au 1er
  // affichage, le HTML envoyé contient déjà la boutique + ses produits. Le
  // "not found" est tranché ici (au lieu d'un état local après coup) — plus
  // idiomatique avec TanStack Router et évite un flash de contenu vide.
  loader: async ({ params }): Promise<{ vendor: Vendor; products: DisplayProduct[]; zones: string[] }> => {
    const { data: v } = await supabase
      .from("vendors")
      .select("id,shop_name,slug,description,whatsapp,logo_url,cover_url,rating_avg,rating_count,status")
      .eq("slug", params.slug)
      .eq("status", "approved")
      .maybeSingle();
    if (!v) throw notFound();

    const [{ data: prods }, { data: zs }] = await Promise.all([
      supabase.from("products").select(PRODUCT_LIST_SELECT).eq("vendor_id", v.id).eq("approved", true).order("created_at", { ascending: false }),
      supabase.from("vendor_zones").select("zones(name)").eq("vendor_id", v.id),
    ]);
    const products = (prods ?? []).map((p: any) => ({
      ...p, price_usd: Number(p.price_usd),
      rating_avg: p.rating_avg ? Number(p.rating_avg) : 0,
      rating_count: p.rating_count ?? 0,
    })) as DisplayProduct[];
    const zones = (zs ?? []).map((z: any) => z.zones?.name).filter(Boolean) as string[];

    return { vendor: v as Vendor, products, zones };
  },
});

type Vendor = {
  id: string;
  shop_name: string;
  slug: string;
  description: string | null;
  whatsapp: string | null;
  logo_url: string | null;
  cover_url: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  status: string;
};

function VendorPublicPage() {
  // Le composant ne rend que si le loader a résolu avec succès (notFound()/
  // erreur sont gérés par notFoundComponent/errorComponent, pas ici) — le
  // typage générique de useLoaderData() reste prudent, la donnée est garantie.
  const { vendor, products, zones } = Route.useLoaderData() as { vendor: Vendor; products: DisplayProduct[]; zones: string[] };

  if (typeof document !== "undefined") {
    document.title = `${vendor.shop_name} — JuntoxShop Bunia`;
  }

  const rating = Number(vendor.rating_avg ?? 0);
  const reviewCount = Number(vendor.rating_count ?? 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: vendor.shop_name,
    description: vendor.description ?? undefined,
    image: vendor.logo_url ?? undefined,
    address: { "@type": "PostalAddress", addressLocality: "Bunia", addressRegion: "Ituri", addressCountry: "CD" },
    aggregateRating: reviewCount > 0 ? {
      "@type": "AggregateRating",
      ratingValue: rating.toFixed(1),
      reviewCount,
    } : undefined,
    areaServed: zones.length > 0 ? zones.join(", ") : "Bunia",
  };

  return (
    <SiteLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Cover */}
      <div className="relative h-44 sm:h-56 w-full overflow-hidden bg-gradient-to-br from-[color:var(--brand-dark)] to-[color:var(--brand-light)]">
        {vendor.cover_url && (
          <img src={vendor.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        )}
      </div>

      <section className="container mx-auto px-4 -mt-12 relative z-10">
        <div className="rounded-2xl border bg-card p-5 shadow-sm flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-[color:var(--brand-light)] text-3xl border-4 border-card -mt-10 shrink-0 overflow-hidden">
            {vendor.logo_url
              ? <img src={vendor.logo_url} alt={vendor.shop_name} className="h-full w-full object-cover" />
              : <Store className="h-8 w-8" />}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="flex items-center gap-2 font-display text-2xl sm:text-3xl font-bold">
              <span className="truncate">{vendor.shop_name}</span>
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Vendeur vérifié" />
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" /> Vendeur vérifié
              </span>
              {reviewCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
                  <span>· {reviewCount} avis</span>
                </span>
              ) : (
                <span>Nouveau vendeur</span>
              )}
              {zones.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {zones.join(", ")}
                </span>
              )}
              <Badge variant="outline">{products.length} produit{products.length > 1 ? "s" : ""}</Badge>
            </div>
          </div>
          {vendor.whatsapp && (
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/${vendor.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Bonjour ${vendor.shop_name}, je viens de JuntoxShop.`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="h-4 w-4" /> Contacter
              </a>
            </Button>
          )}
          <ReportDialog targetType="vendor" targetId={vendor.id} variant="ghost" />
        </div>

        {vendor.description && (
          <p className="mt-4 text-muted-foreground max-w-3xl">{vendor.description}</p>
        )}
      </section>

      <section className="container mx-auto px-4 mt-10 mb-16">
        <h2 className="font-display text-2xl font-bold">Produits</h2>
        {products.length === 0 ? (
          <p className="mt-4 text-muted-foreground">Aucun produit disponible pour le moment.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} verified />
            ))}
          </div>
        )}
        <div className="mt-10 text-center">
          <Button asChild variant="outline">
            <Link to="/catalog">← Retour au catalogue</Link>
          </Button>
        </div>
      </section>
    </SiteLayout>
  );
}
