// ============================================================================
// Suivi de commande — module boutique générique (/shop-order/$orderId).
// Sous `_authenticated` comme orders.$orderId.tsx côté marketplace natif :
// même exigence de connexion pour voir sa commande.
// ============================================================================
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, Loader2, MessageCircle, Store, MapPin, Navigation, Star } from "lucide-react";
import { ShopSiteLayout } from "@/components/shops/ShopSiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getMyShopOrder, customerUpdateShopOrderLocation } from "@/lib/shops/orders.functions";
import { customerLeaveShopReview } from "@/lib/shops/reviews.functions";
import { captureGeolocation, classifyGeoError, googleMapsUrl } from "@/lib/geolocation";

export const Route = createFileRoute("/_authenticated/shop-order/$orderId")({
  component: ShopOrderTrackingPage,
});

const STATUS_FLOW = ["pending", "confirmed", "preparing", "ready", "picked_up", "delivered"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "Reçue", confirmed: "Confirmée", preparing: "En préparation",
  ready: "Prête", picked_up: "En livraison", delivered: "Livrée", cancelled: "Annulée",
};
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash à la livraison", mpesa: "M-Pesa", airtel_money: "Airtel Money", orange_money: "Orange Money",
};

function ShopOrderTrackingPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const fetchOrder = useServerFn(getMyShopOrder);
  const updateLocation = useServerFn(customerUpdateShopOrderLocation);
  const { data, isLoading } = useQuery({
    queryKey: ["shop-order-detail", orderId],
    queryFn: () => fetchOrder({ data: { order_id: orderId } }),
  });
  const [geoBusy, setGeoBusy] = useState(false);

  const shareLocation = async () => {
    setGeoBusy(true);
    try {
      const pos = await captureGeolocation();
      await updateLocation({ data: { order_id: orderId, lat: pos.lat, lng: pos.lng } });
      toast.success("Position partagée");
      qc.invalidateQueries({ queryKey: ["shop-order-detail", orderId] });
    } catch (e: any) {
      const kind = classifyGeoError(e);
      toast.error(
        kind === "denied" ? "Autorisation refusée — active la localisation dans les réglages du navigateur."
          : kind === "unsupported" ? "Géolocalisation non disponible sur cet appareil."
          : "Impossible d'obtenir ta position, réessaie.",
      );
    } finally { setGeoBusy(false); }
  };

  useEffect(() => {
    const channel = supabase
      .channel(`shop-order-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_orders", filter: `id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ["shop-order-detail", orderId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  if (isLoading) {
    return (
      <ShopSiteLayout shop={null}>
        <div className="container mx-auto px-4 py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </ShopSiteLayout>
    );
  }
  if (!data?.order) return null;
  const order: any = data.order;
  const items: any[] = order.items ?? [];
  const history: any[] = order.history ?? [];
  const shop = order.shop ?? {};
  const currentIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <ShopSiteLayout shop={shop.slug ? shop : null}>
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted overflow-hidden">
              {shop.logo_url ? <img src={shop.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">{shop.name}</h1>
              <p className="text-sm text-muted-foreground">Commande #{order.code ?? order.id.slice(0, 6)}</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5">
            {order.status === "picked_up" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            {STATUS_LABEL[order.status] ?? order.status}
          </Badge>
        </div>

        {order.status !== "cancelled" && (
          <div className="mt-6 rounded-2xl border bg-card p-5">
            <h2 className="font-display font-semibold">Suivi</h2>
            <ol className="mt-4 space-y-3">
              {STATUS_FLOW.map((s, i) => {
                const done = i <= currentIdx;
                const h = history.find((x: any) => x.status === s);
                return (
                  <li key={s} className="flex items-center gap-3">
                    <div className={`grid h-7 w-7 place-items-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>{STATUS_LABEL[s]}</p>
                      {h && <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("fr-FR")}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display font-semibold">Articles</h2>
          <ul className="mt-3 divide-y">
            {items.map((it: any) => (
              <li key={it.id} className="flex items-center justify-between py-3 text-sm">
                <span>{it.product_name} × {it.quantity}{it.notes ? <span className="block text-xs italic text-muted-foreground">"{it.notes}"</span> : null}</span>
                <span className="font-medium">${Number(it.line_total_usd).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Sous-total</span><span>${Number(order.subtotal_usd ?? 0).toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Livraison</span><span>${Number(order.delivery_fee ?? 0).toFixed(2)}</span></div>
            <div className="flex justify-between font-display text-base font-bold"><span>Total</span><span>${Number(order.total_usd).toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground pt-1">
              <span>Paiement</span>
              <span>
                {PAYMENT_LABEL[order.payment_method] ?? order.payment_method} ·{" "}
                {order.payment_status === "paid"
                  ? "Payé ✅"
                  : Number(order.paid_usd ?? 0) > 0
                    ? `Acompte $${Number(order.paid_usd).toFixed(2)} — reste $${(Number(order.total_usd) - Number(order.paid_usd)).toFixed(2)}`
                    : "En attente"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display font-semibold">Livraison</h2>
          <p className="mt-2 text-sm">{order.customer_name} · {order.customer_phone}</p>
          <p className="text-sm text-muted-foreground">{order.zone_name} · {order.customer_address}</p>
          {order.customer_notes && <p className="mt-2 text-sm italic text-muted-foreground">"{order.customer_notes}"</p>}
          {order.customer_lat != null && order.customer_lng != null && (
            <a href={googleMapsUrl(order.customer_lat, order.customer_lng)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--primary)] hover:underline">
              <MapPin className="h-4 w-4" /> Voir la position GPS partagée
            </a>
          )}
          {order.status !== "delivered" && order.status !== "cancelled" && (
            <Button size="sm" variant="outline" onClick={shareLocation} disabled={geoBusy} className="mt-3">
              {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              {geoBusy ? "Localisation…" : order.customer_lat != null ? "Actualiser ma position" : "Partager ma position GPS"}
            </Button>
          )}
        </div>

        {order.status === "delivered" && (
          <ReviewSection orderId={order.id} shopId={order.shop_id} existingReview={order.review} />
        )}

        {shop.whatsapp_display && (
          <div className="mt-6">
            <Button asChild variant="outline">
              <a href={`https://wa.me/${String(shop.whatsapp_display).replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Bonjour, je vous écris pour ma commande #${order.code ?? order.id.slice(0, 6)}.`)}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Contacter la boutique
              </a>
            </Button>
          </div>
        )}
      </div>
    </ShopSiteLayout>
  );
}

function ReviewSection({ orderId, shopId, existingReview }: { orderId: string; shopId: string; existingReview: { rating: number; comment: string | null } | { rating: number; comment: string | null }[] | null }) {
  const qc = useQueryClient();
  const submitReview = useServerFn(customerLeaveShopReview);
  const review = Array.isArray(existingReview) ? existingReview[0] : existingReview;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (review) {
    return (
      <div className="mt-6 rounded-2xl border bg-card p-5">
        <h2 className="font-display font-semibold">Ton avis</h2>
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`h-4 w-4 ${i < review.rating ? "fill-[color:var(--primary)] text-[color:var(--primary)]" : "text-muted-foreground"}`} />
          ))}
        </div>
        {review.comment && <p className="mt-2 text-sm text-muted-foreground">"{review.comment}"</p>}
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await submitReview({ data: { order_id: orderId, shop_id: shopId, rating, comment: comment.trim() || undefined } });
      toast.success("Merci pour ton avis !");
      qc.invalidateQueries({ queryKey: ["shop-order-detail", orderId] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="mt-6 rounded-2xl border bg-card p-5">
      <h2 className="font-display font-semibold">Laisse un avis sur cette boutique</h2>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)}>
              <Star className={`h-7 w-7 ${n <= rating ? "fill-[color:var(--primary)] text-[color:var(--primary)]" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <Textarea placeholder="Ton commentaire (optionnel)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer mon avis"}</Button>
      </form>
    </div>
  );
}
