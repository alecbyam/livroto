import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, Clock, Loader2, MessageCircle, Phone, RotateCcw, Share2, Star, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getCustomerOrderDetail, customerCancelOrder, customerLeaveReview, getDeliveryTracking } from "@/lib/dashboard.functions";
import { LIVROTO_WHATSAPP } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderDetailPage,
});

const STATUS_FLOW = ["pending", "confirmed", "ready", "picked_up", "delivered"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmée", ready: "Prête",
  picked_up: "En route", delivered: "Livrée", cancelled: "Annulée",
};
const MM_LABEL: Record<string, string> = {
  mpesa: "M-Pesa (Vodacom)", airtel_money: "Airtel Money", orange_money: "Orange Money",
};

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getCustomerOrderDetail);
  const cancel = useServerFn(customerCancelOrder);
  const review = useServerFn(customerLeaveReview);
  const { data, isLoading } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchDetail({ data: { order_id: orderId } }),
  });

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Realtime : mise à jour du statut en direct
  useEffect(() => {
    const channel = supabase
      .channel(`order-${orderId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  if (isLoading) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-16 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SiteLayout>
    );
  }
  if (!data) return null;
  const { order, items, history, review: existingReview, rider, mobileMoney } = data as any;

  const navigate = useNavigate();
  const { add } = useCart();

  const reorder = async () => {
    const lines = (items as any[]).filter((it) => it.product_id);
    if (lines.length === 0) { toast.error("Aucun article à recommander"); return; }
    const { data: prods } = await supabase
      .from("products")
      .select("id,name,price_usd,emoji,image_url,vendor_id,stock,approved")
      .in("id", lines.map((it) => it.product_id));
    const byId = new Map((prods ?? []).map((p: any) => [p.id, p]));
    let added = 0, skipped = 0;
    for (const it of lines) {
      const p: any = byId.get(it.product_id);
      if (!p || !p.approved || (p.stock ?? 0) <= 0) { skipped++; continue; }
      add(
        { id: p.id, name: p.name, price_usd: Number(p.price_usd), emoji: p.emoji ?? null, image_url: p.image_url ?? null, vendor_id: p.vendor_id ?? null, stock: p.stock },
        Math.min(it.quantity ?? 1, p.stock),
      );
      added++;
    }
    if (added === 0) { toast.error("Ces produits ne sont plus disponibles."); return; }
    toast.success(`🔁 ${added} article${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} au panier${skipped > 0 ? ` · ${skipped} indisponible${skipped > 1 ? "s" : ""}` : ""}`);
    navigate({ to: "/cart" });
  };

  const onCancel = async () => {
    if (!confirm("Annuler cette commande ?")) return;
    setBusy(true);
    try {
      await cancel({ data: { order_id: orderId } });
      toast.success("Commande annulée");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const onReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await review({ data: { order_id: orderId, rating, comment, target: "product" } });
      toast.success("Merci pour ton avis !");
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const currentIdx = STATUS_FLOW.indexOf(order.status as any);

  return (
    <SiteLayout>
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Mes commandes
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">#{order.code ?? order.id.slice(0, 6)}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(order.created_at).toLocaleString("fr-FR")}
            </p>
          </div>
          <Badge variant="outline" className="text-sm">{STATUS_LABEL[order.status] ?? order.status}</Badge>
        </div>

        {/* Timeline */}
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

        {/* Items */}
        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display font-semibold">Articles</h2>
          <ul className="mt-3 divide-y">
            {items.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">qty {order.quantity}</li>
            )}
            {items.map((it: any) => (
              <li key={it.id} className="flex items-center justify-between py-3 text-sm">
                <span>{it.product_name} × {it.quantity}</span>
                <span className="font-medium">${Number(it.line_total_usd).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Sous-total</span><span>${Number(order.subtotal_usd ?? 0).toFixed(2)}</span></div>
            {Number(order.discount_usd) > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Code promo {order.coupon_code && <span className="font-semibold">{order.coupon_code}</span>}</span>
                <span>-${Number(order.discount_usd).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground"><span>Livraison</span><span className="italic">à négocier</span></div>
            <div className="flex justify-between font-display text-base font-bold"><span>Total produits</span><span>${Number(order.total_usd).toFixed(2)}</span></div>
          </div>
        </div>

        {/* Instructions Mobile Money */}
        {mobileMoney && (
          <div className="mt-6 rounded-2xl border-2 border-[color:var(--brand-dark)]/30 bg-[color:var(--brand-light)] p-5">
            <h2 className="font-display font-semibold flex items-center gap-2">
              📱 Paiement {MM_LABEL[mobileMoney.operator] ?? mobileMoney.operator}
            </h2>
            <p className="mt-2 text-sm">
              Envoie <span className="font-bold">${Number(order.total_usd).toFixed(2)}</span> au numéro :
            </p>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <div>
                <p className="font-display text-lg font-bold tracking-wide">{mobileMoney.number}</p>
                {mobileMoney.name && <p className="text-xs text-muted-foreground">{mobileMoney.name}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { navigator.clipboard?.writeText(mobileMoney.number); toast.success("Numéro copié"); }}
              >
                Copier
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Après le paiement, garde le SMS de confirmation — le livreur peut le demander.
            </p>
          </div>
        )}

        {/* Delivery info */}
        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display font-semibold">Livraison</h2>
          <p className="mt-2 text-sm">{order.customer_name} · {order.customer_phone}</p>
          <p className="text-sm text-muted-foreground">{order.zone} · {order.customer_address}</p>
          {order.customer_notes && <p className="mt-2 text-sm italic text-muted-foreground">"{order.customer_notes}"</p>}
          {order.customer_lat != null && order.customer_lng != null && (
            <a
              href={`https://maps.google.com/?q=${order.customer_lat},${order.customer_lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--brand-dark)] hover:underline"
            >
              📍 Position GPS partagée — voir sur la carte
            </a>
          )}
        </div>

        {/* Suivi en temps réel quand le livreur est en route */}
        {order.status === "picked_up" && (
          <DeliveryTracker orderId={order.id} custLat={order.customer_lat} custLng={order.customer_lng} />
        )}

        {/* Livreur assigné */}
        {order.rider_id && (
          <div className="mt-6 rounded-2xl border bg-card p-5">
            <h2 className="font-display font-semibold flex items-center gap-2">🛵 Ton livreur</h2>
            {rider ? (
              <>
                <p className="mt-2 text-sm">
                  <span className="font-medium">{rider.full_name}</span>
                  <span className="text-muted-foreground"> · {rider.vehicle}</span>
                </p>
                <p className="text-xs text-muted-foreground">{rider.whatsapp}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Appelle-le pour préciser ta position (repère, rue, maison).
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" className="bg-[color:var(--whatsapp)] hover:brightness-105 text-white">
                    <a
                      href={`https://wa.me/${String(rider.whatsapp).replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Bonjour, je suis ${order.customer_name} (commande Livroto #${order.code ?? order.id.slice(0, 6)}). Ma position : ${order.customer_address}, ${order.zone}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp livreur
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:${String(rider.whatsapp).replace(/[^\d+]/g, "")}`}>
                      <Phone className="h-4 w-4" /> Appeler
                    </a>
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Un livreur a pris en charge ta commande. Tu peux le contacter directement.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={reorder}>
            <RotateCcw className="h-4 w-4" /> Recommander
          </Button>
          {order.status === "pending" && (
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              <X className="h-4 w-4" /> Annuler la commande
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              const code = order.code ?? order.id.slice(0, 6);
              const lignes = items.length
                ? items.map((it: any) => `• ${it.product_name} ×${it.quantity} — $${Number(it.line_total_usd).toFixed(2)}`).join("\n")
                : `• Quantité : ${order.quantity}`;
              const recu =
                `🧾 *Reçu Livroto* — Commande #${code}\n` +
                `${new Date(order.created_at).toLocaleString("fr-FR")}\n\n` +
                `${lignes}\n` +
                (Number(order.discount_usd) > 0 ? `Réduction${order.coupon_code ? ` (${order.coupon_code})` : ""} : -$${Number(order.discount_usd).toFixed(2)}\n` : "") +
                `*Total produits : $${Number(order.total_usd).toFixed(2)}* — livraison à négocier\n` +
                `Paiement : ${order.payment_method ?? "cash"}\n` +
                `Statut : ${STATUS_LABEL[order.status] ?? order.status}\n` +
                `Livraison : ${order.customer_name}, ${order.zone} — ${order.customer_address}\n\n` +
                `Livroto Bunia 🛵 — Senda order yako !`;
              window.open(`https://wa.me/?text=${encodeURIComponent(recu)}`, "_blank");
            }}
          >
            <Share2 className="h-4 w-4" /> Partager le reçu
          </Button>
          <Button asChild variant="outline">
            <a href={`https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(`Bonjour Livroto, info sur ma commande #${order.code ?? order.id.slice(0, 6)}`)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Support Livroto
            </a>
          </Button>
        </div>

        {/* Review */}
        {order.status === "delivered" && (
          <div className="mt-6 rounded-2xl border bg-card p-5">
            <h2 className="font-display font-semibold">Laisser un avis</h2>
            {existingReview ? (
              <div className="mt-3 text-sm">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < existingReview.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                  ))}
                </div>
                {existingReview.comment && <p className="mt-2 text-muted-foreground">"{existingReview.comment}"</p>}
              </div>
            ) : (
              <form onSubmit={onReview} className="mt-3 space-y-3">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)}>
                      <Star className={`h-7 w-7 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
                <Textarea placeholder="Comment était le produit ?" value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button type="submit" disabled={busy}>Envoyer mon avis</Button>
              </form>
            )}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function DeliveryTracker({ orderId, custLat, custLng }: { orderId: string; custLat: number | null; custLng: number | null }) {
  const track = useServerFn(getDeliveryTracking);
  const { data } = useQuery({
    queryKey: ["delivery-track", orderId],
    queryFn: () => track({ data: { order_id: orderId } }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  if (!data?.ok) {
    return (
      <div className="mt-6 rounded-2xl border bg-card p-5">
        <h2 className="font-display font-semibold flex items-center gap-2">🛵 Suivi en direct</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {(data as any)?.reason === "no_location"
            ? "Le livreur n'a pas encore activé le partage de sa position. Contacte-le directement ci-dessous."
            : "Suivi en cours d'activation…"}
        </p>
      </div>
    );
  }

  const ageSec = Math.max(0, Math.round((Date.now() - new Date(data.updated_at as string).getTime()) / 1000));
  const ageLabel = ageSec < 60 ? `il y a ${ageSec}s` : `il y a ${Math.round(ageSec / 60)} min`;
  const dist = custLat != null && custLng != null ? distanceKm(data.lat, data.lng, custLat, custLng) : null;
  const mapsUrl = `https://maps.google.com/?q=${data.lat},${data.lng}`;

  return (
    <div className="mt-6 rounded-2xl border-2 border-[color:var(--brand-dark)]/30 bg-[color:var(--brand-light)] p-5">
      <h2 className="font-display font-semibold flex items-center gap-2">🛵 {data.name} arrive vers toi</h2>
      {dist != null ? (
        <p className="mt-2 font-display text-3xl font-bold text-[color:var(--brand-dark)]">
          ~{dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
          <span className="ml-2 text-sm font-normal text-muted-foreground">de toi</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Position du livreur partagée.</p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Mise à jour {ageLabel} · actualisation automatique</p>
      <Button asChild size="sm" variant="outline" className="mt-3">
        <a href={mapsUrl} target="_blank" rel="noreferrer">📍 Voir le livreur sur la carte</a>
      </Button>
    </div>
  );
}