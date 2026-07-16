import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, lazy, Suspense } from "react";
import { toast } from "sonner";
import { Store, Plus, Upload, Loader2, Pencil, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  getVendorDashboard,
  createProduct,
  updateOrderStatusVendor,
  vendorUpdateProduct,
  vendorDeleteProduct,
  vendorUpdateShop,
} from "@/lib/vendor.functions";
import { notifyOrderStatusChanged } from "@/lib/notifications.functions";
import { uploadProductImage } from "@/lib/image";
import { CATEGORY_LIST } from "@/components/livroto/products";
import { useI18n } from "@/lib/i18n";
import { statusColor, Stat, CallMeBotCard } from "./shared";

// Graphique recharts (~500 kB) chargé à la demande -> bundle dashboard plus léger.
const VendorAnalyticsPanel = lazy(() =>
  import("@/components/livroto/charts/AnalyticsPanels").then((m) => ({
    default: m.VendorAnalyticsPanel,
  })),
);
const ChartFallback = () => <div className="h-52 animate-pulse rounded-2xl bg-muted" />;

/* ---------------- VENDOR ---------------- */
export function VendorPanel() {
  const { t } = useI18n();
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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `vendor_id=eq.${vendorId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-dash"] });
          toast.info(t("vendor.toast.newOrder"));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [(data?.vendor as any)?.id]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "phone_accessories" as "phone_accessories" | "local_food" | "delivery_service",
    subcategory_id: "" as string,
    price_usd: "",
    stock: "1",
    emoji: "📱",
    description: "",
    images: [] as string[],
  });
  const [subcats, setSubcats] = useState<
    { id: string; name: string; emoji: string | null; parent_category: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

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
      const url = await uploadProductImage(file);
      setForm((f) => {
        if (f.images.length >= 5) {
          toast.error(t("vendor.toast.maxPhotos"));
          return f;
        }
        return { ...f, images: [...f.images, url] };
      });
      toast.success(t("vendor.toast.photoUploaded"));
    } catch (e: any) {
      toast.error(e.message ?? t("vendor.toast.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (!data?.vendor) return <p>{t("vendor.noShop")}</p>;

  const v = data.vendor as any;
  const stats = data.stats!;

  const submitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    // Anti double-soumission : sur 2G un envoi peut durer plusieurs secondes, un
    // double-tap créait le produit en double (vu en prod le 4/07/2026).
    if (creating) return;
    if (!form.subcategory_id) {
      toast.error(t("vendor.toast.needSubcat"));
      return;
    }
    setCreating(true);
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
      toast.success(t("vendor.toast.productCreated"));
      setOpen(false);
      setForm({
        name: "",
        category: "phone_accessories",
        subcategory_id: "",
        price_usd: "",
        stock: "1",
        emoji: "📦",
        description: "",
        images: [],
      });
      qc.invalidateQueries({ queryKey: ["vendor-dash"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (order_id: string, status: any) => {
    try {
      await updateStatus({ data: { order_id, status } });
      toast.success(t("vendor.toast.statusUpdated"));
      qc.invalidateQueries({ queryKey: ["vendor-dash"] });
      notifyStatus({ data: { order_id, status } }).catch(() => {});
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">{v.shop_name}</h2>
            <Badge className={statusColor(v.status)} variant="outline">
              {v.status}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("vendor.stats.products")} value={stats.productsCount} />
            <Stat label={t("vendor.stats.orders")} value={stats.ordersCount} />
            <Stat label={t("vendor.stats.pending")} value={stats.pending} />
            <Stat label={t("vendor.stats.revenue")} value={stats.revenueUsd.toFixed(2)} />
          </div>
        </div>
      </div>

      <VendorShopCard
        vendor={v}
        onDone={() => qc.invalidateQueries({ queryKey: ["vendor-dash"] })}
      />

      <Suspense fallback={<ChartFallback />}>
        <VendorAnalyticsPanel />
      </Suspense>

      <CallMeBotCard role="vendor" currentKey={v.callmebot_apikey} currentPhone={v.whatsapp} />

      <div className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-display text-lg font-bold">{t("vendor.myProducts.title")}</h3>
          <Button size="sm" onClick={() => setOpen(!open)}>
            <Plus className="h-4 w-4" /> {t("vendor.addBtn")}
          </Button>
        </div>
        {open && (
          <form onSubmit={submitProduct} className="grid gap-3 border-b p-4 md:grid-cols-2">
            <div>
              <Label>{t("vendor.form.name")}</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("vendor.form.category")}</Label>
              <Select
                value={form.category}
                onValueChange={(v: any) => {
                  const emoji = CATEGORY_LIST.find((c) => c.id === v)?.emoji ?? form.emoji;
                  setForm({ ...form, category: v, subcategory_id: "", emoji });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>
                {t("vendor.form.subcategory")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.subcategory_id}
                onValueChange={(v) => setForm({ ...form, subcategory_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("vendor.form.subcategoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {subOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.emoji ? `${s.emoji} ` : ""}
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.form.subcatCount").replace("{n}", String(subOptions.length))}
              </p>
            </div>
            <div>
              <Label>{t("vendor.form.price")}</Label>
              <Input
                type="number"
                step="0.5"
                required
                value={form.price_usd}
                onChange={(e) => setForm({ ...form, price_usd: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("vendor.form.stock")}</Label>
              <Input
                type="number"
                required
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t("vendor.form.description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t("vendor.form.photosLabel")}</Label>
              <div className="mt-1.5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {form.images.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative h-20 w-20 rounded-lg overflow-hidden border group"
                    >
                      <img
                        src={url}
                        alt={t("vendor.form.photoAlt").replace("{n}", String(idx + 1))}
                        className="h-full w-full object-cover"
                      />
                      {idx === 0 && (
                        <span className="absolute top-1 left-1 rounded bg-primary px-1 py-0.5 text-[10px] font-bold text-primary-foreground">
                          {t("vendor.form.firstPhoto")}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))
                        }
                        className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground text-xs opacity-0 group-hover:opacity-100"
                        aria-label={t("vendor.form.removePhoto")}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {form.images.length < 5 && (
                    <button
                      type="button"
                      onClick={() => document.getElementById("prod-img")?.click()}
                      disabled={uploading}
                      className="h-20 w-20 grid place-items-center rounded-lg border-2 border-dashed text-muted-foreground hover:bg-muted/40"
                    >
                      {uploading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Upload className="h-5 w-5" />
                      )}
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
                <p className="text-xs text-muted-foreground">
                  {t("vendor.form.photoHint")}
                </p>
              </div>
            </div>
            <Button type="submit" disabled={creating} className="md:col-span-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("vendor.createProductBtn")}
            </Button>
          </form>
        )}
        <div className="divide-y">
          {data.products.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">{t("vendor.myProducts.empty")}</p>
          )}
          {data.products.map((p: any) => (
            <VendorProductRow
              key={p.id}
              product={p}
              onUpdate={async (patch) => {
                try {
                  await updateP({ data: { product_id: p.id, ...patch } });
                  toast.success(t("vendor.toast.updated"));
                  qc.invalidateQueries({ queryKey: ["vendor-dash"] });
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
              onDelete={async () => {
                if (!confirm(t("vendor.confirmDelete").replace("{name}", p.name))) return;
                try {
                  await deleteP({ data: { product_id: p.id } });
                  toast.success(t("vendor.toast.deleted"));
                  qc.invalidateQueries({ queryKey: ["vendor-dash"] });
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-4">
          <h3 className="font-display text-lg font-bold">{t("vendor.orders.title")}</h3>
        </div>
        <div className="divide-y">
          {data.orders.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">{t("vendor.orders.empty")}</p>
          )}
          {data.orders.map((o: any) => (
            <div key={o.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">
                    #{o.code || o.id.slice(0, 8)} · {o.customer_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    📍 {o.zone} · 📞 {o.customer_phone} · ${Number(o.total_usd).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <Badge className={statusColor(o.status)} variant="outline">
                  {t(`order.status.${o.status}`)}
                </Badge>
                <Select value={o.status} onValueChange={(s) => changeStatus(o.id, s)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { v: "pending", l: t("vendor.statusAction.pending") },
                      { v: "confirmed", l: t("vendor.statusAction.confirm") },
                      { v: "ready", l: t("vendor.statusAction.ready") },
                      { v: "picked_up", l: t("vendor.statusAction.pickedUp") },
                      { v: "delivered", l: t("vendor.statusAction.delivered") },
                      { v: "cancelled", l: t("vendor.statusAction.cancel") },
                    ].map(({ v, l }) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Articles de la commande */}
              {(o.items ?? []).length > 0 && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                  {(o.items as any[]).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>
                        {it.product_name} × {it.quantity}
                      </span>
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

// ISO -> valeur d'<input type="datetime-local"> (heure locale)
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function VendorProductRow({
  product,
  onUpdate,
  onDelete,
}: {
  product: any;
  onUpdate: (patch: {
    price_usd?: number;
    stock?: number;
    name?: string;
    images?: string[];
    promo_price_usd?: number | null;
    promo_starts_at?: string | null;
    promo_ends_at?: string | null;
    promo_active?: boolean;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [price, setPrice] = useState(String(product.price_usd));
  const [stock, setStock] = useState(String(product.stock));
  const [images, setImages] = useState<string[]>(
    product.images ?? (product.image_url ? [product.image_url] : []),
  );
  const [uploading, setUploading] = useState(false);
  const [promoPrice, setPromoPrice] = useState(
    product.promo_price_usd != null ? String(product.promo_price_usd) : "",
  );
  const [promoStart, setPromoStart] = useState(toLocalInput(product.promo_starts_at));
  const [promoEnd, setPromoEnd] = useState(toLocalInput(product.promo_ends_at));
  const [promoActive, setPromoActive] = useState(!!product.promo_active);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setImages((prev) => (prev.length >= 5 ? prev : [...prev, url]));
      toast.success(t("vendor.toast.photoAdded"));
    } catch (e: any) {
      toast.error(e.message ?? t("vendor.toast.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-[color:var(--brand-light)] grid place-items-center text-xl">
          {images[0] ? (
            <img src={images[0]} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <span>{product.emoji || "📦"}</span>
          )}
        </div>
        <div className="flex-1 min-w-[160px]">
          <p className="font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            ${Number(product.price_usd).toFixed(2)} ·{" "}
            <span
              className={
                product.stock === 0
                  ? "font-semibold text-destructive"
                  : product.stock <= 5
                    ? "font-semibold text-orange-600 dark:text-orange-400"
                    : ""
              }
            >
              {t("vendor.product.stockLabel")} {product.stock}
              {product.stock === 0 ? ` ${t("vendor.product.outOfStock")}` : product.stock <= 5 ? ` ${t("vendor.product.lowStock")}` : ""}
            </span>
            {product.subcategory && (
              <>
                {" "}
                · {product.subcategory.emoji} {product.subcategory.name}
              </>
            )}
          </p>
        </div>
        <Badge
          variant="outline"
          className={product.approved ? "border-primary/30 text-primary" : ""}
        >
          {product.approved ? t("vendor.product.approved") : t("vendor.product.pendingApproval")}
        </Badge>
        {product.promo_price_usd != null && (
          <Badge
            variant="outline"
            className={
              product.promo_active && product.promo_approved
                ? "border-red-500/40 text-red-600"
                : "border-amber-500/40 text-amber-600"
            }
          >
            {product.promo_active && product.promo_approved
              ? t("vendor.promo.active")
              : t("vendor.promo.pending")}
          </Badge>
        )}
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEdit((v) => !v)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {edit && (
        <div className="rounded-xl border bg-background p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-28"
              type="number"
              step="0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("vendor.form.pricePlaceholder")}
            />
            <Input
              className="w-24"
              type="number"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder={t("vendor.form.stock")}
            />
            <Button
              size="sm"
              onClick={async () => {
                await onUpdate({
                  price_usd: Number(price),
                  stock: Number(stock),
                  images,
                  promo_price_usd: promoPrice.trim() ? Number(promoPrice) : null,
                  promo_starts_at: promoStart ? new Date(promoStart).toISOString() : null,
                  promo_ends_at: promoEnd ? new Date(promoEnd).toISOString() : null,
                  promo_active: promoActive,
                });
                setEdit(false);
              }}
            >
              {t("vendor.saveBtn")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
              {t("vendor.cancelBtn")}
            </Button>
          </div>

          {/* Promotion (prix barré) — validée par l'admin avant affichage */}
          <div className="rounded-lg border border-dashed border-red-300/60 bg-red-50/40 dark:bg-red-500/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">
              {t("vendor.promo.sectionTitle")}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground">{t("vendor.promo.priceLabel")}</label>
                <Input
                  className="w-32 mt-0.5"
                  type="number"
                  step="0.5"
                  min={0}
                  value={promoPrice}
                  onChange={(e) => setPromoPrice(e.target.value)}
                  placeholder={`< ${Number(product.price_usd).toFixed(2)}`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground">{t("vendor.promo.startLabel")}</label>
                <Input
                  className="mt-0.5 h-10"
                  type="datetime-local"
                  value={promoStart}
                  onChange={(e) => setPromoStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground">{t("vendor.promo.endLabel")}</label>
                <Input
                  className="mt-0.5 h-10"
                  type="datetime-local"
                  value={promoEnd}
                  onChange={(e) => setPromoEnd(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm pb-2">
                <input
                  type="checkbox"
                  checked={promoActive}
                  onChange={(e) => setPromoActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {t("vendor.promo.activate")}
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("vendor.promo.priceHint").replace("{price}", Number(product.price_usd).toFixed(2))}{" "}
              {t("vendor.promo.validationBefore")}{" "}
              <b>{t("vendor.promo.validationBold")}</b> {t("vendor.promo.validationAfter")}
            </p>
          </div>
          {/* Images */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">{t("vendor.product.photosCount").replace("{n}", String(images.length))}</p>
            <div className="flex flex-wrap gap-2">
              {images.map((url, idx) => (
                <div
                  key={idx}
                  className="group relative h-16 w-16 overflow-hidden rounded-lg border"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 text-white text-lg"
                    aria-label={t("vendor.form.removePhoto")}
                  >
                    ×
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed text-muted-foreground hover:bg-muted/40">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- VENDOR: Shop editor ---------------- */
function VendorShopCard({ vendor, onDone }: { vendor: any; onDone: () => void }) {
  const { t } = useI18n();
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
      const url = await uploadProductImage(file, {
        maxSize: 1024,
        pathPrefix: `vendor-${type}`,
        upsert: true,
      });
      setForm((f) => ({ ...f, [`${type}_url`]: url }));
      toast.success(type === "logo" ? t("vendor.shop.uploadedLogo") : t("vendor.shop.uploadedCover"));
    } catch (e: any) {
      toast.error(e.message ?? t("vendor.toast.uploadError"));
    } finally {
      setUploading(null);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateShop({
        data: {
          shop_name: form.shop_name,
          description: form.description || null,
          whatsapp: form.whatsapp,
          logo_url: form.logo_url || null,
          cover_url: form.cover_url || null,
          mobile_money_number: form.mobile_money_number.trim() || null,
          mobile_money_name: form.mobile_money_name.trim() || null,
        },
      });
      toast.success(t("vendor.toast.shopUpdated"));
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card">
      {/* Cover preview */}
      <div className="relative h-28 overflow-hidden rounded-t-2xl bg-gradient-to-br from-[color:var(--brand-dark)] to-[color:var(--brand-light)]">
        {form.cover_url && (
          <img
            src={form.cover_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
          />
        )}
      </div>
      <div className="p-5 -mt-8 flex items-end justify-between gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border-4 border-card bg-[color:var(--brand-light)] overflow-hidden text-2xl shadow-sm">
          {form.logo_url ? (
            <img
              src={form.logo_url}
              alt={vendor.shop_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Store className="h-7 w-7 text-muted-foreground" />
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Pencil className="h-4 w-4" /> {t("vendor.shop.editBtn")}
        </Button>
      </div>

      {open && (
        <form onSubmit={onSave} className="grid gap-4 border-t p-5 md:grid-cols-2">
          <div>
            <Label>{t("vendor.shop.nameLabel")}</Label>
            <Input
              required
              value={form.shop_name}
              onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
              className="mt-1.5"
              maxLength={80}
            />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input
              required
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="mt-1.5"
              placeholder="+243..."
            />
          </div>
          <div className="md:col-span-2">
            <Label>{t("vendor.form.description")}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1.5"
              maxLength={500}
            />
          </div>

          {/* Mobile Money — affiché au client qui paie par M-Pesa / Airtel / Orange */}
          <div className="md:col-span-2 rounded-xl border border-dashed bg-muted/30 p-3">
            <p className="text-sm font-semibold">{t("vendor.shop.mobileMoneyTitle")}</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              {t("vendor.shop.mobileMoneyDesc")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("vendor.shop.mmNumberLabel")}</Label>
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
                <Label className="text-xs">{t("vendor.shop.mmNameLabel")}</Label>
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
            <Label>{t("vendor.shop.logoLabel")}</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {form.logo_url && (
                <img
                  src={form.logo_url}
                  alt="logo"
                  className="h-12 w-12 rounded-lg object-cover border"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40">
                {uploading === "logo" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {form.logo_url ? t("vendor.shop.changeBtn") : t("vendor.shop.uploadBtn")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f, "logo");
                  }}
                />
              </label>
            </div>
          </div>

          {/* Cover upload */}
          <div>
            <Label>{t("vendor.shop.coverLabel")}</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {form.cover_url && (
                <img
                  src={form.cover_url}
                  alt="cover"
                  className="h-12 w-20 rounded-lg object-cover border"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40">
                {uploading === "cover" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                {form.cover_url ? t("vendor.shop.changeBtn") : t("vendor.shop.uploadBtn")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f, "cover");
                  }}
                />
              </label>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="md:col-span-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("vendor.shop.saveBtn")
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
