import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, lazy, Suspense } from "react";
import { toast } from "sonner";
import {
  Plus, CheckCircle2, XCircle, Clock, MapPin, Loader2,
  TrendingUp, TrendingDown, Wallet, Users, Store as StoreIcon, Bike as BikeIcon, RefreshCw, Package,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCurrency } from "@/lib/currency";
import {
  getAdminDashboard, adminUpdateVendorStatus, adminUpdateRiderStatus, adminApproveProduct, adminSetPromoApproved,
  adminUpsertZone, adminResolveReport,
  adminListUsers, adminGrantRole, adminRevokeRole,
  adminListCoupons, adminUpsertCoupon,
  adminUpdateCdfRate, getAdminOverview,
  adminListVendorsPage, adminListRidersPage, adminListPendingProductsPage,
  adminListPromoProductsPage, adminListOrdersPage, adminListReportsPage,
} from "@/lib/admin.functions";
import { AdminIntegrationsPanel } from "@/components/livroto/AdminIntegrationsPanel";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { statusColor, Stat } from "./shared";

// Graphique recharts (~500 kB) chargé à la demande -> bundle dashboard plus léger.
const AdminAnalyticsPanel = lazy(() =>
  import("@/components/livroto/charts/AnalyticsPanels").then((m) => ({ default: m.AdminAnalyticsPanel })));
const ChartFallback = () => <div className="h-52 animate-pulse rounded-2xl bg-muted" />;

// Pagination "charger plus" partagée par les listes admin (vendeurs, livreurs,
// produits, commandes, signalements) — chacune appelle sa propre fonction serveur
// paginée (offset/limit) au lieu de recevoir une liste plafonnée depuis getAdminDashboard.
function useAdminPagedList<T>(
  key: string,
  fetchPage: (args: { data: Record<string, any> }) => Promise<{ rows: T[]; total: number }>,
  extraParams: Record<string, any> = {},
) {
  const qc = useQueryClient();
  const queryKey = [key, extraParams];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ data: { offset: pageParam, ...extraParams } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const rows = query.data ? query.data.pages.flatMap((p) => p.rows) : [];
  const total = query.data?.pages[0]?.total ?? 0;
  return {
    rows,
    total,
    isLoading: query.isLoading,
    hasMore: !!query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => query.fetchNextPage(),
    refresh: () => qc.invalidateQueries({ queryKey: [key] }),
  };
}

/* ---------------- ADMIN ---------------- */
export function AdminPanel() {
  const qc = useQueryClient();
  const fetchAdmin = useServerFn(getAdminDashboard);
  const setVendor = useServerFn(adminUpdateVendorStatus);
  const setRider = useServerFn(adminUpdateRiderStatus);
  const setProd = useServerFn(adminApproveProduct);
  const setPromo = useServerFn(adminSetPromoApproved);
  const fetchVendorsPage = useServerFn(adminListVendorsPage);
  const fetchRidersPage = useServerFn(adminListRidersPage);
  const fetchPendingProductsPage = useServerFn(adminListPendingProductsPage);
  const fetchPromoProductsPage = useServerFn(adminListPromoProductsPage);
  const fetchOrdersPage = useServerFn(adminListOrdersPage);

  const { data, isLoading, error } = useQuery({ queryKey: ["admin-dash"], queryFn: () => fetchAdmin() });

  const vendorsQ = useAdminPagedList("admin-vendors", fetchVendorsPage);
  const ridersQ = useAdminPagedList("admin-riders", fetchRidersPage);
  const pendingProductsQ = useAdminPagedList("admin-pending-products", fetchPendingProductsPage);
  const promoProductsQ = useAdminPagedList("admin-promo-products", fetchPromoProductsPage);
  const ordersQ = useAdminPagedList("admin-orders", fetchOrdersPage);

  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-dash"] });

  const onVendor = async (vendor_id: string, status: any) => {
    try { await setVendor({ data: { vendor_id, status } }); toast.success("Vendeur mis à jour"); vendorsQ.refresh(); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onRider = async (rider_id: string, status: any) => {
    try { await setRider({ data: { rider_id, status } }); toast.success("Livreur mis à jour"); ridersQ.refresh(); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onProd = async (product_id: string, approved: boolean) => {
    try { await setProd({ data: { product_id, approved } }); toast.success("Produit mis à jour"); pendingProductsQ.refresh(); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onPromo = async (product_id: string, approved: boolean) => {
    try { await setPromo({ data: { product_id, approved } }); toast.success(approved ? "Promo validée" : "Promo coupée"); promoProductsQ.refresh(); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <AdminOverviewPanel />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Commandes (tot.)" value={data.stats.totalOrders} />
        <Stat label="Livrées (tot.)" value={data.stats.delivered} />
        <Stat label="Revenu total $" value={data.stats.revenue.toFixed(2)} />
        <Stat label="Vendeurs ⏳" value={data.stats.pendingVendors} />
        <Stat label="Livreurs ⏳" value={data.stats.pendingRiders} />
        <Stat label="Produits ⏳" value={data.stats.pendingProducts} />
        <Stat label="Promos ⏳" value={data.stats.pendingPromos} />
      </div>

      <AdminRatePanel />

      <AdminIntegrationsPanel />

      <AiAssistantPanel />

      <Suspense fallback={<ChartFallback />}><AdminAnalyticsPanel /></Suspense>

      <AdminReportsPanel />

      <AdminUsersPanel />

      <AdminList
        title="Vendeurs" rows={vendorsQ.rows} total={vendorsQ.total}
        hasMore={vendorsQ.hasMore} loadingMore={vendorsQ.loadingMore} onLoadMore={vendorsQ.loadMore}
        render={(v: any) => (
          <>
            <div className="flex-1">
              <p className="font-medium">{v.shop_name}</p>
              <p className="text-xs text-muted-foreground">{v.whatsapp}</p>
            </div>
            <Badge className={statusColor(v.status)} variant="outline">{v.status}</Badge>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onVendor(v.id, "approved")}><CheckCircle2 className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => onVendor(v.id, "rejected")}><XCircle className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => onVendor(v.id, "suspended")}><Clock className="h-4 w-4" /></Button>
            </div>
          </>
        )}
      />

      <AdminList
        title="Livreurs" rows={ridersQ.rows} total={ridersQ.total}
        hasMore={ridersQ.hasMore} loadingMore={ridersQ.loadingMore} onLoadMore={ridersQ.loadMore}
        render={(r: any) => (
          <>
            <div className="flex-1">
              <p className="font-medium">{r.full_name}</p>
              <p className="text-xs text-muted-foreground">{r.whatsapp} · {r.vehicle}</p>
            </div>
            <Badge className={statusColor(r.status)} variant="outline">{r.status}</Badge>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onRider(r.id, "active")}><CheckCircle2 className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => onRider(r.id, "suspended")}><XCircle className="h-4 w-4" /></Button>
            </div>
          </>
        )}
      />

      <AdminList
        title="Produits à valider" rows={pendingProductsQ.rows} total={pendingProductsQ.total}
        hasMore={pendingProductsQ.hasMore} loadingMore={pendingProductsQ.loadingMore} onLoadMore={pendingProductsQ.loadMore}
        render={(p: any) => (
          <>
            <div className="text-xl">{p.emoji || "📦"}</div>
            <div className="flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">${Number(p.price_usd).toFixed(2)} · {p.category}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onProd(p.id, true)}><CheckCircle2 className="h-4 w-4" /> Approuver</Button>
          </>
        )}
      />

      <AdminList
        title="Promotions (prix barrés)" rows={promoProductsQ.rows} total={promoProductsQ.total}
        hasMore={promoProductsQ.hasMore} loadingMore={promoProductsQ.loadingMore} onLoadMore={promoProductsQ.loadMore}
        render={(p: any) => {
          const orig = Number(p.price_usd);
          const pp = Number(p.promo_price_usd);
          const pct = orig > 0 && pp < orig ? Math.round((1 - pp / orig) * 100) : 0;
          const live = p.promo_active && p.promo_approved;
          return (
            <>
              <div className="text-xl">{p.emoji || "📦"}</div>
              <div className="flex-1 min-w-[160px]">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="line-through">${orig.toFixed(2)}</span> → <b className="text-foreground">${pp.toFixed(2)}</b>
                  {pct > 0 && <span className="ml-1 text-red-600 font-semibold">−{pct}%</span>}
                  {!p.promo_active && <span className="ml-2 italic">(désactivée vendeur)</span>}
                  {pp >= orig && <span className="ml-2 text-destructive">⚠️ prix promo ≥ original</span>}
                </p>
              </div>
              <Badge variant="outline" className={live ? "border-red-500/40 text-red-600" : p.promo_approved ? "border-emerald-500/40 text-emerald-600" : "border-amber-500/40 text-amber-600"}>
                {live ? "Active" : p.promo_approved ? "Validée" : "À valider"}
              </Badge>
              {p.promo_approved ? (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => onPromo(p.id, false)}><XCircle className="h-4 w-4" /> Couper</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onPromo(p.id, true)}><CheckCircle2 className="h-4 w-4" /> Valider</Button>
              )}
            </>
          );
        }}
      />

      <AdminList
        title="Commandes récentes" rows={ordersQ.rows} total={ordersQ.total}
        hasMore={ordersQ.hasMore} loadingMore={ordersQ.loadingMore} onLoadMore={ordersQ.loadMore}
        render={(o: any) => (
          <>
            <div className="flex-1">
              <p className="font-medium">{o.code || o.id.slice(0, 8)} · {o.customer_name}</p>
              <p className="text-xs text-muted-foreground">{o.zone} · ${Number(o.total_usd).toFixed(2)}</p>
            </div>
            <Badge className={statusColor(o.status)} variant="outline">{o.status}</Badge>
          </>
        )}
      />

      <AdminCouponsPanel />

      <AdminZonesPanel zones={data.zones} onRefresh={refresh} />
    </div>
  );
}

/* ---------------- ADMIN: Vue d'ensemble (pilotage quotidien) ---------------- */
function BigStat({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string; sub?: React.ReactNode; icon: any; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-[color:var(--brand-dark)] text-white border-transparent" : "bg-card"}`}>
      <div className="flex items-center justify-between">
        <p className={`text-[11px] font-medium uppercase tracking-wider ${accent ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
        <Icon className={`h-4 w-4 ${accent ? "text-white/80" : "text-muted-foreground"}`} />
      </div>
      <p className="mt-2 font-display text-2xl font-bold leading-none">{value}</p>
      {sub != null && <div className={`mt-1.5 text-xs ${accent ? "text-white/75" : "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}

function AdminOverviewPanel() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const { fmt } = useCurrency();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="h-44 animate-pulse rounded-2xl bg-muted" />;
  if (!data) return null;

  const trend = data.today.trendOrders;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;
  const maxZone = Math.max(1, ...data.hotZones.map((z) => z.orders));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">🧭 Vue d'ensemble</h3>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-overview"] })}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigStat
          accent
          label="Aujourd'hui"
          value={String(data.today.orders)}
          icon={Package}
          sub={
            <span className="inline-flex items-center gap-1">
              commandes ·
              <span className={`inline-flex items-center gap-0.5 font-semibold ${trend >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                <TrendIcon className="h-3 w-3" />{Math.abs(trend)}%
              </span>
              <span className="text-white/60">vs hier</span>
            </span>
          }
        />
        <BigStat
          label="Revenu du jour"
          value={fmt(data.today.revenue)}
          icon={DollarSign}
          sub="commandes livrées"
        />
        <BigStat
          label="Cette semaine"
          value={fmt(data.week.revenue)}
          icon={TrendingUp}
          sub={`${data.week.orders} commandes · panier moy. ${fmt(data.week.avgBasket)}`}
        />
        <BigStat
          label="Cash à encaisser"
          value={fmt(data.cashToCollect)}
          icon={Wallet}
          sub="livrées non payées"
        />
      </div>

      {/* Réseau + zones chaudes */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Réseau actif</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <StoreIcon className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1.5 font-display text-xl font-bold">{data.network.vendorsActive}</p>
              <p className="text-[11px] text-muted-foreground">vendeurs actifs</p>
              {data.network.vendorsPending > 0 && (
                <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{data.network.vendorsPending} en attente</p>
              )}
            </div>
            <div className="text-center">
              <BikeIcon className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1.5 font-display text-xl font-bold">{data.network.ridersActive}</p>
              <p className="text-[11px] text-muted-foreground">livreurs actifs</p>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {data.network.ridersOnline} en ligne <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />
              </p>
            </div>
            <div className="text-center">
              <Users className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-1.5 font-display text-xl font-bold">{data.network.customers}</p>
              <p className="text-[11px] text-muted-foreground">clients</p>
              {data.network.newCustomers7d > 0 && (
                <p className="text-[11px] font-medium text-primary">+{data.network.newCustomers7d} cette sem.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">🔥 Quartiers les plus actifs (7 j)</p>
          {data.hotZones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas encore de commande cette semaine.</p>
          ) : (
            <ul className="space-y-2">
              {data.hotZones.map((z) => (
                <li key={z.zone} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm font-medium">{z.zone}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[color:var(--brand-dark)]"
                      style={{ width: `${Math.round((z.orders / maxZone) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold">{z.orders}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- ADMIN: Coupons ---------------- */
function AdminCouponsPanel() {
  const qc = useQueryClient();
  const listCoupons = useServerFn(adminListCoupons);
  const upsert = useServerFn(adminUpsertCoupon);
  const [open, setOpen] = useState(false);
  const blank = {
    code: "", description: "", type: "fixed" as "fixed" | "percent",
    value: "", min_order_usd: "0", max_discount_usd: "", max_uses: "",
    max_uses_per_user: "1", starts_at: "", expires_at: "", active: true,
  };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => listCoupons(),
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await upsert({
        data: {
          code: form.code,
          description: form.description || null,
          type: form.type,
          value: Number(form.value),
          min_order_usd: Number(form.min_order_usd) || 0,
          max_discount_usd: form.max_discount_usd ? Number(form.max_discount_usd) : null,
          max_uses: form.max_uses ? Number(form.max_uses) : null,
          max_uses_per_user: Number(form.max_uses_per_user) || 1,
          starts_at: form.starts_at || null,
          expires_at: form.expires_at || null,
          active: form.active,
        },
      });
      toast.success("Code promo enregistré");
      setOpen(false);
      setForm(blank);
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c: any) => {
    try {
      await upsert({
        data: {
          id: c.id,
          code: c.code,
          description: c.description ?? null,
          type: c.type,
          value: Number(c.value),
          min_order_usd: Number(c.min_order_usd),
          max_discount_usd: c.max_discount_usd ? Number(c.max_discount_usd) : null,
          max_uses: c.max_uses ? Number(c.max_uses) : null,
          max_uses_per_user: Number(c.max_uses_per_user),
          starts_at: c.starts_at ?? null,
          expires_at: c.expires_at ?? null,
          active: !c.active,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-display text-lg font-bold">🏷️ Codes promo</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{data?.coupons?.length ?? 0}</Badge>
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            <Plus className="h-4 w-4" /> Créer
          </Button>
        </div>
      </div>

      {open && (
        <form onSubmit={onSubmit} className="grid gap-3 border-b p-4 md:grid-cols-2">
          <div>
            <Label>Code <span className="text-destructive">*</span></Label>
            <Input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="Ex: NOEL25"
              maxLength={40}
              className="uppercase"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Réduction de Noël"
              maxLength={200}
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v: "fixed" | "percent") => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Montant fixe ($)</SelectItem>
                <SelectItem value="percent">Pourcentage (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valeur <span className="text-destructive">*</span></Label>
            <Input
              required
              type="number"
              step="0.5"
              min="0.1"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={form.type === "percent" ? "Ex: 10  (= 10%)" : "Ex: 2  (= $2)"}
            />
          </div>
          <div>
            <Label>Commande minimum ($)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={form.min_order_usd}
              onChange={(e) => setForm({ ...form, min_order_usd: e.target.value })}
            />
          </div>
          <div>
            <Label>Remise max ($, optionnel)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={form.max_discount_usd}
              onChange={(e) => setForm({ ...form, max_discount_usd: e.target.value })}
              placeholder="Laisser vide = illimité"
            />
          </div>
          <div>
            <Label>Nb utilisations max (total)</Label>
            <Input
              type="number"
              min="1"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              placeholder="Laisser vide = illimité"
            />
          </div>
          <div>
            <Label>Nb utilisations max / utilisateur</Label>
            <Input
              type="number"
              min="0"
              value={form.max_uses_per_user}
              onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value })}
            />
          </div>
          <div>
            <Label>Date de début (optionnel)</Label>
            <Input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>
          <div>
            <Label>Date d'expiration (optionnel)</Label>
            <Input
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label>Actif dès maintenant</Label>
          </div>
          <Button type="submit" disabled={busy} className="md:col-span-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer le code promo"}
          </Button>
        </form>
      )}

      {isLoading && <p className="p-6 text-sm text-muted-foreground">Chargement…</p>}
      <div className="divide-y">
        {!isLoading && (data?.coupons ?? []).length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Aucun code promo. Crée-en un avec le bouton ci-dessus.</p>
        )}
        {(data?.coupons ?? []).map((c: any) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold">{c.code}</span>
                {!c.active && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Inactif</Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {c.type === "fixed"
                  ? `-$${Number(c.value).toFixed(2)}`
                  : `-${Number(c.value)}%`}
                {Number(c.min_order_usd) > 0 && ` · min $${Number(c.min_order_usd).toFixed(2)}`}
                {c.max_discount_usd && ` · plafond $${Number(c.max_discount_usd).toFixed(2)}`}
                {` · ${c.uses_count} utilisation${c.uses_count !== 1 ? "s" : ""}`}
                {c.max_uses && `/${c.max_uses}`}
                {c.expires_at && ` · expire le ${new Date(c.expires_at).toLocaleDateString("fr-FR")}`}
              </p>
              {c.description && (
                <p className="text-xs italic text-muted-foreground">{c.description}</p>
              )}
            </div>
            <Switch
              checked={c.active}
              onCheckedChange={() => toggleActive(c)}
              aria-label={c.active ? "Désactiver" : "Activer"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminRatePanel() {
  const { rate, reloadRate } = useCurrency();
  const update = useServerFn(adminUpdateCdfRate);
  const [val, setVal] = useState(String(rate));
  const [busy, setBusy] = useState(false);

  useEffect(() => { setVal(String(rate)); }, [rate]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.round(Number(val));
    if (!n || n < 100 || n > 100000) { toast.error("Taux invalide (entre 100 et 100 000 FC)"); return; }
    setBusy(true);
    try {
      await update({ data: { rate: n } });
      await reloadRate();
      toast.success(`Taux mis à jour : 1 $ = ${n.toLocaleString("fr-CD")} FC`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">💱 Taux de change USD → CDF</h3>
          <p className="text-xs text-muted-foreground">Mets à jour le taux quand le franc fluctue. Appliqué partout dans l'app.</p>
        </div>
        <Badge variant="outline" className="shrink-0 whitespace-nowrap">1 $ = {rate.toLocaleString("fr-CD")} FC</Badge>
      </div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2 p-4">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">1 USD = ? Francs Congolais (FC)</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={100}
            max={100000}
            step={50}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
        <Button type="submit" disabled={busy} className="min-h-[44px]">
          {busy ? "Enregistrement…" : "Enregistrer le taux"}
        </Button>
      </form>
    </div>
  );
}

function AdminZonesPanel({ zones, onRefresh }: { zones: any[]; onRefresh: () => void }) {
  const upsert = useServerFn(adminUpsertZone);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("2");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsert({ data: { name, delivery_fee_usd: Number(fee), active: true } });
      toast.success("Zone ajoutée");
      setName(""); setFee("2");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const toggle = async (z: any, active: boolean) => {
    try {
      await upsert({ data: { id: z.id, name: z.name, delivery_fee_usd: Number(z.delivery_fee_usd), active } });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const updateFee = async (z: any, newFee: number) => {
    try {
      await upsert({ data: { id: z.id, name: z.name, delivery_fee_usd: newFee, active: z.active } });
      toast.success("Tarif mis à jour");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Zones de livraison</h3>
        <Badge variant="outline">{zones.length}</Badge>
      </div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2 border-b p-4">
        <div className="flex-1 min-w-[160px]">
          <Label className="text-xs">Nom du quartier</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Mudzipela" />
        </div>
        <div className="w-28">
          <Label className="text-xs">Frais (USD)</Label>
          <Input required type="number" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <Button type="submit"><Plus className="h-4 w-4" /> Ajouter</Button>
      </form>
      <div className="divide-y">
        {zones.map((z: any) => (
          <div key={z.id} className="flex flex-wrap items-center gap-3 p-4">
            <MapPin className="h-4 w-4 text-primary" />
            <p className="flex-1 font-medium">{z.name}</p>
            <Input
              type="number"
              step="0.5"
              defaultValue={z.delivery_fee_usd}
              className="w-24"
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== Number(z.delivery_fee_usd)) updateFee(z, v);
              }}
            />
            <Switch checked={z.active} onCheckedChange={(v) => toggle(z, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminList({
  title, rows, total, render, hasMore, loadingMore, onLoadMore,
}: {
  title: string;
  rows: any[];
  total?: number;
  render: (r: any) => React.ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <Badge variant="outline">{total ?? rows.length}</Badge>
      </div>
      <div className="divide-y">
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Vide.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">{render(r)}</div>
        ))}
      </div>
      {hasMore && (
        <div className="border-t p-3 text-center">
          <Button size="sm" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Charger plus"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AdminReportsPanel() {
  const resolve = useServerFn(adminResolveReport);
  const fetchReportsPage = useServerFn(adminListReportsPage);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const { rows, total, hasMore, loadingMore, loadMore, refresh } = useAdminPagedList("admin-reports", fetchReportsPage, { filter });

  const act = async (report_id: string, status: "resolved" | "dismissed" | "reviewing") => {
    try {
      await resolve({ data: { report_id, status } });
      toast.success(status === "resolved" ? "Signalement résolu" : status === "dismissed" ? "Signalement rejeté" : "Marqué en revue");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const targetLabel = (r: any) => {
    if (!r.target) return r.target_id.slice(0, 8);
    if (r.target_type === "product") return `${r.target.emoji ?? "📦"} ${r.target.name}`;
    if (r.target_type === "vendor") return `🏪 ${r.target.shop_name}`;
    if (r.target_type === "rider") return `🛵 ${r.target.full_name}`;
    return r.target_id.slice(0, 8);
  };

  const targetHref = (r: any): string | null => {
    if (r.target_type === "product") return `/product/${r.target_id}`;
    if (r.target_type === "vendor" && r.target?.slug) return `/vendor/${r.target.slug}`;
    return null;
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-bold">🚩 Signalements</h3>
          <Badge variant="outline">{total}</Badge>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>À traiter</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Tous</Button>
        </div>
      </div>
      <div className="divide-y">
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Aucun signalement.</p>}
        {rows.map((r: any) => {
          const href = targetHref(r);
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-3 p-4">
              <Badge variant="outline" className="capitalize">{r.target_type}</Badge>
              <div className="flex-1 min-w-[220px]">
                <p className="font-medium">
                  {href ? (
                    <a href={href} className="hover:underline" target="_blank" rel="noreferrer">{targetLabel(r)}</a>
                  ) : targetLabel(r)}
                </p>
                <p className="mt-0.5 text-sm"><span className="font-medium">Motif :</span> {r.reason}</p>
                {r.details && <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-wrap">{r.details}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  Par {r.reporter?.name || "Anonyme"}
                  {r.reporter?.phone ? ` · ${r.reporter.phone}` : ""}
                  {" · "}
                  {new Date(r.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
              <Badge className={statusColor(r.status === "open" ? "pending" : r.status === "resolved" ? "approved" : r.status === "dismissed" ? "rejected" : "")} variant="outline">
                {r.status}
              </Badge>
              {r.status !== "resolved" && r.status !== "dismissed" && (
                <div className="flex gap-1">
                  {r.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "reviewing")} title="Marquer en revue">
                      <Clock className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => act(r.id, "resolved")} title="Résoudre">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(r.id, "dismissed")} title="Rejeter">
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
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

/* ---------------- ADMIN: Users & Roles ---------------- */
const ALL_ROLES: ("customer" | "vendor" | "rider" | "admin")[] = ["customer", "vendor", "rider", "admin"];

function AdminUsersPanel() {
  const list = useServerFn(adminListUsers);
  const grant = useServerFn(adminGrantRole);
  const revoke = useServerFn(adminRevokeRole);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-users", debounced],
    queryFn: () => list({ data: { search: debounced || undefined } }),
  });

  const toggle = async (user_id: string, role: typeof ALL_ROLES[number], has: boolean) => {
    try {
      if (has) await revoke({ data: { user_id, role } });
      else await grant({ data: { user_id, role } });
      toast.success(has ? `Rôle ${role} retiré` : `Rôle ${role} accordé`);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h3 className="font-display text-lg font-bold">Utilisateurs & rôles</h3>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Rechercher nom ou téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 max-w-full"
          />
          <Badge variant="outline">{data?.users?.length ?? 0}</Badge>
        </div>
      </div>
      <div className="divide-y">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Chargement…</p>}
        {!isLoading && (data?.users?.length ?? 0) === 0 && (
          <p className="p-6 text-sm text-muted-foreground">Aucun utilisateur.</p>
        )}
        {(data?.users ?? []).map((u: any) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium">{u.name || "Sans nom"}</p>
              <p className="text-xs text-muted-foreground">
                {u.phone || "—"} {u.zone ? `· ${u.zone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLES.map((role) => {
                const has = (u.roles ?? []).includes(role);
                return (
                  <Button
                    key={role}
                    size="sm"
                    variant={has ? "default" : "outline"}
                    onClick={() => toggle(u.id, role, has)}
                    className="h-7 px-2 text-xs capitalize"
                  >
                    {has ? "✓ " : "+ "}{role}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="border-t p-3 text-xs text-muted-foreground">
        Astuce : approuver un vendeur ou un livreur attribue automatiquement le rôle correspondant. Utilise ce panneau pour des ajustements manuels (ex : promouvoir un admin).
      </p>
    </div>
  );
}
