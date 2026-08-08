// ============================================================================
// Vitrine publique d'une boutique du module générique (ex: /shop/muungano).
// Lecture directe via le client anon (RLS `status = 'approved'`), même
// principe que vendor.$slug.tsx côté marketplace natif — pas de server
// function nécessaire pour l'affichage public.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Store, MessageCircle, Plus, Minus, ShoppingBag, X } from "lucide-react";
import { ShopSiteLayout } from "@/components/shops/ShopSiteLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useShopCart } from "@/lib/shops/cart";
import { createShopOrder } from "@/lib/shops/orders.functions";
import { ShopFlexPayDialog } from "@/components/shops/ShopFlexPayDialog";
import { ShopInstallPWA } from "@/components/shops/ShopInstallPWA";
import { useShopPwaBranding } from "@/lib/shops/usePwaBranding";

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

type Shop = {
  id: string; slug: string; name: string; description: string | null;
  logo_url: string | null; cover_url: string | null; whatsapp_display: string | null;
  config: Record<string, any>;
};
type Section = { id: string; name: string; sort_order: number };
type Product = {
  id: string; menu_section_id: string | null; name: string; description: string | null;
  price_usd: number; image_url: string | null; is_available: boolean;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash à la livraison",
  mpesa: "M-Pesa (Vodacom)",
  airtel_money: "Airtel Money",
  orange_money: "Orange Money",
};

function ShopStorefrontPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("shops")
        .select("id,slug,name,description,logo_url,cover_url,whatsapp_display,config")
        .eq("slug", slug).eq("status", "approved").maybeSingle();
      if (cancelled) return;
      if (!s) { setNotFoundState(true); setLoading(false); return; }
      setShop(s as Shop);

      const [{ data: secs }, { data: prods }] = await Promise.all([
        supabase.from("shop_menu_sections").select("id,name,sort_order").eq("shop_id", s.id).eq("active", true).order("sort_order"),
        supabase.from("shop_products").select("id,menu_section_id,name,description,price_usd,image_url,is_available").eq("shop_id", s.id).order("sort_order"),
      ]);
      if (cancelled) return;
      setSections(secs ?? []);
      setProducts((prods ?? []).map((p: any) => ({ ...p, price_usd: Number(p.price_usd) })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const cart = useShopCart(shop?.id ?? "no-shop");
  useShopPwaBranding(shop); // rend la boutique installable avec son propre nom/icône

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

  return (
    <ShopSiteLayout shop={shop}>
      <div className="relative h-40 sm:h-52 w-full overflow-hidden bg-gradient-to-br from-[color:var(--brand-dark)] to-[color:var(--brand-light)]">
        {shop.cover_url && <img src={shop.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
      </div>

      <section className="container mx-auto px-4 -mt-10 relative z-10">
        <div className="rounded-2xl border bg-card p-5 shadow-sm flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-[color:var(--brand-light)] overflow-hidden border-4 border-card -mt-10 shrink-0">
            {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" /> : <Store className="h-8 w-8" />}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-bold truncate">{shop.name}</h1>
            {shop.description && <p className="mt-1 text-sm text-muted-foreground max-w-xl">{shop.description}</p>}
          </div>
          {shop.whatsapp_display && (
            <Button asChild variant="outline">
              <a href={`https://wa.me/${shop.whatsapp_display.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Contacter
              </a>
            </Button>
          )}
        </div>
      </section>

      <section className="container mx-auto px-4 mt-8 mb-28">
        {products.length === 0 ? (
          <p className="mt-6 text-center text-muted-foreground">Le menu n'est pas encore disponible.</p>
        ) : (
          <div className="space-y-8">
            {sections.filter((s) => grouped.has(s.id)).map((s) => (
              <div key={s.id}>
                <h2 className="font-display text-xl font-bold">{s.name}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped.get(s.id)!.map((p) => (
                    <ProductTile key={p.id} product={p} onAdd={(qty) => cart.add({ id: p.id, name: p.name, price_usd: p.price_usd, image_url: p.image_url }, qty)} />
                  ))}
                </div>
              </div>
            ))}
            {grouped.has("__none__") && (
              <div>
                <h2 className="font-display text-xl font-bold">Autres articles</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped.get("__none__")!.map((p) => (
                    <ProductTile key={p.id} product={p} onAdd={(qty) => cart.add({ id: p.id, name: p.name, price_usd: p.price_usd, image_url: p.image_url }, qty)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          <a href={`/shop/${slug}/connexion`} className="hover:underline">Espace équipe {shop.name}</a>
        </p>
      </section>

      {cart.count > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-[color:var(--primary)] px-5 py-3 text-[color:var(--primary-foreground)] shadow-lg"
        >
          <ShoppingBag className="h-5 w-5" />
          <span className="font-medium">{cart.count} article{cart.count > 1 ? "s" : ""}</span>
          <span className="font-display font-bold">${cart.subtotal.toFixed(2)}</span>
        </button>
      )}

      <ShopCartSheet shop={shop} cart={cart} open={cartOpen} onOpenChange={setCartOpen} onOrdered={(orderId) => navigate({ to: "/shop-order/$orderId", params: { orderId } })} />
      {cart.count === 0 && <ShopInstallPWA shopId={shop.id} shopName={shop.name} />}
    </ShopSiteLayout>
  );
}

function ProductTile({ product, onAdd }: { product: Product; onAdd: (qty: number) => void }) {
  return (
    <div className={`flex gap-3 rounded-2xl border bg-card p-3 ${!product.is_available ? "opacity-60" : ""}`}>
      <div className="h-16 w-16 shrink-0 rounded-xl bg-muted overflow-hidden grid place-items-center">
        {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{product.name}</p>
        {product.description && <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>}
        <div className="mt-1 flex items-center justify-between">
          <span className="font-display font-bold">${product.price_usd.toFixed(2)}</span>
          {product.is_available ? (
            <Button size="sm" variant="outline" onClick={() => onAdd(1)}><Plus className="h-4 w-4" /></Button>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Rupture</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function ShopCartSheet({
  shop, cart, open, onOpenChange, onOrdered,
}: {
  shop: Shop; cart: ReturnType<typeof useShopCart>; open: boolean; onOpenChange: (o: boolean) => void; onOrdered: (orderId: string) => void;
}) {
  const submit = useServerFn(createShopOrder);
  const [step, setStep] = useState<"cart" | "form">("cart");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", address: "", notes: "", payment: "cash" as "cash" | "mpesa" | "airtel_money" | "orange_money",
  });
  const [payDialog, setPayDialog] = useState<{ orderId: string; amount: number } | null>(null);

  const onCheckout = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
      toast.error("Nom, téléphone et adresse sont requis."); return;
    }
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      toast.message("Connecte-toi pour valider ta commande — ton panier est conservé.");
      onOpenChange(false);
      window.location.href = `/shop/${shop.slug}/connexion`;
      return;
    }
    setBusy(true);
    try {
      const res = await submit({
        data: {
          shop_id: shop.id,
          items: cart.items.map((i) => ({ product_id: i.id, quantity: i.qty })),
          zone_id: null,
          customer_name: form.name.trim(),
          customer_phone: form.phone.trim(),
          customer_address: form.address.trim(),
          payment_method: form.payment,
          customer_notes: form.notes.trim() || null,
        },
      });
      toast.success(`Commande envoyée ${res.code ? `(${res.code})` : ""} !`);
      cart.clear();
      if (form.payment !== "cash") {
        // Le paiement mobile money se déclenche APRÈS la création (même flux que le
        // marketplace natif) : la commande existe déjà en attente de paiement.
        setPayDialog({ orderId: res.orderId, amount: res.total });
      } else {
        onOpenChange(false);
        onOrdered(res.orderId);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Impossible d'envoyer la commande.");
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setStep("cart"); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{step === "cart" ? `Panier — ${shop.name}` : "Livraison & paiement"}</SheetTitle>
        </SheetHeader>

        {step === "cart" ? (
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {cart.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ton panier est vide.</p>
            ) : cart.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border p-2">
                <div className="h-12 w-12 shrink-0 rounded-lg bg-muted overflow-hidden grid place-items-center">
                  {it.image_url ? <img src={it.image_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.name}</p>
                  <p className="text-xs text-muted-foreground">${it.price_usd.toFixed(2)} × {it.qty}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.setQty(it.id, it.qty - 1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-5 text-center text-sm">{it.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.setQty(it.id, it.qty + 1)}><Plus className="h-3 w-3" /></Button>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => cart.remove(it.id)}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            <div><Label className="text-xs">Nom complet</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09xxxxxxxx" className="mt-1" /></div>
            <div><Label className="text-xs">Adresse / repère</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Note pour la boutique (optionnel)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Ex : sans oignon, sonner au portail bleu..." /></div>
            <div>
              <Label className="text-xs">Paiement</Label>
              <RadioGroup value={form.payment} onValueChange={(v) => setForm({ ...form, payment: v as any })} className="mt-2 space-y-2">
                {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2 rounded-xl border p-2.5">
                    <RadioGroupItem value={k} id={`pay-${k}`} />
                    <Label htmlFor={`pay-${k}`} className="cursor-pointer font-normal">{label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        <SheetFooter className="border-t pt-3">
          <div className="w-full space-y-3">
            <div className="flex justify-between font-display text-base font-bold">
              <span>Total</span><span>${cart.subtotal.toFixed(2)}</span>
            </div>
            {step === "cart" ? (
              <Button className="w-full" disabled={cart.items.length === 0} onClick={() => setStep("form")}>Continuer</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("cart")} disabled={busy}>Retour</Button>
                <Button className="flex-1" onClick={onCheckout} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer la commande"}
                </Button>
              </div>
            )}
          </div>
        </SheetFooter>
      </SheetContent>

      <ShopFlexPayDialog
        orderId={payDialog?.orderId ?? null}
        phone={form.phone}
        amountLabel={`$${(payDialog?.amount ?? 0).toFixed(2)}`}
        open={!!payDialog}
        onPaid={() => { const id = payDialog!.orderId; setPayDialog(null); onOpenChange(false); onOrdered(id); }}
        onClose={() => { const id = payDialog!.orderId; setPayDialog(null); onOpenChange(false); onOrdered(id); }}
      />
    </Sheet>
  );
}
