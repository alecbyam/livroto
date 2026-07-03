import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, ShoppingCart, Star, Store, Loader2, MessageCircle, Zap, AlertTriangle, ShieldCheck, Minus, Plus, X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useFavorite } from "@/lib/favorites";
import { recordView } from "@/lib/recently-viewed";
import { toast } from "sonner";
import { ReportDialog } from "@/components/livroto/ReportDialog";
import { ShareButton } from "@/components/livroto/ShareButton";
import { getPromo } from "@/lib/promo";
import { PRODUCT_DETAIL_SELECT, PRODUCT_LIST_SELECT } from "@/lib/products";

export const Route = createFileRoute("/product/$productId")({
  component: ProductPage,
  head: ({ params }) => ({
    meta: [
      { title: `Produit ${params.productId.slice(0, 6)} — Livroto Bunia` },
      { name: "description", content: "Découvre ce produit sur Livroto, livré à ta porte à Bunia. Paiement cash à la livraison." },
    ],
  }),
});

type Product = {
  id: string; name: string; description: string | null; price_usd: number;
  emoji: string | null; image_url: string | null; images: string[] | null; vendor_id: string | null; stock: number;
  category: string; subcategory_id: string | null; rating_avg: number | null; rating_count: number | null;
  promo_price_usd: number | null; promo_active: boolean | null; promo_approved: boolean | null;
  promo_starts_at: string | null; promo_ends_at: string | null;
};
type Vendor = { id: string; shop_name: string; slug: string; whatsapp: string | null; logo_url: string | null; rating_avg: number | null; rating_count: number | null; status: string | null };
type Review = { id: string; rating: number; comment: string | null; created_at: string; author_id: string };

function ProductPage() {
  const { productId } = Route.useParams();
  const { add } = useCart();
  const { isFav, toggle } = useFavorite(productId);
  const [product, setProduct] = useState<Product | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [qty, setQty] = useState(1);
  const [lightbox, setLightbox] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const { data: p } = await supabase
        .from("products")
        .select(PRODUCT_DETAIL_SELECT)
        .eq("id", productId).eq("approved", true).maybeSingle();
      if (cancel) return;
      setProduct(p as any);
      setActiveImg(0);
      if (p) recordView(p.id);
      if (p?.vendor_id) {
        supabase.from("vendors").select("id,shop_name,slug,whatsapp,logo_url,rating_avg,rating_count,status")
          .eq("owner_id", p.vendor_id).maybeSingle()
          .then(({ data }) => !cancel && setVendor(data as any));
      }
      supabase.from("reviews").select("id,rating,comment,created_at,author_id")
        .eq("product_id", productId).order("created_at", { ascending: false }).limit(10)
        .then(({ data }) => !cancel && setReviews((data ?? []) as any));
      if (p?.category) {
        const { data: rel } = await supabase
          .from("products")
          .select(PRODUCT_LIST_SELECT)
          .eq("approved", true).eq("category", p.category).neq("id", productId).limit(8);
        if (!cancel) setRelated((rel ?? []).map((r: any) => ({
          ...r, price_usd: Number(r.price_usd),
          rating_avg: r.rating_avg ? Number(r.rating_avg) : 0,
          rating_count: r.rating_count ?? 0,
        })));
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [productId]);

  useEffect(() => {
    if (product?.name && typeof document !== "undefined") {
      document.title = `${product.name} — Livroto Bunia`;
    }
  }, [product?.name]);

  // Lightbox : fermeture par touche Échap
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // IntersectionObserver: show sticky bar when main CTA leaves viewport
  useEffect(() => {
    if (!ctaRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(ctaRef.current);
    return () => obs.disconnect();
  }, [product]);

  if (loading) {
    return <SiteLayout><div className="container mx-auto px-4 py-20 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></SiteLayout>;
  }
  if (!product) {
    return <SiteLayout><div className="container mx-auto px-4 py-20 text-center"><p className="text-muted-foreground">Produit introuvable.</p><Button asChild className="mt-4"><Link to="/catalog">Retour au catalogue</Link></Button></div></SiteLayout>;
  }

  const out = product.stock === 0;
  const promo = getPromo(product);
  const rating = Number(product.rating_avg ?? 0);
  const reviewCount = Number(product.rating_count ?? 0);
  const gallery = (product.images && product.images.length > 0)
    ? product.images
    : (product.image_url ? [product.image_url] : []);
  const mainImg = gallery[activeImg] ?? gallery[0] ?? null;

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.image_url ? [product.image_url] : undefined,
    sku: product.id,
    brand: vendor ? { "@type": "Brand", name: vendor.shop_name } : undefined,
    aggregateRating: reviewCount > 0 ? {
      "@type": "AggregateRating",
      ratingValue: rating.toFixed(1),
      reviewCount,
    } : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: promo.price.toFixed(2),
      availability: out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      areaServed: "Bunia, Ituri, RDC",
    },
  };

  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container mx-auto px-4 pt-6">
        <Link to="/catalog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
      </div>
      <section className="container mx-auto px-4 mt-4 grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-3xl border bg-[color:var(--brand-light)] aspect-square grid place-items-center text-9xl">
            {mainImg
              ? (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="group h-full w-full cursor-zoom-in"
                  aria-label="Agrandir la photo"
                >
                  <img src={mainImg} alt={product.name} className="h-full w-full object-cover" />
                  <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition group-hover:scale-110">
                    <ZoomIn className="h-4 w-4" />
                  </span>
                </button>
              )
              : <span>{product.emoji ?? "📦"}</span>}
            {out && <Badge variant="destructive" className="absolute top-3 left-3">Rupture</Badge>}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImg(idx)}
                  className={`shrink-0 h-16 w-16 overflow-hidden rounded-lg border-2 transition ${idx === activeImg ? "border-primary" : "border-border hover:border-primary/50"}`}
                  aria-label={`Photo ${idx + 1}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <h1 className="font-display text-3xl md:text-4xl font-bold">{product.name}</h1>
          {reviewCount > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <div className="flex items-center gap-0.5">
                {[1,2,3,4,5].map((i) => (
                  <Star key={i} className={`h-4 w-4 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                ))}
              </div>
              <span className="font-semibold">{rating.toFixed(1)}</span>
              <span className="text-muted-foreground">· {reviewCount} avis</span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <span className="font-display text-4xl font-bold text-[color:var(--brand-dark)]">${promo.price.toFixed(2)}</span>
            {promo.active && (
              <>
                <span className="text-xl text-muted-foreground line-through">${promo.original.toFixed(2)}</span>
                <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-bold text-white">−{promo.percent}%</span>
              </>
            )}
          </div>
          {promo.active && (
            <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
              💰 Vous économisez ${promo.saving.toFixed(2)}
            </div>
          )}

          {/* Stock urgency */}
          {!out && product.stock > 0 && product.stock <= 3 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              🔴 Plus que {product.stock} en stock — commande vite !
            </div>
          )}
          {!out && product.stock > 3 && product.stock <= 7 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2 text-sm font-semibold text-orange-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              ⚡ Stock limité — {product.stock} articles restants
            </div>
          )}

          <p className="mt-4 text-muted-foreground whitespace-pre-line">{product.description ?? "Pas de description fournie."}</p>

          {!out && (
            <div className="mt-5 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Quantité</span>
              <div className="inline-flex items-center rounded-xl border border-border">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
                  className="grid h-10 w-10 place-items-center disabled:opacity-40" aria-label="Diminuer la quantité">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center font-display font-bold">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(product.stock || 99, q + 1))} disabled={qty >= (product.stock || 99)}
                  className="grid h-10 w-10 place-items-center disabled:opacity-40" aria-label="Augmenter la quantité">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {product.stock > 0 && product.stock <= 10 && (
                <span className="text-xs text-muted-foreground">{product.stock} dispo</span>
              )}
            </div>
          )}

          <div ref={ctaRef} className="mt-6 flex flex-wrap gap-2">
            <Button size="lg" disabled={out} onClick={() => {
              add({ id: product.id, name: product.name, price_usd: promo.price, original_price_usd: promo.active ? promo.original : null, emoji: product.emoji, image_url: product.image_url, vendor_id: product.vendor_id, stock: product.stock }, qty);
              toast.success(`${qty} × ${product.name} ajouté${qty > 1 ? "s" : ""} au panier`);
            }}>
              <ShoppingCart className="h-5 w-5" /> Ajouter au panier
            </Button>
            <Button asChild size="lg" variant="outline" disabled={out}>
              <Link to="/order/$productId" params={{ productId: product.id }}>Commander vite</Link>
            </Button>
            <Button size="lg" variant="ghost" onClick={toggle}>
              <Heart className={`h-5 w-5 ${isFav ? "fill-rose-500 text-rose-500" : ""}`} />
              {isFav ? "Favori" : "Ajouter aux favoris"}
            </Button>
            <ShareButton
              productId={product.id}
              name={product.name}
              price={`$${Number(product.price_usd).toFixed(2)}`}
            />
            <ReportDialog targetType="product" targetId={product.id} variant="ghost" />
          </div>

          {!out && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">💵 Paiement cash à la livraison</span>
              <span className="inline-flex items-center gap-1">🛵 Livreur local de Bunia</span>
              <span className="inline-flex items-center gap-1">🚫 Aucun frais caché</span>
            </div>
          )}

          {vendor && (
            <div className="mt-6 rounded-2xl border bg-card p-4 flex items-center gap-3">
              <Link to="/vendor/$slug" params={{ slug: vendor.slug }} className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--brand-light)] text-xl overflow-hidden shrink-0">
                {vendor.logo_url ? <img src={vendor.logo_url} alt={vendor.shop_name} className="h-full w-full rounded-full object-cover" /> : <Store className="h-5 w-5" />}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to="/vendor/$slug" params={{ slug: vendor.slug }} className="flex items-center gap-1.5 font-display font-bold hover:underline">
                  <span className="truncate">{vendor.shop_name}</span>
                  {vendor.status === "approved" && (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Vendeur vérifié" />
                  )}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {vendor.status === "approved" && <span className="font-medium text-emerald-600">Vendeur vérifié · </span>}
                  {Number(vendor.rating_avg ?? 0) > 0
                    ? <span><Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> {Number(vendor.rating_avg).toFixed(1)} · {vendor.rating_count} avis</span>
                    : "Nouveau vendeur"}
                </div>
              </div>
              {vendor.whatsapp && (
                <Button asChild variant="outline" size="sm">
                  <a href={`https://wa.me/${vendor.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="container mx-auto px-4 mt-12">
        <h2 className="font-display text-2xl font-bold">Avis clients</h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-muted-foreground">Pas encore d'avis. Sois le premier à donner ton avis après ta commande livrée.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map((i) => (
                    <Star key={i} className={`h-4 w-4 ${i <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className="container mx-auto px-4 mt-12 mb-12">
          <h2 className="font-display text-2xl font-bold">Produits similaires</h2>
          <div className="mt-4 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Sticky mobile CTA */}
      {!out && stickyVisible && (
        <div className="md:hidden fixed bottom-[60px] inset-x-0 z-30 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-t border-border shadow-lg animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm truncate">{product.name}</p>
              <p className="text-[color:var(--brand-dark)] font-bold">
                ${promo.price.toFixed(2)}
                {promo.active && <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">${promo.original.toFixed(2)}</span>}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                add({ id: product.id, name: product.name, price_usd: promo.price, original_price_usd: promo.active ? promo.original : null, emoji: product.emoji, image_url: product.image_url, vendor_id: product.vendor_id, stock: product.stock });
                toast.success(`${product.name} ajouté !`);
              }}
              className="shrink-0 min-h-[44px]"
            >
              <ShoppingCart className="h-4 w-4" />
            </Button>
            <Button asChild size="sm" className="shrink-0 min-h-[44px] bg-[color:var(--brand-dark)]">
              <Link to="/order/$productId" params={{ productId: product.id }}>
                <Zap className="h-4 w-4 mr-1" /> Commander
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Lightbox plein écran */}
      {lightbox && mainImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo en plein écran"
        >
          <button type="button" aria-label="Fermer" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-6 w-6" />
          </button>
          {gallery.length > 1 && (
            <>
              <button type="button" aria-label="Photo précédente"
                onClick={(e) => { e.stopPropagation(); setActiveImg((i) => (i - 1 + gallery.length) % gallery.length); }}
                className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 md:left-6">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" aria-label="Photo suivante"
                onClick={(e) => { e.stopPropagation(); setActiveImg((i) => (i + 1) % gallery.length); }}
                className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 md:right-6">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <img
            src={mainImg}
            alt={product.name}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {gallery.length > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
              {activeImg + 1} / {gallery.length}
            </div>
          )}
        </div>
      )}
    </SiteLayout>
  );
}