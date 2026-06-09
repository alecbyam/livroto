import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { toast } from "sonner";
import { Store, Bike, ShieldCheck, Package, Truck, Plus, CheckCircle2, XCircle, Clock, LogOut, Upload, Loader2, UserCircle2, Bell } from "lucide-react";
import { Pencil, Trash2, DollarSign, MapPin, ImageIcon, TrendingUp, TrendingDown, Wallet, Users, Store as StoreIcon, Bike as BikeIcon, RefreshCw } from "lucide-react";

// Graphiques recharts (~500 kB) chargés à la demande -> bundle dashboard plus léger.
const VendorAnalyticsPanel = lazy(() =>
  import("@/components/livroto/charts/AnalyticsPanels").then((m) => ({ default: m.VendorAnalyticsPanel })));
const AdminAnalyticsPanel = lazy(() =>
  import("@/components/livroto/charts/AnalyticsPanels").then((m) => ({ default: m.AdminAnalyticsPanel })));

const ChartFallback = () => <div className="h-52 animate-pulse rounded-2xl bg-muted" />;

import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

import {
  getMyOverview, applyAsVendor, applyAsRider, getZones,
  getVendorDashboard, createProduct, updateOrderStatusVendor,
  getRiderDashboard, toggleRiderAvailability,
  getAdminDashboard, adminUpdateVendorStatus, adminUpdateRiderStatus, adminApproveProduct,
  vendorUpdateProduct, vendorDeleteProduct, vendorUpdateShop,
  getAvailableDeliveries, riderClaimOrder, riderUpdateOrderStatus, riderConfirmCash, riderUpdateLocation,
  adminUpsertZone, adminResolveReport,
  adminListUsers, adminGrantRole, adminRevokeRole,
  adminListCoupons, adminUpsertCoupon,
  adminUpdateCdfRate, getAdminOverview,
} from "@/lib/dashboard.functions";
import { saveCallmebotApiKey, notifyOrderStatusChanged } from "@/lib/notifications.functions";
import { useCurrency } from "@/lib/currency";
import { compressImage } from "@/lib/image";
import { AdminIntegrationsPanel } from "@/components/livroto/AdminIntegrationsPanel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: DashboardPage,
});

function statusColor(s: string) {
  switch (s) {
    case "delivered": case "approved": case "active": return "bg-primary/15 text-primary border-primary/30";
    case "pending": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "cancelled": case "suspended": case "rejected": return "bg-destructive/15 text-destructive border-destructive/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

/* ---------- WhatsApp auto (CallMeBot) ---------- */
function CallMeBotCard({ role, currentKey, currentPhone }: { role: "vendor" | "rider" | "customer"; currentKey: string | null | undefined; currentPhone: string | null | undefined }) {
  const qc = useQueryClient();
  const save = useServerFn(saveCallmebotApiKey);
  const [key, setKey] = useState(currentKey ?? "");
  const [busy, setBusy] = useState(false);
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { role, apikey: key.trim() } });
      toast.success("Clé CallMeBot enregistrée — tu recevras les commandes sur WhatsApp.");
      qc.invalidateQueries({ queryKey: [role === "vendor" ? "vendor-dash" : role === "rider" ? "rider-dash" : "overview"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="font-display text-lg font-bold">📲 Notifications WhatsApp auto</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {role === "customer"
          ? `Reçois le suivi de tes commandes (confirmée, en route, livrée) sur WhatsApp (${currentPhone || "numéro non renseigné"}).`
          : `Reçois chaque nouvelle commande directement sur ton WhatsApp (${currentPhone || "numéro non renseigné"}).`}
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>Ajoute le contact <b>+34 644 51 95 23</b> dans ton téléphone (CallMeBot).</li>
        <li>Envoie-lui sur WhatsApp : <code className="rounded bg-muted px-1.5 py-0.5">I allow callmebot to send me messages</code></li>
        <li>Tu reçois une <b>clé API</b> en réponse — colle-la ci-dessous.</li>
      </ol>
      <form onSubmit={onSave} className="mt-3 flex flex-wrap gap-2">
        <Input
          placeholder="Clé CallMeBot (ex: 1234567)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <Button type="submit" disabled={busy || !key.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </form>
      {currentKey && (
        <p className="mt-2 text-xs text-primary">✓ Clé active — tu recevras les notifications.</p>
      )}
    </div>
  );
}

function DashboardPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getMyOverview);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: () => fetchOverview(),
    retry: 2,
    retryDelay: 1000,
  });

  const roles = data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const hasVendor = !!data?.vendor;
  const hasRider = !!data?.rider;

  const tabs = useMemo(() => {
    const t = [{ id: "home", label: "Accueil", icon: Package }];
    if (hasVendor) t.push({ id: "vendor", label: "Ma boutique", icon: Store });
    if (hasRider) t.push({ id: "rider", label: "Mes livraisons", icon: Bike });
    if (isAdmin) t.push({ id: "admin", label: "Admin", icon: ShieldCheck });
    return t;
  }, [hasVendor, hasRider, isAdmin]);

  const search = Route.useSearch();
  const [active, setActive] = useState<string>(search.tab ?? "home");
  useEffect(() => {
    if (!search.tab) return;
    const allowed = new Set(["home", ...(hasVendor ? ["vendor"] : []), ...(hasRider ? ["rider"] : []), ...(isAdmin ? ["admin"] : [])]);
    if (allowed.has(search.tab)) setActive(search.tab);
  }, [search.tab, hasVendor, hasRider, isAdmin]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (isLoading) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-12">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-32 animate-pulse rounded-2xl bg-muted" />
          <div className="mt-3 h-24 animate-pulse rounded-2xl bg-muted" />
        </div>
      </SiteLayout>
    );
  }

  if (error) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-16 max-w-lg text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 font-display text-2xl font-bold">Erreur de chargement</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {(error as Error).message ?? "Impossible de charger ton espace. Vérifie ta connexion."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => refetch()}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Réessayer
            </button>
            <button
              onClick={signOut}
              className="rounded-xl border px-6 py-2.5 text-sm font-semibold text-muted-foreground"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tableau de bord</p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              Karibu, {data?.profile?.name || "ami"} 👋
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Déconnexion
          </Button>
        </div>

        <Tabs value={active} onValueChange={setActive} className="mt-8">
          <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1">
            {tabs.map((t) => {
              const I = t.icon;
              return (
                <TabsTrigger key={t.id} value={t.id} className="gap-2">
                  <I className="h-4 w-4" /> {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="home" className="mt-6">
            <HomePanel
              hasVendor={hasVendor}
              hasRider={hasRider}
              onDone={() => qc.invalidateQueries({ queryKey: ["overview"] })}
            />
            <div className="mt-6">
              <CallMeBotCard
                role="customer"
                currentKey={data?.profile?.callmebot_apikey ?? null}
                currentPhone={data?.profile?.phone ?? null}
              />
            </div>
          </TabsContent>

          {hasVendor && (
            <TabsContent value="vendor" className="mt-6">
              <VendorPanel />
            </TabsContent>
          )}

          {hasRider && (
            <TabsContent value="rider" className="mt-6">
              <RiderPanel />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="admin" className="mt-6">
              <AdminPanel />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </SiteLayout>
  );
}

/* ---------------- HOME ---------------- */
function HomePanel({ hasVendor, hasRider, onDone }: { hasVendor: boolean; hasRider: boolean; onDone: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        to="/catalog"
        className="group rounded-2xl border bg-card p-6 transition hover:border-primary/50 hover:shadow-md"
      >
        <Package className="h-7 w-7 text-primary" />
        <h3 className="mt-3 font-display text-xl font-bold">Continuer mes achats</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Parcours le catalogue local de Bunia et commande en quelques tapes.
        </p>
      </Link>

      <Link
        to="/profile"
        className="group rounded-2xl border bg-card p-6 transition hover:border-primary/50 hover:shadow-md"
      >
        <UserCircle2 className="h-7 w-7 text-primary" />
        <h3 className="mt-3 font-display text-xl font-bold">Mon profil</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mets à jour ton nom, ton numéro WhatsApp, ta zone et ta photo.
        </p>
      </Link>

      {!hasVendor ? (
        <VendorOnboarding onDone={onDone} />
      ) : (
        <InfoCard
          icon={Store}
          title="Tu es vendeur"
          desc="Gère ta boutique et tes commandes dans l'onglet « Ma boutique »."
        />
      )}

      {!hasRider ? (
        <RiderOnboarding onDone={onDone} />
      ) : (
        <InfoCard
          icon={Bike}
          title="Tu es livreur"
          desc="Vois tes livraisons et active ta disponibilité dans l'onglet « Mes livraisons »."
        />
      )}
    </div>
  );
}

function InfoCard({ icon: I, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <I className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function VendorOnboarding({ onDone }: { onDone: () => void }) {
  const apply = useServerFn(applyAsVendor);
  const fetchZones = useServerFn(getZones);
  const { data: zonesData } = useQuery({ queryKey: ["zones"], queryFn: () => fetchZones() });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ shop_name: "", whatsapp: "", description: "", base_zone_id: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({ data: { ...form, base_zone_id: form.base_zone_id || null } });
      toast.success("Demande envoyée ! Notre équipe te contacte sous 24h.");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
      <Store className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">Devenir vendeur</h3>
      <p className="mt-1 text-sm text-muted-foreground">Ouvre ta boutique sur Livroto en 1 minute.</p>
      <div className="mt-4 space-y-3">
        <div>
          <Label>Nom de la boutique</Label>
          <Input required value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
        </div>
        <div>
          <Label>WhatsApp</Label>
          <Input required placeholder="+243…" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div>
          <Label>Quartier de base</Label>
          <Select value={form.base_zone_id} onValueChange={(v) => setForm({ ...form, base_zone_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir un quartier" /></SelectTrigger>
            <SelectContent>
              {(zonesData?.zones ?? []).map((z: any) => (
                <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Description (optionnel)</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Envoi…" : "Envoyer ma candidature"}
        </Button>
      </div>
    </form>
  );
}

function RiderOnboarding({ onDone }: { onDone: () => void }) {
  const apply = useServerFn(applyAsRider);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", whatsapp: "", vehicle: "moto" as "moto" | "velo" | "pied" | "voiture" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({ data: form });
      toast.success("Demande envoyée ! Notre équipe va te contacter.");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
      <Bike className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">Devenir livreur</h3>
      <p className="mt-1 text-sm text-muted-foreground">Gagne de l'argent en livrant à Bunia.</p>
      <div className="mt-4 space-y-3">
        <div>
          <Label>Nom complet</Label>
          <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <Label>WhatsApp</Label>
          <Input required placeholder="+243…" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div>
          <Label>Véhicule</Label>
          <Select value={form.vehicle} onValueChange={(v: any) => setForm({ ...form, vehicle: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="moto">Moto</SelectItem>
              <SelectItem value="velo">Vélo</SelectItem>
              <SelectItem value="pied">À pied</SelectItem>
              <SelectItem value="voiture">Voiture</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Envoi…" : "Postuler comme livreur"}
        </Button>
      </div>
    </form>
  );
}

/* ---------------- VENDOR ---------------- */
function VendorPanel() {
  const qc = useQueryClient();
  const fetchVendor = useServerFn(getVendorDashboard);
  const createP = useServerFn(createProduct);
  const updateStatus = useServerFn(updateOrderStatusVendor);
  const updateP = useServerFn(vendorUpdateProduct);
  const deleteP = useServerFn(vendorDeleteProduct);
  const notifyStatus = useServerFn(notifyOrderStatusChanged);
  const { data, isLoading } = useQuery({ queryKey: ["vendor-dash"], queryFn: () => fetchVendor() });

  // Realtime : nouvelle commande → rafraîchit le dashboard + toast
  useEffect(() => {
    if (!data?.vendor) return;
    const vendorId = (data.vendor as any).id;
    const channel = supabase
      .channel(`vendor-orders-${vendorId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "orders",
        filter: `vendor_id=eq.${vendorId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["vendor-dash"] });
        toast.info("🛒 Nouvelle commande reçue !");
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [(data?.vendor as any)?.id]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "phone_accessories" as "phone_accessories" | "local_food" | "delivery_service", subcategory_id: "" as string, price_usd: "", stock: "1", emoji: "📦", description: "", images: [] as string[] });
  const [subcats, setSubcats] = useState<{ id: string; name: string; emoji: string | null; parent_category: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase
      .from("product_subcategories")
      .select("id,name,emoji,parent_category,sort_order")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setSubcats(data ?? []));
  }, []);

  const subOptions = subcats.filter((s) => s.parent_category === form.category);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connecté");
      file = await compressImage(file);
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("products").upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("products")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 ans
      if (sErr || !signed) throw sErr ?? new Error("URL impossible");
      setForm((f) => {
        if (f.images.length >= 5) {
          toast.error("Maximum 5 photos par produit");
          return f;
        }
        return { ...f, images: [...f.images, signed.signedUrl] };
      });
      toast.success("Photo téléversée");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (!data?.vendor) return <p>Aucune boutique trouvée.</p>;

  const v = data.vendor as any;
  const stats = data.stats!;

  const submitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subcategory_id) {
      toast.error("Choisis une sous-catégorie pour bien classer ton produit");
      return;
    }
    try {
      await createP({
        data: {
          name: form.name,
          category: form.category,
          subcategory_id: form.subcategory_id,
          price_usd: Number(form.price_usd),
          stock: Number(form.stock),
          emoji: form.emoji,
          description: form.description,
          images: form.images.length > 0 ? form.images : undefined,
        },
      });
      toast.success("Produit créé. En attente de validation admin.");
      setOpen(false);
      setForm({ name: "", category: "phone_accessories", subcategory_id: "", price_usd: "", stock: "1", emoji: "📦", description: "", images: [] });
      qc.invalidateQueries({ queryKey: ["vendor-dash"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const changeStatus = async (order_id: string, status: any) => {
    try {
      await updateStatus({ data: { order_id, status } });
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["vendor-dash"] });
      notifyStatus({ data: { order_id, status } }).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">{v.shop_name}</h2>
            <Badge className={statusColor(v.status)} variant="outline">{v.status}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Produits" value={stats.productsCount} />
            <Stat label="Commandes" value={stats.ordersCount} />
            <Stat label="En attente" value={stats.pending} />
            <Stat label="Revenu $" value={stats.revenueUsd.toFixed(2)} />
          </div>
        </div>
      </div>

      <VendorShopCard vendor={v} onDone={() => qc.invalidateQueries({ queryKey: ["vendor-dash"] })} />

      <Suspense fallback={<ChartFallback />}><VendorAnalyticsPanel /></Suspense>

      <CallMeBotCard role="vendor" currentKey={v.callmebot_apikey} currentPhone={v.whatsapp} />

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-display text-lg font-bold">Mes produits</h3>
          <Button size="sm" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" /> Ajouter</Button>
        </div>
        {open && (
          <form onSubmit={submitProduct} className="grid gap-3 border-b p-4 md:grid-cols-2">
            <div><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Catégorie</Label>
              <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v, subcategory_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone_accessories">Accessoires téléphone</SelectItem>
                  <SelectItem value="local_food">Cuisine locale</SelectItem>
                  <SelectItem value="delivery_service">Service de livraison</SelectItem>
                  <SelectItem value="home_tools">Outils maison</SelectItem>
                  <SelectItem value="beauty">Parfums & beauté</SelectItem>
                  <SelectItem value="jewelry">Bijoux</SelectItem>
                  <SelectItem value="watches">Montres</SelectItem>
                  <SelectItem value="computers">Ordinateurs & pièces</SelectItem>
                  <SelectItem value="electronics">Électronique grand public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Sous-catégorie <span className="text-destructive">*</span></Label>
              <Select value={form.subcategory_id} onValueChange={(v) => setForm({ ...form, subcategory_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir une sous-catégorie" /></SelectTrigger>
                <SelectContent>
                  {subOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.emoji ? `${s.emoji} ` : ""}{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {subOptions.length} sous-catégorie{subOptions.length > 1 ? "s" : ""} disponibles
              </p>
            </div>
            <div><Label>Prix (USD)</Label><Input type="number" step="0.5" required value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: e.target.value })} /></div>
            <div><Label>Stock</Label><Input type="number" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
            <div><Label>Emoji</Label><Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="md:col-span-2">
              <Label>Photos du produit (jusqu'à 5)</Label>
              <div className="mt-1.5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {form.images.map((url, idx) => (
                    <div key={idx} className="relative h-20 w-20 rounded-lg overflow-hidden border group">
                      <img src={url} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 rounded bg-primary px-1 py-0.5 text-[10px] font-bold text-primary-foreground">1ère</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))}
                        className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground text-xs opacity-0 group-hover:opacity-100"
                        aria-label="Retirer"
                      >×</button>
                    </div>
                  ))}
                  {form.images.length < 5 && (
                    <button
                      type="button"
                      onClick={() => document.getElementById("prod-img")?.click()}
                      disabled={uploading}
                      className="h-20 w-20 grid place-items-center rounded-lg border-2 border-dashed text-muted-foreground hover:bg-muted/40"
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    </button>
                  )}
                </div>
                <input
                  id="prod-img"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    const slots = 5 - form.images.length;
                    files.slice(0, slots).forEach((f) => uploadImage(f));
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">JPG/PNG, max 5 Mo chacune. La 1ère photo sera mise en avant.</p>
              </div>
            </div>
            <Button type="submit" className="md:col-span-2">Créer le produit</Button>
          </form>
        )}
        <div className="divide-y">
          {data.products.length === 0 && <p className="p-6 text-sm text-muted-foreground">Aucun produit encore.</p>}
          {data.products.map((p: any) => (
            <VendorProductRow
              key={p.id}
              product={p}
              onUpdate={async (patch) => {
                try { await updateP({ data: { product_id: p.id, ...patch } }); toast.success("Mis à jour"); qc.invalidateQueries({ queryKey: ["vendor-dash"] }); }
                catch (e: any) { toast.error(e.message); }
              }}
              onDelete={async () => {
                if (!confirm(`Supprimer "${p.name}" ?`)) return;
                try { await deleteP({ data: { product_id: p.id } }); toast.success("Produit supprimé"); qc.invalidateQueries({ queryKey: ["vendor-dash"] }); }
                catch (e: any) { toast.error(e.message); }
              }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-4"><h3 className="font-display text-lg font-bold">Commandes reçues</h3></div>
        <div className="divide-y">
          {data.orders.length === 0 && <p className="p-6 text-sm text-muted-foreground">Pas encore de commande.</p>}
          {data.orders.map((o: any) => (
            <div key={o.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">#{o.code || o.id.slice(0, 8)} · {o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    📍 {o.zone} · 📞 {o.customer_phone} · ${Number(o.total_usd).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <Badge className={statusColor(o.status)} variant="outline">
                  {({"pending":"En attente","confirmed":"Confirmée","ready":"Prête","picked_up":"En route","delivered":"Livrée","cancelled":"Annulée"} as Record<string, string>)[o.status] ?? o.status}
                </Badge>
                <Select value={o.status} onValueChange={(s) => changeStatus(o.id, s)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      {v:"pending",l:"En attente"},
                      {v:"confirmed",l:"Confirmer"},
                      {v:"ready",l:"Prête"},
                      {v:"picked_up",l:"En route"},
                      {v:"delivered",l:"Livrée"},
                      {v:"cancelled",l:"Annuler"},
                    ].map(({v,l}) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Articles de la commande */}
              {(o.items ?? []).length > 0 && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                  {(o.items as any[]).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>{it.product_name} × {it.quantity}</span>
                      <span className="font-medium">${Number(it.line_total_usd).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {o.customer_notes && (
                <p className="text-xs italic text-muted-foreground pl-1">📝 {o.customer_notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RiderLiveShareCard() {
  const update = useServerFn(riderUpdateLocation);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const watchId = useRef<number | null>(null);
  const lastPush = useRef(0);

  const stop = () => {
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    setSharing(false);
  };
  useEffect(() => () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); }, []);

  const start = () => {
    if (!navigator.geolocation) { toast.error("Géolocalisation indisponible sur cet appareil"); return; }
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPush.current < 15000) return; // throttle ~15s (data + batterie)
        lastPush.current = now;
        update({ data: { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) } })
          .then(() => setLastSent(new Date()))
          .catch(() => {});
      },
      () => { toast.error("Active le GPS pour partager ta position"); stop(); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold flex items-center gap-2">
            📍 Partage de position en direct
            {sharing && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
          </h3>
          <p className="text-xs text-muted-foreground">
            {sharing
              ? (lastSent ? `Position envoyée à ${lastSent.toLocaleTimeString("fr-FR")}` : "Recherche du signal GPS…")
              : "Active-le pendant tes courses : le client te suit en temps réel."}
          </p>
        </div>
        <Button size="sm" variant={sharing ? "default" : "outline"} onClick={sharing ? stop : start} className="shrink-0">
          {sharing ? "⏹ Arrêter" : "▶ Activer"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function VendorProductRow({
  product, onUpdate, onDelete,
}: {
  product: any;
  onUpdate: (patch: { price_usd?: number; stock?: number; name?: string; images?: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const [price, setPrice] = useState(String(product.price_usd));
  const [stock, setStock] = useState(String(product.stock));
  const [images, setImages] = useState<string[]>(product.images ?? (product.image_url ? [product.image_url] : []));
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connecté");
      file = await compressImage(file);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("products").upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("products").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr || !signed) throw sErr ?? new Error("URL impossible");
      setImages((prev) => prev.length >= 5 ? prev : [...prev, signed.signedUrl]);
      toast.success("Photo ajoutée");
    } catch (e: any) { toast.error(e.message ?? "Erreur upload"); }
    finally { setUploading(false); }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-[color:var(--brand-light)] grid place-items-center text-xl">
          {images[0]
            ? <img src={images[0]} alt={product.name} className="h-full w-full object-cover" />
            : <span>{product.emoji || "📦"}</span>}
        </div>
        <div className="flex-1 min-w-[160px]">
          <p className="font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            ${Number(product.price_usd).toFixed(2)} ·{" "}
            <span className={product.stock === 0 ? "font-semibold text-destructive" : product.stock <= 5 ? "font-semibold text-orange-600 dark:text-orange-400" : ""}>
              stock {product.stock}
              {product.stock === 0 ? " — rupture 🔴" : product.stock <= 5 ? " — faible ⚠️" : ""}
            </span>
            {product.subcategory && <> · {product.subcategory.emoji} {product.subcategory.name}</>}
          </p>
        </div>
        <Badge variant="outline" className={product.approved ? "border-primary/30 text-primary" : ""}>
          {product.approved ? "Approuvé" : "En attente"}
        </Badge>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEdit((v) => !v)}><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      {edit && (
        <div className="rounded-xl border bg-background p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-28" type="number" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix $" />
            <Input className="w-24" type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock" />
            <Button size="sm" onClick={async () => { await onUpdate({ price_usd: Number(price), stock: Number(stock), images }); setEdit(false); }}>
              Enregistrer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Annuler</Button>
          </div>
          {/* Images */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Photos ({images.length}/5)</p>
            <div className="flex flex-wrap gap-2">
              {images.map((url, idx) => (
                <div key={idx} className="group relative h-16 w-16 overflow-hidden rounded-lg border">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 text-white text-lg"
                    aria-label="Supprimer"
                  >×</button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed text-muted-foreground hover:bg-muted/40">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- RIDER ---------------- */
function RiderPanel() {
  const qc = useQueryClient();
  const fetchRider = useServerFn(getRiderDashboard);
  const toggle = useServerFn(toggleRiderAvailability);
  const fetchAvail = useServerFn(getAvailableDeliveries);
  const claim = useServerFn(riderClaimOrder);
  const updStatus = useServerFn(riderUpdateOrderStatus);
  const cashIn = useServerFn(riderConfirmCash);
  const notifyStatus = useServerFn(notifyOrderStatusChanged);
  const { data, isLoading } = useQuery({ queryKey: ["rider-dash"], queryFn: () => fetchRider() });
  const { data: avail } = useQuery({ queryKey: ["rider-avail"], queryFn: () => fetchAvail(), refetchInterval: 15000 });

  // Realtime : nouvelle commande disponible → rafraîchit la liste
  useEffect(() => {
    const channel = supabase
      .channel("rider-available-orders")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "orders",
      }, () => {
        qc.invalidateQueries({ queryKey: ["rider-avail"] });
        toast.info("🛵 Nouvelle course disponible !");
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
      }, () => {
        qc.invalidateQueries({ queryKey: ["rider-avail"] });
        qc.invalidateQueries({ queryKey: ["rider-dash"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (!data?.rider) return <p>Aucun profil livreur.</p>;
  const r = data.rider as any;

  const flip = async (v: boolean) => {
    try {
      await toggle({ data: { available: v } });
      qc.invalidateQueries({ queryKey: ["rider-dash"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rider-dash"] });
    qc.invalidateQueries({ queryKey: ["rider-avail"] });
  };
  const onClaim = async (id: string) => {
    try { await claim({ data: { order_id: id } }); toast.success("Course acceptée"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onStatus = async (id: string, status: any) => {
    try {
      await updStatus({ data: { order_id: id, status } });
      toast.success("Statut mis à jour");
      refresh();
      notifyStatus({ data: { order_id: id, status } }).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
  };
  const onCash = async (id: string, amount: number) => {
    try { await cashIn({ data: { order_id: id, amount_usd: amount } }); toast.success("Cash encaissé"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">{r.full_name}</h2>
            <div className="mt-1 flex gap-2">
              <Badge className={statusColor(r.status)} variant="outline">{r.status}</Badge>
              <Badge variant="outline" className="capitalize">{r.vehicle}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-2">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Disponible</span>
            <Switch checked={r.is_available} onCheckedChange={flip} disabled={r.status !== "active"} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Livraisons" value={r.total_deliveries} />
          <Stat label="Gains $" value={Number(r.total_earnings_usd).toFixed(2)} />
          <Stat label="Note" value={`${Number(r.rating_avg).toFixed(1)} ★`} />
          <Stat label="Avis" value={r.rating_count} />
        </div>
      </div>

      <CallMeBotCard role="rider" currentKey={r.callmebot_apikey} currentPhone={r.whatsapp} />

      <RiderLiveShareCard />

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-4"><h3 className="font-display text-lg font-bold">Mes courses</h3></div>
        <div className="divide-y">
          {data.myDeliveries.length === 0 && <p className="p-6 text-sm text-muted-foreground">Pas encore de course assignée.</p>}
          {data.myDeliveries.map((o: any) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 p-4">
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium">{o.code || o.id.slice(0, 8)} · {o.customer_name}</p>
                <p className="text-xs text-muted-foreground">
                  <MapPin className="inline h-3 w-3" /> {o.zone} → {o.customer_address}
                </p>
                <p className="text-xs text-muted-foreground">📞 {o.customer_phone} · ${Number(o.total_usd).toFixed(2)}</p>
              </div>
              <Badge className={statusColor(o.status)} variant="outline">{o.status}</Badge>
              {o.customer_lat != null && o.customer_lng != null && (
                <Button asChild size="sm" variant="outline">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.customer_lat},${o.customer_lng}`} target="_blank" rel="noreferrer">
                    <MapPin className="h-4 w-4" /> Itinéraire
                  </a>
                </Button>
              )}
              {o.status === "ready" && (
                <Button size="sm" variant="outline" onClick={() => onStatus(o.id, "picked_up")}>Récupéré</Button>
              )}
              {o.status === "picked_up" && (
                <>
                  <Button size="sm" onClick={() => onStatus(o.id, "delivered")}>Livré</Button>
                  {o.payment_status !== "paid" && (
                    <Button size="sm" variant="outline" onClick={() => onCash(o.id, Number(o.total_usd))}>
                      <DollarSign className="h-4 w-4" /> Cash ${Number(o.total_usd).toFixed(2)}
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Courses disponibles</h3>
          <Badge variant="outline">{avail?.orders?.length ?? 0}</Badge>
        </div>
        <div className="divide-y">
          {(!avail?.orders || avail.orders.length === 0) && (
            <p className="p-6 text-sm text-muted-foreground">
              {r.status !== "active" ? "Active ton compte pour voir les courses." : r.is_available ? "Aucune course en attente." : "Active ta disponibilité pour prendre des courses."}
            </p>
          )}
          {(avail?.orders ?? []).map((o: any) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 p-4">
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium">{o.code || o.id.slice(0, 8)} · {o.customer_name}</p>
                <p className="text-xs text-muted-foreground"><MapPin className="inline h-3 w-3" /> {o.zone} · {o.customer_address}</p>
                <p className="text-xs text-muted-foreground">${Number(o.total_usd).toFixed(2)} · livraison à négocier</p>
                {o.customer_lat != null && o.customer_lng != null && (
                  <a href={`https://maps.google.com/?q=${o.customer_lat},${o.customer_lng}`} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[color:var(--brand-dark)] hover:underline">
                    📍 Position GPS partagée
                  </a>
                )}
              </div>
              <Button size="sm" onClick={() => onClaim(o.id)} disabled={!r.is_available}>
                Prendre
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- ADMIN ---------------- */
function AdminPanel() {
  const qc = useQueryClient();
  const fetchAdmin = useServerFn(getAdminDashboard);
  const setVendor = useServerFn(adminUpdateVendorStatus);
  const setRider = useServerFn(adminUpdateRiderStatus);
  const setProd = useServerFn(adminApproveProduct);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-dash"], queryFn: () => fetchAdmin() });

  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-dash"] });

  const onVendor = async (vendor_id: string, status: any) => {
    try { await setVendor({ data: { vendor_id, status } }); toast.success("Vendeur mis à jour"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onRider = async (rider_id: string, status: any) => {
    try { await setRider({ data: { rider_id, status } }); toast.success("Livreur mis à jour"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onProd = async (product_id: string, approved: boolean) => {
    try { await setProd({ data: { product_id, approved } }); toast.success("Produit mis à jour"); refresh(); }
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
      </div>

      <AdminRatePanel />

      <AdminIntegrationsPanel />

      <Suspense fallback={<ChartFallback />}><AdminAnalyticsPanel /></Suspense>

      <AdminReportsPanel reports={data.reports ?? []} onRefresh={refresh} />

      <AdminUsersPanel />

      <AdminList title="Vendeurs" rows={data.vendors} render={(v: any) => (
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
      )} />

      <AdminList title="Livreurs" rows={data.riders} render={(r: any) => (
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
      )} />

      <AdminList title="Produits à valider" rows={data.products.filter((p: any) => !p.approved)} render={(p: any) => (
        <>
          <div className="text-xl">{p.emoji || "📦"}</div>
          <div className="flex-1">
            <p className="font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">${Number(p.price_usd).toFixed(2)} · {p.category}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onProd(p.id, true)}><CheckCircle2 className="h-4 w-4" /> Approuver</Button>
        </>
      )} />

      <AdminList title="Commandes récentes" rows={data.orders.slice(0, 15)} render={(o: any) => (
        <>
          <div className="flex-1">
            <p className="font-medium">{o.code || o.id.slice(0, 8)} · {o.customer_name}</p>
            <p className="text-xs text-muted-foreground">{o.zone} · ${Number(o.total_usd).toFixed(2)}</p>
          </div>
          <Badge className={statusColor(o.status)} variant="outline">{o.status}</Badge>
        </>
      )} />

      <AdminCouponsPanel />

      <AdminZonesPanel zones={data.zones} onRefresh={refresh} />
    </div>
  );
}

/* ---------------- VENDOR: Shop editor ---------------- */
function VendorShopCard({ vendor, onDone }: { vendor: any; onDone: () => void }) {
  const updateShop = useServerFn(vendorUpdateShop);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    shop_name: vendor.shop_name ?? "",
    description: vendor.description ?? "",
    whatsapp: vendor.whatsapp ?? "",
    logo_url: vendor.logo_url ?? "",
    cover_url: vendor.cover_url ?? "",
    mobile_money_number: vendor.mobile_money_number ?? "",
    mobile_money_name: vendor.mobile_money_name ?? "",
  });
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [saving, setSaving] = useState(false);

  const uploadImage = async (file: File, type: "logo" | "cover") => {
    setUploading(type);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connecté");
      file = await compressImage(file, { maxSize: 1024 });
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${session.user.id}/vendor-${type}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("products").upload(path, file, {
        cacheControl: "31536000", upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("products").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr || !signed) throw sErr ?? new Error("URL impossible");
      setForm((f) => ({ ...f, [`${type}_url`]: signed.signedUrl }));
      toast.success(`${type === "logo" ? "Logo" : "Couverture"} téléversé`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur upload");
    } finally {
      setUploading(null);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateShop({ data: {
        shop_name: form.shop_name,
        description: form.description || null,
        whatsapp: form.whatsapp,
        logo_url: form.logo_url || null,
        cover_url: form.cover_url || null,
        mobile_money_number: form.mobile_money_number.trim() || null,
        mobile_money_name: form.mobile_money_name.trim() || null,
      }});
      toast.success("Boutique mise à jour");
      setOpen(false);
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      {/* Cover preview */}
      <div className="relative h-28 overflow-hidden rounded-t-2xl bg-gradient-to-br from-[color:var(--brand-dark)] to-[color:var(--brand-light)]">
        {form.cover_url && (
          <img src={form.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        )}
      </div>
      <div className="p-5 -mt-8 flex items-end justify-between gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border-4 border-card bg-[color:var(--brand-light)] overflow-hidden text-2xl shadow-sm">
          {form.logo_url
            ? <img src={form.logo_url} alt={vendor.shop_name} className="h-full w-full object-cover" />
            : <Store className="h-7 w-7 text-muted-foreground" />}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Pencil className="h-4 w-4" /> Modifier la boutique
        </Button>
      </div>

      {open && (
        <form onSubmit={onSave} className="grid gap-4 border-t p-5 md:grid-cols-2">
          <div>
            <Label>Nom de la boutique</Label>
            <Input required value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} className="mt-1.5" maxLength={80} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input required value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="mt-1.5" placeholder="+243..." />
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5" maxLength={500} />
          </div>

          {/* Mobile Money — affiché au client qui paie par M-Pesa / Airtel / Orange */}
          <div className="md:col-span-2 rounded-xl border border-dashed bg-muted/30 p-3">
            <p className="text-sm font-semibold">📱 Paiement Mobile Money (optionnel)</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Affiché au client s'il choisit M-Pesa, Airtel Money ou Orange Money. Laisse vide pour cash uniquement.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Numéro Mobile Money</Label>
                <Input
                  value={form.mobile_money_number}
                  onChange={(e) => setForm({ ...form, mobile_money_number: e.target.value })}
                  className="mt-1.5"
                  placeholder="+243 ..."
                  maxLength={30}
                  inputMode="tel"
                />
              </div>
              <div>
                <Label className="text-xs">Nom du compte</Label>
                <Input
                  value={form.mobile_money_name}
                  onChange={(e) => setForm({ ...form, mobile_money_name: e.target.value })}
                  className="mt-1.5"
                  placeholder="Ex : MOISE BYAMUNGU"
                  maxLength={80}
                />
              </div>
            </div>
          </div>

          {/* Logo upload */}
          <div>
            <Label>Logo de la boutique</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {form.logo_url && (
                <img src={form.logo_url} alt="logo" className="h-12 w-12 rounded-lg object-cover border" />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40">
                {uploading === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {form.logo_url ? "Changer" : "Uploader"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "logo"); }} />
              </label>
            </div>
          </div>

          {/* Cover upload */}
          <div>
            <Label>Image de couverture</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {form.cover_url && (
                <img src={form.cover_url} alt="cover" className="h-12 w-20 rounded-lg object-cover border" />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40">
                {uploading === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {form.cover_url ? "Changer" : "Uploader"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "cover"); }} />
              </label>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="md:col-span-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer les modifications"}
          </Button>
        </form>
      )}
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

function AdminList({ title, rows, render }: { title: string; rows: any[]; render: (r: any) => React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      <div className="divide-y">
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Vide.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">{render(r)}</div>
        ))}
      </div>
    </div>
  );
}

function AdminReportsPanel({ reports, onRefresh }: { reports: any[]; onRefresh: () => void }) {
  const resolve = useServerFn(adminResolveReport);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const rows = filter === "open" ? reports.filter((r) => r.status === "open" || r.status === "reviewing") : reports;

  const act = async (report_id: string, status: "resolved" | "dismissed" | "reviewing") => {
    try {
      await resolve({ data: { report_id, status } });
      toast.success(status === "resolved" ? "Signalement résolu" : status === "dismissed" ? "Signalement rejeté" : "Marqué en revue");
      onRefresh();
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
          <Badge variant="outline">{rows.length}</Badge>
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