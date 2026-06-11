import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trash2, Plus, Minus, MessageCircle, ShoppingCart, Loader2, Tag, X } from "lucide-react";
import { toast } from "sonner";

import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { LandmarkPicker } from "@/components/livroto/LandmarkPicker";
import { RecommendedProducts } from "@/components/livroto/RecommendedProducts";
import { FlexPayDialog } from "@/components/livroto/FlexPayDialog";
import { offlineQueue, isOnline } from "@/lib/offline-queue";
import { LIVROTO_WHATSAPP } from "@/lib/whatsapp";
import { useServerFn } from "@tanstack/react-start";
import { notifyOrderCreated } from "@/lib/notifications.functions";
import { notifyOrderCreatedSMS } from "@/lib/sms.functions";
import { validateCoupon, recordCouponUse } from "@/lib/coupons.functions";
import { getMyReferral, redeemCreditForOrder } from "@/lib/referrals.functions";
import { getMyAddresses, saveAddress, type SavedAddress } from "@/lib/addresses.functions";

type Zone = { id: string; name: string; delivery_fee_usd: number };
type Payment = "cash" | "mpesa" | "airtel_money" | "orange_money";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({
    meta: [
      { title: "Mon panier — Livroto" },
      { name: "description", content: "Finalise ta commande Livroto à Bunia. Paiement cash, M-Pesa, Airtel Money ou Orange Money." },
    ],
  }),
});

function CartPage() {
  const { items, count, subtotal, setQty, remove, clear } = useCart();
  const { t } = useI18n();
  const navigate = useNavigate();
  const notify = useServerFn(notifyOrderCreated);
  const notifySMS = useServerFn(notifyOrderCreatedSMS);
  const validate = useServerFn(validateCoupon);
  const recordUse = useServerFn(recordCouponUse);
  const getReferral = useServerFn(getMyReferral);
  const redeem = useServerFn(redeemCreditForOrder);
  const fetchAddresses = useServerFn(getMyAddresses);
  const persistAddress = useServerFn(saveAddress);

  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [saveThis, setSaveThis] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [payment, setPayment] = useState<Payment>("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [credit, setCredit] = useState(0);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; description: string | null } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  // FlexPay (paiement mobile money en ligne) — activé via l'admin
  const [flexpayEnabled, setFlexpayEnabled] = useState(false);
  const [fp, setFp] = useState<{ orderId: string; label: string } | null>(null);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "flexpay_enabled").maybeSingle()
      .then(({ data }) => setFlexpayEnabled(data?.value === "true"));
  }, []);

  // Crédit Livroto (parrainage) — auto-appliqué au panier
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try { const r = await getReferral(); setCredit(Number(r.credit_usd ?? 0)); } catch {}
    })();
  }, [getReferral]);

  useEffect(() => {
    (async () => {
      const [{ data: z }, { data: s }] = await Promise.all([
        supabase.from("zones").select("id,name,delivery_fee_usd").eq("active", true).order("name"),
        supabase.auth.getSession(),
      ]);
      if (z) {
        const zs = z.map((zz) => ({ ...zz, delivery_fee_usd: Number(zz.delivery_fee_usd) }));
        setZones(zs);
        if (zs[0]) setZoneId(zs[0].id);
      }
      if (s.session) {
        const { data: prof } = await supabase
          .from("profiles").select("name,phone").eq("id", s.session.user.id).maybeSingle();
        if (prof?.name) setName(prof.name);
        if (prof?.phone) setPhone(prof.phone);
        try {
          const { addresses } = await fetchAddresses();
          setSavedAddresses(addresses);
          // Pré-remplit avec l'adresse par défaut (ou la plus récente) → moins de saisie.
          const def = addresses.find((a) => a.is_default) ?? addresses[0];
          if (def) {
            setAddress((cur) => cur || def.address);
            if (def.zone_id) setZoneId(def.zone_id);
            if (def.lat != null && def.lng != null) setCoords({ lat: def.lat, lng: def.lng });
          }
        } catch { /* table absente / non connecté → on ignore */ }
      }
    })();
  }, []);

  const selectedZone = zones.find((z) => z.id === zoneId);
  const zoneName = selectedZone?.name ?? "";

  // Group items by vendor → one order per vendor
  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const it of items) {
      const key = it.vendor_id ?? "__nov__";
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([vendor_id, list]) => ({
      vendor_id: vendor_id === "__nov__" ? null : vendor_id,
      items: list,
      subtotal: list.reduce((s, i) => s + i.qty * i.price_usd, 0),
    }));
  }, [items]);

  const grandTotal = subtotal;
  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
  const payable = Math.max(0, subtotal - discount);
  // Crédit appliqué : plafonné au montant payable de la 1ʳᵉ commande (où il est imputé)
  const firstGroupSubtotal = groups[0]?.subtotal ?? 0;
  const firstGroupPayable = Math.max(0, firstGroupSubtotal - Math.min(discount, firstGroupSubtotal));
  const creditApplied = Math.min(credit, firstGroupPayable);
  const finalPayable = Math.max(0, payable - creditApplied);
  // Frais de livraison FIXE par zone (transparent) — un frais par livraison (par groupe vendeur).
  const deliveryFee = selectedZone?.delivery_fee_usd ?? 0;
  const deliveryTotal = deliveryFee * Math.max(1, groups.length);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setValidatingCoupon(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Connecte-toi pour utiliser un code promo");
        navigate({ to: "/auth" });
        return;
      }
      const res = await validate({ data: { code, subtotal } });
      if (!res.ok) {
        toast.error(res.error);
        setCoupon(null);
        return;
      }
      setCoupon({ code: res.code, discount: res.discount, description: res.description });
      toast.success(`Code "${res.code}" appliqué : -$${res.discount.toFixed(2)}`);
    } catch (e: any) {
      toast.error(e.message ?? "Code invalide");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => { setCoupon(null); setCouponInput(""); };

  const captureLocation = () => {
    if (!navigator.geolocation) { toast.error(t("cart.toast.gpsOff")); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        setGeoBusy(false);
        toast.success(t("cart.toast.gpsOk"));
      },
      () => { setGeoBusy(false); toast.error(t("cart.toast.gpsFail")); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const checkout = async () => {
    if (!name || !phone || !address) {
      toast.error(t("cart.toast.fill"));
      return;
    }
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t("cart.toast.signin"));
        navigate({ to: "/auth" });
        return;
      }

      // Mode hors-ligne : mettre en file d'attente
      if (!isOnline()) {
        for (const g of groups) {
          const first = g.items[0];
          const groupDiscount = Math.min(discount, g.subtotal);
          offlineQueue.add({
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            customerName: name,
            zone: zoneName,
            payload: {
              customer_name: name,
              customer_phone: phone,
              customer_address: address,
              zone: zoneName,
              zone_id: selectedZone?.id ?? null,
              product_id: first.id,
              vendor_id: g.vendor_id,
              quantity: g.items.reduce((s, i) => s + i.qty, 0),
              subtotal_usd: g.subtotal,
              total_usd: Math.max(0, g.subtotal - groupDiscount),
              delivery_fee: deliveryFee,
              payment_method: payment,
              customer_notes: notes || null,
              coupon_code: coupon?.code ?? null,
              discount_usd: groupDiscount,
              customer_lat: coords?.lat ?? null,
              customer_lng: coords?.lng ?? null,
              status: "pending",
            },
            items: g.items.map((it) => ({
              product_id: it.id,
              vendor_id: g.vendor_id,
              product_name: it.name,
              unit_price_usd: it.price_usd,
              quantity: it.qty,
              line_total_usd: it.qty * it.price_usd,
            })),
          });
        }
        clear();
        toast.success(t("cart.toast.offline"), {
          description: t("cart.toast.offlineDesc"),
        });
        setTimeout(() => navigate({ to: "/" }), 1000);
        return;
      }

      // Enregistre l'adresse pour les prochaines commandes (non bloquant).
      if (saveThis && address.trim()) {
        try {
          await persistAddress({
            data: {
              label: saveLabel.trim() || zoneName || "Mon adresse",
              address: address.trim(),
              zone_id: selectedZone?.id ?? null,
              lat: coords?.lat ?? null,
              lng: coords?.lng ?? null,
              is_default: savedAddresses.length === 0,
            },
          });
        } catch { /* non bloquant : ne casse pas la commande */ }
      }

      const createdCodes: string[] = [];
      let firstOrderId: string | null = null;
      // Apply the discount entirely on the first order group
      let discountToApply = discount;

      for (const g of groups) {
        // Primary product = first item of the group (for legacy orders.product_id)
        const first = g.items[0];
        const groupDiscount = Math.min(discountToApply, g.subtotal);
        discountToApply -= groupDiscount;
        const groupTotal = Math.max(0, g.subtotal - groupDiscount);
        const totalQty = g.items.reduce((s, i) => s + i.qty, 0);

        const { data: order, error: oErr } = await supabase.from("orders").insert({
          customer_id: session.user.id,
          customer_name: name,
          customer_phone: phone,
          customer_address: address,
          zone: zoneName,
          zone_id: selectedZone?.id ?? null,
          product_id: first.id,
          vendor_id: g.vendor_id,
          quantity: totalQty,
          subtotal_usd: g.subtotal,
          total_usd: groupTotal,
          delivery_fee: deliveryFee,
          payment_method: payment,
          customer_notes: notes || null,
          coupon_code: coupon && groupDiscount > 0 ? coupon.code : null,
          discount_usd: groupDiscount,
          customer_lat: coords?.lat ?? null,
          customer_lng: coords?.lng ?? null,
          status: "pending",
        }).select("id,code").single();

        if (oErr) throw oErr;

        // Insert one line per item
        const lines = g.items.map((it) => ({
          order_id: order.id,
          product_id: it.id,
          vendor_id: g.vendor_id,
          product_name: it.name,
          unit_price_usd: it.price_usd,
          quantity: it.qty,
          line_total_usd: it.qty * it.price_usd,
        }));
        await supabase.from("order_items").insert(lines);

        if (order.code) createdCodes.push(order.code);
        if (!firstOrderId) firstOrderId = order.id;
        // Fire-and-forget WhatsApp auto-notification to vendor + available riders
        notify({ data: { order_id: order.id } }).catch(() => {});
      }

      // SMS de confirmation au client (une seule fois, fire-and-forget).
      // Garantit une notif même sans WhatsApp — utile en cas de réseau faible à Bunia.
      if (firstOrderId) {
        notifySMS({ data: { order_id: firstOrderId } }).catch(() => {});
      }

      if (coupon && discount > 0) {
        recordUse({ data: { code: coupon.code } }).catch(() => {});
      }

      // Crédit Livroto (parrainage) : imputé côté serveur sur la 1ʳᵉ commande (autorité serveur)
      let creditUsed = 0;
      if (firstOrderId && credit > 0) {
        try { const rc = await redeem({ data: { order_id: firstOrderId } }); creditUsed = Number(rc.used ?? 0); } catch {}
      }
      const finalTotal = Math.max(0, payable - creditUsed);

      // Paiement FlexPay en ligne : si activé + mobile money choisi + un seul vendeur,
      // on lance le push USSD et on suit le paiement dans une fenêtre dédiée.
      // (Le cas multi-vendeurs garde le flux WhatsApp classique.)
      if (flexpayEnabled && payment !== "cash" && groups.length === 1 && firstOrderId) {
        clear();
        setFp({ orderId: firstOrderId, label: `$${finalTotal.toFixed(2)}` });
        return;
      }

      // One WhatsApp message summarising the whole cart
      const summary = items.map((i) => `• ${i.name} x${i.qty} — $${(i.qty * i.price_usd).toFixed(2)}`).join("\n");
      const text =
        `Bonjour Livroto ! Nouvelle commande (${createdCodes.join(", ")}) :\n${summary}\n` +
        (coupon && discount > 0 ? `Code promo ${coupon.code} : -$${discount.toFixed(2)}\n` : "") +
        (creditUsed > 0 ? `Crédit Livroto : -$${creditUsed.toFixed(2)}\n` : "") +
        (coords ? `📍 Position GPS : https://maps.google.com/?q=${coords.lat},${coords.lng}\n` : "") +
        `Total produits : $${finalTotal.toFixed(2)}\n` +
        `Livraison (${zoneName}) : $${deliveryTotal.toFixed(2)}\n` +
        `*TOTAL À PAYER : $${(finalTotal + deliveryTotal).toFixed(2)}*\n` +
        `Adresse : ${address}, ${zoneName}. Paiement : ${payment}. Nom : ${name}.`;
      const waUrl = `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(text)}`;
      clear();
      toast.success(t("cart.toast.sent"));
      window.open(waUrl, "_blank");
      setTimeout(() => navigate({ to: "/orders" }), 800);
    } catch (e: any) {
      toast.error(e.message ?? t("cart.toast.error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <div className="text-center">
            <div className="grid place-items-center">
              <div className="h-20 w-20 grid place-items-center rounded-full bg-[color:var(--brand-light)]">
                <ShoppingCart className="h-10 w-10 text-[color:var(--brand-dark)]" />
              </div>
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold">{t("cart.empty.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("cart.empty.desc")}</p>
            <Button asChild className="mt-6"><Link to="/catalog">{t("cart.empty.cta")}</Link></Button>
          </div>
          <RecommendedProducts />
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link to="/catalog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("cart.continue")}
        </Link>

        <h1 className="mt-3 font-display text-3xl font-bold">{t("cart.title")} <Badge variant="outline" className="ml-2">{count} {count > 1 ? t("cart.articles") : t("cart.article")}</Badge></h1>

        <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr,1fr]">
          {/* Items grouped by vendor */}
          <div className="space-y-4">
            {groups.map((g, idx) => (
              <div key={g.vendor_id ?? `g-${idx}`} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t("cart.vendor")} {idx + 1} {g.vendor_id ? "" : t("cart.notLinked")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {deliveryFee > 0 ? `${t("cart.delivery")} $${deliveryFee.toFixed(2)}` : t("cart.deliveryTBD")}
                  </p>
                </div>
                <ul className="divide-y">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 py-3">
                      <div className="h-16 w-16 grid place-items-center overflow-hidden rounded-lg bg-[color:var(--brand-light)] text-3xl">
                        {it.image_url ? (
                          <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                        ) : (
                          <span>{it.emoji ?? "📦"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{it.name}</p>
                        <p className="text-sm text-muted-foreground">
                          ${it.price_usd.toFixed(2)} {t("cart.perUnit")}
                          {it.original_price_usd != null && it.original_price_usd > it.price_usd && (
                            <span className="ml-1.5 text-xs text-muted-foreground line-through">${it.original_price_usd.toFixed(2)}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8"
                                onClick={() => setQty(it.id, it.qty - 1)} disabled={it.qty <= 1}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center font-medium">{it.qty}</span>
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8"
                                onClick={() => setQty(it.id, it.qty + 1)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="w-20 text-right font-display font-semibold">
                        ${(it.qty * it.price_usd).toFixed(2)}
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => remove(it.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {groups.length > 1 && (
              <p className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                {t("cart.multiVendor").replace("{n}", String(groups.length))}
              </p>
            )}
          </div>

          {/* Checkout panel */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-display text-lg font-bold">{t("cart.deliveryInfo")}</h2>
              {savedAddresses.length > 0 && (
                <div>
                  <Label>{t("cart.myAddresses")}</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {savedAddresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAddress(a.address);
                          if (a.zone_id) setZoneId(a.zone_id);
                          if (a.lat != null && a.lng != null) setCoords({ lat: a.lat, lng: a.lng });
                          setSaveThis(false);
                        }}
                        className={`rounded-xl border px-3 py-2 text-left transition max-w-[220px] ${
                          address === a.address
                            ? "border-[color:var(--brand-dark)] bg-[color:var(--brand-light)]"
                            : "border-border hover:border-[color:var(--brand-dark)]/40"
                        }`}
                      >
                        <span className="block text-sm font-medium">{a.is_default ? "⭐ " : "📍 "}{a.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{a.address}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="c-name">{t("cart.yourName")}</Label>
                <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 min-h-[44px]" />
              </div>
              <div>
                <Label htmlFor="c-phone">WhatsApp</Label>
                <Input id="c-phone" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+243 ..." className="mt-1.5 min-h-[44px]" />
              </div>
              <LandmarkPicker
                value={address}
                onChange={setAddress}
                required
              />

              {address.trim() && !savedAddresses.some((a) => a.address === address.trim()) && (
                <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={saveThis}
                      onChange={(e) => setSaveThis(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {t("cart.saveAddress")}
                  </label>
                  {saveThis && (
                    <Input
                      value={saveLabel}
                      onChange={(e) => setSaveLabel(e.target.value)}
                      placeholder={t("cart.saveAddressPlaceholder")}
                      className="min-h-[40px]"
                      maxLength={40}
                    />
                  )}
                </div>
              )}

              {/* Partage de position GPS — aide le livreur à localiser (adresses informelles) */}
              <div className="rounded-xl border border-dashed border-[color:var(--brand-dark)]/40 bg-[color:var(--brand-light)]/40 p-3">
                {coords ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[color:var(--brand-dark)]">
                      {t("cart.gpsShared")}
                      <span className="block text-[11px] font-normal text-muted-foreground">{coords.lat}, {coords.lng}</span>
                    </p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCoords(null)}>{t("cart.remove")}</Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={captureLocation}
                    disabled={geoBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--brand-dark)] px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60 min-h-[44px]"
                  >
                    {geoBusy ? t("cart.locating") : t("cart.shareGps")}
                  </button>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t("cart.gpsHint")}
                </p>
              </div>

              <div>
                <Label htmlFor="c-zone">{t("order.zone")}</Label>
                <Select value={zoneId} onValueChange={setZoneId}>
                  <SelectTrigger id="c-zone" className="mt-1.5 min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="c-notes">{t("cart.note")}</Label>
                <Textarea id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 min-h-[56px]" placeholder={t("cart.notePlaceholder")} />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-lg font-bold mb-3">{t("cart.payment")}</h2>
              {flexpayEnabled && payment !== "cash" && (
                <p className="-mt-1 mb-3 rounded-lg bg-[color:var(--brand-light)] px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--brand-dark)]">
                  {t("cart.flexpayHint")}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "cash", label: "💵 Cash", hint: t("cart.atDelivery") },
                  { id: "mpesa", label: "📱 M-Pesa", hint: "Vodacom" },
                  { id: "airtel_money", label: "📱 Airtel Money", hint: "Airtel" },
                  { id: "orange_money", label: "📱 Orange", hint: "Orange Money" },
                ] as const).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPayment(p.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      payment === p.id
                        ? "border-[color:var(--brand-dark)] bg-[color:var(--brand-light)] ring-2 ring-[color:var(--brand-dark)]/30"
                        : "border-border hover:border-[color:var(--brand-dark)]/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground">{p.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-sm">
              {items.some((i) => (i.stock ?? 99) <= 5) && (
                <div className="-mt-1 mb-1 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  {t("cart.stockLimited")}
                </div>
              )}
              <div className="flex justify-between"><span>{t("cart.subtotal")}</span><span>${subtotal.toFixed(2)}</span></div>
              {/* Coupon code */}
              <div className="pt-2 border-t border-border">
                {coupon ? (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <Tag className="h-4 w-4" />
                      <div>
                        <p className="font-semibold text-sm">{coupon.code}</p>
                        <p className="text-[11px]">-${discount.toFixed(2)}</p>
                      </div>
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={removeCoupon}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                      placeholder={t("cart.couponPlaceholder")}
                      className="h-10 uppercase"
                      maxLength={40}
                    />
                    <Button type="button" variant="outline" size="sm" disabled={validatingCoupon || !couponInput.trim()} onClick={applyCoupon}>
                      {validatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : t("cart.apply")}
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("cart.delivery")}{zoneName ? ` · ${zoneName}` : ""}{groups.length > 1 ? ` (×${groups.length})` : ""}</span>
                <span className="font-medium text-foreground">
                  {deliveryFee > 0 ? `$${deliveryTotal.toFixed(2)}` : t("cart.deliveryTBD")}
                </span>
              </div>
              {creditApplied > 0 && (
                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                  <span className="flex items-center gap-1.5">🎁 Crédit Livroto</span>
                  <span>-${creditApplied.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-display text-base font-bold pt-2 border-t border-border">
                <span>{t("cart.totalToPay")}</span>
                <span>${(finalPayable + deliveryTotal).toFixed(2)}</span>
              </div>
              {(discount > 0 || creditApplied > 0) && (
                <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {t("cart.youSave")} ${(discount + creditApplied).toFixed(2)} !
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {t("cart.finalNote")}
              </p>
              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                {t("cart.live")}
              </div>
              <Button
                onClick={checkout}
                disabled={submitting}
                size="lg"
                className="mt-3 w-full min-h-[52px] bg-[color:var(--whatsapp)] hover:brightness-105 text-base font-bold"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
                {t("cart.submit")}
              </Button>

              {/* Trust signals — psychologie : réduire l'anxiété d'achat */}
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {[
                  { emoji: "💵", text: t("cart.trust.cash") },
                  { emoji: "🚫", text: t("cart.trust.noHidden") },
                  { emoji: "✅", text: t("cart.trust.cancel") },
                  { emoji: "🛵", text: t("cart.trust.local") },
                ].map(({ emoji, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-sm">{emoji}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FlexPayDialog
        open={!!fp}
        orderId={fp?.orderId ?? null}
        phone={phone}
        amountLabel={fp?.label ?? ""}
        onPaid={() => { setFp(null); toast.success("Paiement confirmé !"); navigate({ to: "/orders" }); }}
        onClose={() => { setFp(null); navigate({ to: "/orders" }); }}
      />
    </SiteLayout>
  );
}

