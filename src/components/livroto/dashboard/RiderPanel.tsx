import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Truck, DollarSign, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  getRiderDashboard, toggleRiderAvailability, getAvailableDeliveries,
  riderClaimOrder, riderUpdateOrderStatus, riderConfirmCash, riderUpdateLocation,
} from "@/lib/rider.functions";
import { notifyOrderStatusChanged } from "@/lib/notifications.functions";
import { useI18n } from "@/lib/i18n";
import { statusColor, Stat, CallMeBotCard } from "./shared";

/* ---------------- RIDER ---------------- */
export function RiderPanel() {
  const { t } = useI18n();
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
  if (!data?.rider) return <p>{t("rider.noProfile")}</p>;
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
    try { await claim({ data: { order_id: id } }); toast.success(t("rider.toast.claimed")); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onStatus = async (id: string, status: any) => {
    try {
      await updStatus({ data: { order_id: id, status } });
      toast.success(t("rider.toast.statusUpdated"));
      refresh();
      notifyStatus({ data: { order_id: id, status } }).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
  };
  const onCash = async (id: string, amount: number) => {
    try { await cashIn({ data: { order_id: id, amount_usd: amount } }); toast.success(t("rider.toast.cashCollected")); refresh(); }
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
            <span className="text-sm font-medium">{t("rider.available")}</span>
            <Switch checked={r.is_available} onCheckedChange={flip} disabled={r.status !== "active"} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("rider.stats.deliveries")} value={r.total_deliveries} />
          <Stat label={t("rider.stats.earnings")} value={Number(r.total_earnings_usd).toFixed(2)} />
          <Stat label={t("rider.stats.rating")} value={`${Number(r.rating_avg).toFixed(1)} ★`} />
          <Stat label={t("rider.stats.reviews")} value={r.rating_count} />
        </div>
      </div>

      <CallMeBotCard role="rider" currentKey={r.callmebot_apikey} currentPhone={r.whatsapp} />

      <RiderLiveShareCard />

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-4"><h3 className="font-display text-lg font-bold">{t("rider.myDeliveries.title")}</h3></div>
        <div className="divide-y">
          {data.myDeliveries.length === 0 && <p className="p-6 text-sm text-muted-foreground">{t("rider.myDeliveries.empty")}</p>}
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
                    <MapPin className="h-4 w-4" /> {t("rider.route")}
                  </a>
                </Button>
              )}
              {o.status === "ready" && (
                <Button size="sm" variant="outline" onClick={() => onStatus(o.id, "picked_up")}>{t("rider.pickedUpBtn")}</Button>
              )}
              {o.status === "picked_up" && (
                <>
                  <Button size="sm" onClick={() => onStatus(o.id, "delivered")}>{t("rider.deliveredBtn")}</Button>
                  {o.payment_status !== "paid" && (
                    <Button size="sm" variant="outline" onClick={() => onCash(o.id, Number(o.total_usd) + Number(o.delivery_fee ?? 0))}>
                      <DollarSign className="h-4 w-4" /> {t("rider.cashLabel")} ${(Number(o.total_usd) + Number(o.delivery_fee ?? 0)).toFixed(2)}
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
          <h3 className="font-display text-lg font-bold">{t("rider.availableOrders.title")}</h3>
          <Badge variant="outline">{avail?.orders?.length ?? 0}</Badge>
        </div>
        <div className="divide-y">
          {(!avail?.orders || avail.orders.length === 0) && (
            <p className="p-6 text-sm text-muted-foreground">
              {r.status !== "active" ? t("rider.availableOrders.emptyInactive") : r.is_available ? t("rider.availableOrders.emptyNone") : t("rider.availableOrders.emptyOffline")}
            </p>
          )}
          {(avail?.orders ?? []).map((o: any) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 p-4">
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium">{o.code || o.id.slice(0, 8)} · {o.customer_name}</p>
                <p className="text-xs text-muted-foreground"><MapPin className="inline h-3 w-3" /> {o.zone} · {o.customer_address}</p>
                <p className="text-xs text-muted-foreground">${Number(o.total_usd).toFixed(2)} {t("rider.productsLabel")} · {t("rider.deliveryLabel")} ${Number(o.delivery_fee ?? 0).toFixed(2)}</p>
                {o.customer_lat != null && o.customer_lng != null && (
                  <a href={`https://maps.google.com/?q=${o.customer_lat},${o.customer_lng}`} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[color:var(--brand-dark)] hover:underline">
                    {t("rider.gpsShared")}
                  </a>
                )}
              </div>
              <Button size="sm" onClick={() => onClaim(o.id)} disabled={!r.is_available}>
                {t("rider.claimBtn")}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RiderLiveShareCard() {
  const { t } = useI18n();
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
    if (!navigator.geolocation) { toast.error(t("rider.geoUnavailable")); return; }
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
      () => { toast.error(t("rider.liveShare.enableGps")); stop(); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold flex items-center gap-2">
            {t("rider.liveShare.title")}
            {sharing && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
          </h3>
          <p className="text-xs text-muted-foreground">
            {sharing
              ? (lastSent ? t("rider.liveShare.sentAt").replace("{time}", lastSent.toLocaleTimeString("fr-FR")) : t("rider.liveShare.searching"))
              : t("rider.liveShare.hint")}
          </p>
        </div>
        <Button size="sm" variant={sharing ? "default" : "outline"} onClick={sharing ? stop : start} className="shrink-0">
          {sharing ? t("rider.liveShare.stop") : t("rider.liveShare.start")}
        </Button>
      </div>
    </div>
  );
}
