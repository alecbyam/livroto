// ============================================================================
// Suivi de commande — module boutique générique (/shop-order/$orderId).
// Sous `_authenticated` comme orders.$orderId.tsx côté marketplace natif :
// même exigence de connexion pour voir sa commande.
// ============================================================================
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, Loader2, MessageCircle, Store } from "lucide-react";
import { ShopSiteLayout } from "@/components/shops/ShopSiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyShopOrder } from "@/lib/shops/orders.functions";

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
  const { data, isLoading } = useQuery({
    queryKey: ["shop-order-detail", orderId],
    queryFn: () => fetchOrder({ data: { order_id: orderId } }),
  });

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
          <Badge variant="outline">{STATUS_LABEL[order.status] ?? order.status}</Badge>
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
            <div className="flex justify-between text-muted-foreground pt-1"><span>Paiement</span><span>{PAYMENT_LABEL[order.payment_method] ?? order.payment_method} · {order.payment_status === "paid" ? "Payé ✅" : "En attente"}</span></div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display font-semibold">Livraison</h2>
          <p className="mt-2 text-sm">{order.customer_name} · {order.customer_phone}</p>
          <p className="text-sm text-muted-foreground">{order.zone_name} · {order.customer_address}</p>
          {order.customer_notes && <p className="mt-2 text-sm italic text-muted-foreground">"{order.customer_notes}"</p>}
        </div>

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
