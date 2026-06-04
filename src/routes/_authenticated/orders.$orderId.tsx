import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, Clock, Loader2, MessageCircle, Star, X } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getCustomerOrderDetail, customerCancelOrder, customerLeaveReview } from "@/lib/dashboard.functions";
import { LIVROTO_WHATSAPP } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderDetailPage,
});

const STATUS_FLOW = ["pending", "confirmed", "ready", "picked_up", "delivered"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmée", ready: "Prête",
  picked_up: "En route", delivered: "Livrée", cancelled: "Annulée",
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
  const { order, items, history, review: existingReview } = data as any;

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

        {/* Delivery info */}
        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display font-semibold">Livraison</h2>
          <p className="mt-2 text-sm">{order.customer_name} · {order.customer_phone}</p>
          <p className="text-sm text-muted-foreground">{order.zone} · {order.customer_address}</p>
          {order.customer_notes && <p className="mt-2 text-sm italic text-muted-foreground">"{order.customer_notes}"</p>}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {order.status === "pending" && (
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              <X className="h-4 w-4" /> Annuler la commande
            </Button>
          )}
          <Button asChild variant="outline">
            <a href={`https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(`Bonjour Livroto, info sur ma commande ${order.code ?? order.id.slice(0, 6)}`)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> Contacter le support
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