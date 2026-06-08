import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Package, ArrowLeft, RotateCcw } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

type OrderRow = {
  id: string;
  code: string | null;
  status: string;
  total_usd: number;
  delivery_fee: number;
  zone: string;
  customer_address: string;
  quantity: number;
  created_at: string;
};

const STATUS_FR: Record<string, string> = {
  pending:   "En attente",
  confirmed: "Confirmée",
  ready:     "Prête",
  picked_up: "En route",
  delivered: "Livrée",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-900 border-amber-200",
  confirmed: "bg-blue-100 text-blue-900 border-blue-200",
  ready:     "bg-purple-100 text-purple-900 border-purple-200",
  picked_up: "bg-indigo-100 text-indigo-900 border-indigo-200",
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-200",
  cancelled: "bg-red-100 text-red-900 border-red-200",
};

export const Route = createFileRoute("/_authenticated/orders")({
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { add } = useCart();
  const [reordering, setReordering] = useState<string | null>(null);

  const reorder = async (orderId: string) => {
    setReordering(orderId);
    try {
      const { data: its } = await supabase.from("order_items").select("product_id,quantity").eq("order_id", orderId);
      const lines = (its ?? []).filter((it: any) => it.product_id);
      if (lines.length === 0) { toast.error("Aucun article à recommander"); return; }
      const { data: prods } = await supabase
        .from("products")
        .select("id,name,price_usd,emoji,image_url,vendor_id,stock,approved")
        .in("id", lines.map((it: any) => it.product_id));
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
    } finally {
      setReordering(null);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("orders")
        .select("id,code,status,total_usd,delivery_fee,zone,customer_address,quantity,created_at")
        .eq("customer_id", u.user.id)
        .order("created_at", { ascending: false });
      if (data) setOrders(data as OrderRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Tableau de bord
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Mes commandes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historique de tes commandes Livroto.
        </p>

        {loading ? (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">Aucune commande pour le moment.</p>
            <Button asChild className="mt-4">
              <Link to="/catalog">Parcourir le catalogue</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="block rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-primary/40 transition-colors"
                >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold">#{o.code ?? o.id.slice(0, 6)}</span>
                    <Badge variant="outline" className={STATUS_COLORS[o.status] ?? ""}>
                      {STATUS_FR[o.status] ?? o.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground truncate">
                    {o.zone} · {o.customer_address}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-lg font-bold text-[color:var(--brand-dark)]">
                    ${Number(o.total_usd).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    qty {o.quantity} · livraison à négocier
                  </p>
                  {o.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={reordering === o.id}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); reorder(o.id); }}
                    >
                      {reordering === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Recommander
                    </Button>
                  )}
                </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SiteLayout>
  );
}