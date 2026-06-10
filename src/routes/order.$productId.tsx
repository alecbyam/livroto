import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { getPromo } from "@/lib/promo";
import { buildOrderWhatsAppUrl } from "@/lib/whatsapp";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyOrderCreated } from "@/lib/notifications.functions";

type Zone = { id: string; name: string; delivery_fee_usd: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price_usd: number;
  emoji: string | null;
  image_url: string | null;
  vendor_id: string | null;
  stock: number;
  promo_price_usd: number | null;
  promo_active: boolean | null;
  promo_approved: boolean | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
};

export const Route = createFileRoute("/order/$productId")({
  head: () => ({
    meta: [
      { title: "Finaliser la commande — Livroto" },
      { name: "description", content: "Confirme ta commande Livroto à Bunia : adresse, zone de livraison et paiement cash à la porte." },
      { property: "og:title", content: "Commande — Livroto" },
      { property: "og:description", content: "Paiement cash à la livraison via WhatsApp." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { productId } = Route.useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const notify = useServerFn(notifyOrderCreated);
  const [product, setProduct] = useState<Product | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "airtel_money" | "orange_money">("cash");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [{ data: p }, { data: z }] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,description,price_usd,emoji,image_url,vendor_id,stock,promo_price_usd,promo_active,promo_approved,promo_starts_at,promo_ends_at")
          .eq("id", productId)
          .maybeSingle(),
        supabase.from("zones").select("id,name,delivery_fee_usd").eq("active", true).order("name"),
      ]);
      if (cancel) return;
      if (p) {
        setProduct({ ...p, price_usd: Number(p.price_usd) });
      }
      if (z) {
        const zs = z.map((zz) => ({ ...zz, delivery_fee_usd: Number(zz.delivery_fee_usd) }));
        setZones(zs);
        if (zs[0]) setZoneId(zs[0].id);
      }
      // prefill from profile if logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("name,phone,zone")
          .eq("id", session.user.id)
          .maybeSingle();
        if (prof) {
          if (prof.name) setName(prof.name);
          if (prof.phone) setPhone(prof.phone);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-20 grid place-items-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </SiteLayout>
    );
  }

  if (!product) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">{t("order.notFound")}</h1>
          <Button asChild className="mt-6"><Link to="/catalog">← {t("nav.catalog")}</Link></Button>
        </div>
      </SiteLayout>
    );
  }

  const selectedZone = zones.find((z) => z.id === zoneId);
  const zoneName = selectedZone?.name ?? "";
  const promo = getPromo(product);
  const subtotal = promo.price * qty;
  const total = subtotal;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !address) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Connectez-vous pour passer commande");
        navigate({ to: "/auth" });
        return;
      }
      const { data: orderRow, error } = await supabase
        .from("orders")
        .insert({
          customer_id: session.user.id,
          customer_name: name,
          customer_phone: phone,
          customer_address: address,
          zone: zoneName,
          zone_id: selectedZone?.id ?? null,
          product_id: product.id,
          vendor_id: product.vendor_id,
          quantity: qty,
          subtotal_usd: subtotal,
          total_usd: total,
          delivery_fee: 0,
          payment_method: paymentMethod,
          status: "pending",
        })
        .select("id,code")
        .single();
      if (error) throw error;
      // Insert line item (best-effort; not fatal if RLS rejects on edge cases)
      await supabase.from("order_items").insert({
        order_id: orderRow.id,
        product_id: product.id,
        vendor_id: product.vendor_id,
        product_name: product.name,
        unit_price_usd: promo.price,
        quantity: qty,
        line_total_usd: subtotal,
      });
      notify({ data: { order_id: orderRow.id } }).catch(() => {});
      toast.success(t("order.success"));
      const url = buildOrderWhatsAppUrl({
        productName: `${product.name} (#${orderRow.code ?? ""})`,
        quantity: qty,
        address,
        zone: zoneName,
        name,
      });
      window.open(url, "_blank");
      setTimeout(() => navigate({ to: "/orders" }), 800);
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/catalog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("nav.catalog")}
        </Link>

        <div className="mt-4 grid gap-6 md:grid-cols-[1fr,1.2fr]">
          {/* Product summary */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-[color:var(--brand-light)] text-7xl">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <span>{product.emoji ?? "📦"}</span>
              )}
            </div>
            <h2 className="mt-4 font-display text-xl font-bold">{product.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[color:var(--brand-dark)]">${promo.price.toFixed(2)}</span>
              {promo.active && (
                <>
                  <span className="text-base text-muted-foreground line-through">${promo.original.toFixed(2)}</span>
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">−{promo.percent}%</span>
                </>
              )}
            </p>
            {promo.active && (
              <p className="mt-1 text-sm font-bold text-emerald-700">💰 Vous économisez ${promo.saving.toFixed(2)}</p>
            )}
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <h1 className="font-display text-2xl font-bold">{t("order.title")}</h1>

            <div>
              <Label htmlFor="o-name">{t("order.name")}</Label>
              <Input id="o-name" required value={name} onChange={(e) => setName(e.target.value)}
                     className="mt-1.5 min-h-[48px]" />
            </div>
            <div>
              <Label htmlFor="o-phone">{t("order.phone")}</Label>
              <Input id="o-phone" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                     className="mt-1.5 min-h-[48px]" placeholder="+243 ..." />
            </div>
            <div>
              <Label htmlFor="o-addr">{t("order.address")}</Label>
              <Textarea id="o-addr" required value={address} onChange={(e) => setAddress(e.target.value)}
                        className="mt-1.5 min-h-[80px]" placeholder="Ex. Avenue Bunia, en face de la pharmacie..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="o-zone">{t("order.zone")}</Label>
                <Select value={zoneId} onValueChange={setZoneId}>
                  <SelectTrigger id="o-zone" className="mt-1.5 min-h-[48px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="o-qty">{t("order.quantity")}</Label>
                <Input id="o-qty" type="number" min={1} max={99} value={qty}
                       onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
                       className="mt-1.5 min-h-[48px]" />
              </div>
            </div>

            <div className="rounded-xl bg-[color:var(--brand-light)] p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span>{t("order.subtotal")}</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("order.delivery")}</span><span className="italic">à négocier</span>
              </div>
              <div className="flex justify-between font-display font-bold text-base pt-1 border-t border-[color:var(--brand-dark)]/15">
                <span>{t("order.total")}</span><span>${total.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Le frais de livraison se discute directement avec le livreur.
              </p>
            </div>

            <div>
              <Label>Mode de paiement</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {([
                  { id: "cash", label: "💵 Cash à la livraison", hint: "Paie en main propre" },
                  { id: "mpesa", label: "📱 M-Pesa", hint: "Vodacom" },
                  { id: "airtel_money", label: "📱 Airtel Money", hint: "Airtel" },
                  { id: "orange_money", label: "📱 Orange Money", hint: "Orange" },
                ] as const).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaymentMethod(p.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      paymentMethod === p.id
                        ? "border-[color:var(--brand-dark)] bg-[color:var(--brand-light)] ring-2 ring-[color:var(--brand-dark)]/30"
                        : "border-border hover:border-[color:var(--brand-dark)]/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground">{p.hint}</p>
                  </button>
                ))}
              </div>
              {paymentMethod !== "cash" && (
                <p className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Le vendeur te contactera sur WhatsApp pour confirmer le numéro de paiement mobile.
                </p>
              )}
            </div>

            <Button type="submit" size="lg" disabled={submitting}
                    className="w-full min-h-[52px] bg-[color:var(--whatsapp)] hover:brightness-105">
              <MessageCircle className="h-5 w-5" />
              {t("order.submit")}
            </Button>
          </form>
        </div>
      </div>
    </SiteLayout>
  );
}

