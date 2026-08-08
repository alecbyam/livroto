// ============================================================================
// Vitrine publique d'une boutique du module générique (ex: /shop/muungano) —
// design façon UberEats : bannière + badges, nav catégories sticky, grille de
// plats, fiche plat en modal, panier flottant (mobile) / sidebar (desktop).
// Lecture directe via le client anon (RLS `status = 'approved'`).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2, Store, MessageCircle, Plus, Minus, ShoppingBag, X, Star, Clock, Truck, ChevronRight,
} from "lucide-react";
import { ShopSiteLayout } from "@/components/shops/ShopSiteLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useShopCart } from "@/lib/shops/cart";
import { ShopFlexPayDialog } from "@/components/shops/ShopFlexPayDialog";
import { ShopCheckoutDialog } from "@/components/shops/ShopCheckoutDialog";
import { ProductDetailDialog, type ProductDetail } from "@/components/shops/ProductDetailDialog";
import { ShopInstallPWA } from "@/components/shops/ShopInstallPWA";
import { useShopPwaBranding } from "@/lib/shops/usePwaBranding";
import { computeOpenStatus, DAY_LABELS, ORDERED_DAY_KEYS, type ShopHours } from "@/lib/shops/hours";

export const Route = createFileRoute("/shop/$slug")({
  component: ShopStorefrontPage,
  notFoundComponent: () => (
    <ShopSiteLayout shop={null}>
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Boutique introuvable</h1>
        <p className="mt-2 text-muted-foreground">Cette boutique n'existe pas ou n'est plus active.</p>
      </div>
    </ShopSiteLayout>
  ),
});

type ShopConfig = {
  theme?: any;
  address?: string;
  hours?: ShopHours;
  delivery_eta_min?: number;
  delivery_eta_max?: number;
  delivery_fee_label?: string;
  partial_payment?: { enabled: boolean; percentages: number[] };
};
type Shop = {
  id: string; slug: string; name: string; description: string | null;
  logo_url: string | null; cover_url: string | null; whatsapp_display: string | null;
  rating_avg: number; rating_count: number; config: ShopConfig;
};
type Section = { id: string; name: string; sort_order: number };
type Product = ProductDetail & { menu_section_id: string | null; is_available: boolean };

function ShopStorefrontPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [payDialog, setPayDialog] = useState<{ orderId: string; amount: number; percent: number } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("shops")
        .select("id,slug,name,description,logo_url,cover_url,whatsapp_display,config,rating_avg,rating_count")
        .eq("slug", slug).eq("status", "approved").maybeSingle();
      if (cancelled) return;
      if (!s) { setNotFoundState(true); setLoading(false); return; }
      setShop(s as unknown as Shop);

      const [{ data: secs }, { data: prods }] = await Promise.all([
        supabase.from("shop_menu_sections").select("id,name,sort_order").eq("shop_id", s.id).eq("active", true).order("sort_order"),
        supabase
          .from("shop_products")
          .select("id,menu_section_id,name,description,price_usd,image_url,is_available,is_popular,is_new,options:shop_product_options(id,name,type,required,sort_order,choices:shop_product_option_choices(id,name,price_delta_usd,sort_order))")
          .eq("shop_id", s.id).order("sort_order"),
      ]);
      if (cancelled) return;
      setSections(secs ?? []);
      setProducts(
        (prods ?? []).map((p: any) => ({
          ...p,
          price_usd: Number(p.price_usd),
          options: (p.options ?? [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((o: any) => ({ ...o, choices: (o.choices ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => ({ ...c, price_delta_usd: Number(c.price_delta_usd) })) })),
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const cart = useShopCart(shop?.id ?? "no-shop");
  useShopPwaBranding(shop);

  const grouped = useMemo(() => {
    const bySection = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.menu_section_id ?? "__none__";
      const arr = bySection.get(key) ?? [];
      arr.push(p);
      bySection.set(key, arr);
    }
    return bySection;
  }, [products]);
  const popularProducts = useMemo(() => products.filter((p) => p.is_popular), [products]);

  const navSections = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (popularProducts.length > 0) list.push({ key: "populaires", label: "Populaires" });
    for (const s of sections) if (grouped.has(s.id)) list.push({ key: s.id, label: s.name });
    return list;
  }, [sections, grouped, popularProducts]);

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (navSections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveTab(visible[0].target.getAttribute("data-section-key") || "");
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: 0 },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [navSections]);

  const scrollToSection = (key: string) => {
    const el = sectionRefs.current.get(key);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveTab(key); }
  };

  if (loading) {
    return (
      <ShopSiteLayout shop={null}>
        <div className="container mx-auto px-4 py-16 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ShopSiteLayout>
    );
  }
  if (notFoundState || !shop) throw notFound();

  const openStatus = computeOpenStatus(shop.config?.hours);
  const eta = shop.config?.delivery_eta_min && shop.config?.delivery_eta_max
    ? `${shop.config.delivery_eta_min}-${shop.config.delivery_eta_max} min` : null;
  const feeLabel = shop.config?.delivery_fee_label ?? null;
  const partialPayment = shop.config?.partial_payment ?? { enabled: false, percentages: [100] };

  const addToCart = (payload: { cartLineId: string; name: string; price_usd: number; selectedChoiceIds: string[]; qty: number }, productId: string, image_url: string | null) => {
    cart.add({ cartLineId: payload.cartLineId, productId, name: payload.name, price_usd: payload.price_usd, image_url, selectedChoiceIds: payload.selectedChoiceIds }, payload.qty);
    toast.success("Ajouté au panier");
  };

  return (
    <ShopSiteLayout shop={shop}>
      {/* ---------- En-tête façon UberEats ---------- */}
      <div className="relative w-full aspect-[16/5] max-h-72 overflow-hidden bg-gradient-to-br from-[color:var(--brand-dark)] to-[color:var(--brand-light)]">
        {shop.cover_url && <img src={shop.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>

      <section className="container mx-auto px-4 -mt-9 relative z-10">
        <div className="flex items-end gap-4">
          <div className="grid h-20 w-20 sm:h-24 sm:w-24 shrink-0 place-items-center rounded-full overflow-hidden ring-4 ring-background bg-card shadow-lg">
            {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" /> : <Store className="h-8 w-8" />}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-bold">{shop.name}</h1>
            {shop.description && <p className="mt-1 text-sm text-muted-foreground max-w-xl">{shop.description}</p>}
          </div>
          {shop.whatsapp_display && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/${shop.whatsapp_display.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Contacter
              </a>
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {shop.rating_count > 0 && (
            <Badge variant="outline" className="gap-1"><Star className="h-3.5 w-3.5 fill-[color:var(--primary)] text-[color:var(--primary)]" />{Number(shop.rating_avg).toFixed(1)} ({shop.rating_count})</Badge>
          )}
          {eta && <Badge variant="outline" className="gap-1"><Clock className="h-3.5 w-3.5" />{eta}</Badge>}
          {feeLabel && <Badge variant="outline" className="gap-1"><Truck className="h-3.5 w-3.5" />{feeLabel}</Badge>}
          <Badge variant="outline" className={`gap-1.5 ${openStatus.isOpen ? "border-emerald-500/40 text-emerald-600" : "border-destructive/40 text-destructive"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${openStatus.isOpen ? "bg-emerald-500" : "bg-destructive"}`} />
            {openStatus.label}
          </Badge>
        </div>
      </section>

      {/* ---------- Nav catégories sticky ---------- */}
      {navSections.length > 0 && (
        <div className="sticky top-[52px] z-20 mt-5 border-b bg-background/95 backdrop-blur">
          <div className="container mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto no-scrollbar py-2">
              {navSections.map((s) => (
                <button
                  key={s.key}
                  onClick={() => scrollToSection(s.key)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === s.key ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start">
        {/* ---------- Colonne menu ---------- */}
        <div className="min-w-0">
          {products.length === 0 ? (
            <p className="mt-8 text-center text-muted-foreground">Le menu n'est pas encore disponible.</p>
          ) : (
            <div className="space-y-8 py-6">
              {popularProducts.length > 0 && (
                <div ref={(el) => { if (el) sectionRefs.current.set("populaires", el); }} data-section-key="populaires">
                  <h2 className="font-display text-xl font-bold">Populaires</h2>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {popularProducts.map((p) => (
                      <ProductTile key={p.id} product={p} onOpen={() => setSelectedProduct(p)} onQuickAdd={() => addToCart({ cartLineId: `${p.id}::`, name: p.name, price_usd: p.price_usd, selectedChoiceIds: [], qty: 1 }, p.id, p.image_url)} />
                    ))}
                  </div>
                </div>
              )}
              {sections.filter((s) => grouped.has(s.id)).map((s) => (
                <div key={s.id} ref={(el) => { if (el) sectionRefs.current.set(s.id, el); }} data-section-key={s.id}>
                  <h2 className="font-display text-xl font-bold">{s.name}</h2>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {grouped.get(s.id)!.map((p) => (
                      <ProductTile key={p.id} product={p} onOpen={() => setSelectedProduct(p)} onQuickAdd={() => addToCart({ cartLineId: `${p.id}::`, name: p.name, price_usd: p.price_usd, selectedChoiceIds: [], qty: 1 }, p.id, p.image_url)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- Infos boutique ---------- */}
          <Accordion type="single" collapsible className="mb-10 border-t pt-2">
            <AccordionItem value="infos">
              <AccordionTrigger className="font-display text-base font-bold">Infos & horaires</AccordionTrigger>
              <AccordionContent>
                {shop.config?.address && <p className="text-sm">{shop.config.address}</p>}
                <div className="mt-3 space-y-1 text-sm">
                  {ORDERED_DAY_KEYS.map((k) => {
                    const h = shop.config?.hours?.[k];
                    return (
                      <div key={k} className="flex justify-between text-muted-foreground">
                        <span>{DAY_LABELS[k]}</span>
                        <span>{h ? `${h.open} – ${h.close}` : "Fermé"}</span>
                      </div>
                    );
                  })}
                </div>
                {shop.rating_count > 0 && (
                  <p className="mt-3 flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-[color:var(--primary)] text-[color:var(--primary)]" />
                    <span className="font-semibold">{Number(shop.rating_avg).toFixed(1)}</span>
                    <span className="text-muted-foreground">· {shop.rating_count} avis</span>
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* ---------- Sidebar panier (desktop) ---------- */}
        <aside className="hidden lg:block sticky top-[110px] pb-6">
          <CartPanel cart={cart} onCheckout={() => setCheckoutOpen(true)} />
        </aside>
      </div>

      {/* ---------- Barre panier flottante (mobile) ---------- */}
      {cart.count > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 md:bottom-6 left-4 right-4 lg:hidden z-40 flex items-center justify-between gap-2 rounded-2xl bg-[color:var(--primary)] px-5 py-3.5 text-[color:var(--primary-foreground)] shadow-xl animate-in slide-in-from-bottom-2"
        >
          <span className="flex items-center gap-2 font-medium"><ShoppingBag className="h-5 w-5" />{cart.count} article{cart.count > 1 ? "s" : ""}</span>
          <span className="flex items-center gap-1 font-display font-bold">${cart.subtotal.toFixed(2)} <ChevronRight className="h-4 w-4" /></span>
        </button>
      )}

      {/* ---------- Panier mobile (sheet-like dialog plein écran bas) ---------- */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-card p-4 animate-in slide-in-from-bottom">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <CartPanel cart={cart} onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }} />
          </div>
        </div>
      )}

      <ProductDetailDialog
        product={selectedProduct}
        open={!!selectedProduct}
        onOpenChange={(o) => { if (!o) setSelectedProduct(null); }}
        onAdd={(payload) => addToCart(payload, selectedProduct!.id, selectedProduct!.image_url)}
      />

      <ShopCheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        shopId={shop.id}
        shopSlug={shop.slug}
        items={cart.items}
        subtotal={cart.subtotal}
        partialPayment={partialPayment}
        onOrdered={(orderId) => { cart.clear(); navigate({ to: "/shop-order/$orderId", params: { orderId } }); }}
        onNeedPayment={(p) => { cart.clear(); setPayDialog(p); }}
      />

      <ShopFlexPayDialog
        orderId={payDialog?.orderId ?? null}
        phone=""
        amountLabel={`$${(payDialog?.amount ?? 0).toFixed(2)}`}
        percent={payDialog?.percent ?? 100}
        open={!!payDialog}
        onPaid={() => { const id = payDialog!.orderId; setPayDialog(null); navigate({ to: "/shop-order/$orderId", params: { orderId: id } }); }}
        onClose={() => { const id = payDialog!.orderId; setPayDialog(null); navigate({ to: "/shop-order/$orderId", params: { orderId: id } }); }}
      />

      <p className="container mx-auto px-4 pb-6 text-center text-xs text-muted-foreground">
        <a href={`/shop/${slug}/connexion`} className="hover:underline">Espace équipe {shop.name}</a>
      </p>

      {cart.count === 0 && <ShopInstallPWA shopId={shop.id} shopName={shop.name} />}
    </ShopSiteLayout>
  );
}

function ProductTile({ product, onOpen, onQuickAdd }: { product: Product; onOpen: () => void; onQuickAdd: () => void }) {
  const hasOptions = product.options.length > 0;
  return (
    <div className={`group flex flex-col rounded-2xl border bg-card overflow-hidden text-left ${!product.is_available ? "opacity-60" : ""}`}>
      <button onClick={onOpen} className="block" disabled={!product.is_available}>
        <div className="relative aspect-square w-full bg-muted overflow-hidden">
          {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : <div className="grid h-full place-items-center"><Store className="h-6 w-6 text-muted-foreground" /></div>}
          {(product.is_popular || product.is_new) && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-[color:var(--primary)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--primary-foreground)]">
              {product.is_popular ? "Populaire" : "Nouveau"}
            </span>
          )}
          {!product.is_available && (
            <span className="absolute inset-0 grid place-items-center bg-background/70 text-xs font-semibold">Rupture</span>
          )}
        </div>
      </button>
      <div className="flex flex-1 flex-col p-2.5">
        <button onClick={onOpen} className="text-left flex-1" disabled={!product.is_available}>
          <p className="text-sm font-medium leading-snug line-clamp-2">{product.name}</p>
          {product.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{product.description}</p>}
        </button>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-display font-bold text-sm">${product.price_usd.toFixed(2)}</span>
          {product.is_available && (
            <button
              onClick={hasOptions ? onOpen : onQuickAdd}
              className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow"
              aria-label="Ajouter"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CartPanel({ cart, onCheckout }: { cart: ReturnType<typeof useShopCart>; onCheckout: () => void }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="font-display font-bold">Ton panier</h3>
      {cart.items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Ton panier est vide.</p>
      ) : (
        <div className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
          {cart.items.map((it) => (
            <div key={it.cartLineId} className="flex items-center gap-2 rounded-xl border p-2">
              <div className="h-11 w-11 shrink-0 rounded-lg bg-muted overflow-hidden grid place-items-center">
                {it.image_url ? <img src={it.image_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium line-clamp-2">{it.name}</p>
                <p className="text-[11px] text-muted-foreground">${it.price_usd.toFixed(2)} × {it.qty}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => cart.setQty(it.cartLineId, it.qty - 1)}><Minus className="h-3 w-3" /></Button>
                <span className="w-4 text-center text-xs">{it.qty}</span>
                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => cart.setQty(it.cartLineId, it.qty + 1)}><Plus className="h-3 w-3" /></Button>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => cart.remove(it.cartLineId)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-between border-t pt-3 font-display font-bold">
        <span>Total</span><span>${cart.subtotal.toFixed(2)}</span>
      </div>
      <Button className="mt-3 w-full" disabled={cart.items.length === 0} onClick={onCheckout}>Commander</Button>
    </div>
  );
}
