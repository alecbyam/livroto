import { useServerFn } from "@tanstack/react-start";
import { ScrollText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminListActionsPage } from "@/lib/admin.functions";
import { useAdminPagedList } from "./AdminList";

// Journal d'audit admin — qui a fait quoi, sur quelle cible, quand (gap identifié à l'audit
// du 5/08/2026). Lecture seule par construction : voir migration 62 (aucune policy
// UPDATE/DELETE, même pour un admin).

const ACTION_LABELS: Record<string, string> = {
  vendor_status_change: "Statut vendeur modifié",
  rider_status_change: "Statut livreur modifié",
  product_approve: "Produit approuvé/rejeté",
  promo_approve: "Promo validée/coupée",
  zone_create: "Zone créée",
  zone_update: "Zone modifiée",
  cdf_rate_update: "Taux de change mis à jour",
  role_grant: "Rôle accordé",
  role_revoke: "Rôle retiré",
  coupon_create: "Code promo créé",
  coupon_update: "Code promo modifié",
  report_resolve: "Signalement traité",
};

function summarize(details: any): string {
  if (!details) return "";
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export function AuditLogPanel() {
  const fetchPage = useServerFn(adminListActionsPage);
  const { rows, total, hasMore, loadingMore, loadMore, isLoading } = useAdminPagedList("admin-actions", fetchPage);

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-display text-lg font-bold">Journal d'audit</h3>
            <p className="text-xs text-muted-foreground">Chaque action admin sensible, horodatée — non modifiable.</p>
          </div>
        </div>
        <Badge variant="outline">{total}</Badge>
      </div>
      <div className="divide-y">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Chargement…</p>}
        {!isLoading && rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Aucune action enregistrée.</p>}
        {rows.map((a: any) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-[220px] flex-1">
              <p className="font-medium">{ACTION_LABELS[a.action] ?? a.action}</p>
              <p className="text-xs text-muted-foreground">
                {a.admin?.name || "Admin"}{a.admin?.phone ? ` · ${a.admin.phone}` : ""} · {new Date(a.created_at).toLocaleString("fr-FR")}
              </p>
              {a.details && <p className="mt-0.5 text-xs text-muted-foreground">{summarize(a.details)}</p>}
            </div>
            {a.target_type && <Badge variant="outline" className="capitalize">{a.target_type}</Badge>}
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="border-t p-3 text-center">
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Charger plus"}
          </Button>
        </div>
      )}
    </div>
  );
}
