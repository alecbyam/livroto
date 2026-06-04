import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Package, ArrowLeft } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-200",
  confirmed: "bg-blue-100 text-blue-900 border-blue-200",
  preparing: "bg-purple-100 text-purple-900 border-purple-200",
  out_for_delivery: "bg-indigo-100 text-indigo-900 border-indigo-200",
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-200",
  cancelled: "bg-red-100 text-red-900 border-red-200",
};

export const Route = createFileRoute("/_authenticated/orders")({
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

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
                      {o.status}
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