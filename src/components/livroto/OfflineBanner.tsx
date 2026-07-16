import { useEffect, useState, useCallback } from "react";
import { WifiOff, Wifi, Clock, RefreshCw, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { offlineQueue } from "@/lib/offline-queue";
import { supabase } from "@/integrations/supabase/client";
import { createCartOrders } from "@/lib/checkout.functions";
import { toast } from "sonner";

// Au-delà de ce nombre d'échecs, une commande hors-ligne est abandonnée (et le
// client averti) plutôt que ré-essayée indéfiniment à chaque reconnexion.
const MAX_SYNC_ATTEMPTS = 5;

export function OfflineBanner() {
  const createOrders = useServerFn(createCartOrders);
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshQueue = useCallback(() => {
    setQueueCount(offlineQueue.count());
  }, []);

  // Synchronise les commandes en attente avec Supabase
  const syncOrders = useCallback(async () => {
    const orders = offlineQueue.getAll();
    if (orders.length === 0) return;

    setSyncing(true);
    let synced = 0;
    let dropped = 0;

    for (const queued of orders) {
      try {
        // getSession() (local) et non getUser() (réseau) : on vient de repasser en
        // ligne mais la connexion reste fragile ; inutile d'un aller-retour réseau
        // juste pour connaître l'utilisateur courant.
        const { data } = await supabase.auth.getSession();
        if (!data.session) break;

        // Recrée la commande via le même chemin serveur que le checkout en
        // ligne : prix et frais de livraison sont recalculés depuis la base,
        // jamais repris des montants stockés localement pendant la panne.
        const payload = queued.payload as Record<string, any>;
        await createOrders({
          data: {
            items: queued.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
            zone_id: payload.zone_id ?? null,
            coupon_code: payload.coupon_code ?? null,
            customer_name: payload.customer_name,
            customer_phone: payload.customer_phone,
            customer_address: payload.customer_address,
            payment_method: payload.payment_method,
            customer_notes: payload.customer_notes ?? null,
            customer_lat: payload.customer_lat ?? null,
            customer_lng: payload.customer_lng ?? null,
          },
        });

        offlineQueue.remove(queued.id);
        synced++;
      } catch (e) {
        // Anti-zombie : une commande qui échoue en boucle (ex. produit retiré du
        // catalogue depuis la panne) restait sinon indéfiniment dans la file,
        // ré-essayée à chaque reconnexion, sans que personne ne le sache. On
        // plafonne les tentatives, puis on l'abandonne en le signalant au client.
        const attempts = offlineQueue.bumpAttempt(queued.id);
        console.warn(
          `[offline-sync] échec envoi commande (tentative ${attempts}/${MAX_SYNC_ATTEMPTS})`,
          (e as Error)?.message ?? e,
        );
        if (attempts >= MAX_SYNC_ATTEMPTS) {
          offlineQueue.remove(queued.id);
          dropped++;
        }
      }
    }

    setSyncing(false);
    refreshQueue();

    if (synced > 0) {
      toast.success(
        `✅ ${synced} commande${synced > 1 ? "s" : ""} envoyée${synced > 1 ? "s" : ""} avec succès !`,
        { description: "Tes commandes hors-ligne ont été synchronisées." },
      );
    }
    if (dropped > 0) {
      toast.error(
        `${dropped} commande${dropped > 1 ? "s" : ""} n'a pas pu être envoyée`,
        {
          description:
            "Un article n'est peut-être plus disponible. Repasse par le catalogue pour recommander.",
        },
      );
    }
  }, [refreshQueue]);

  useEffect(() => {
    // Initialisation
    setOnline(navigator.onLine);
    refreshQueue();

    const goOnline = () => {
      setOnline(true);
      // Auto-sync à la reconnexion
      setTimeout(() => syncOrders(), 2000);
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Vérifie la file d'attente toutes les 30 secondes
    const interval = setInterval(refreshQueue, 30_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, [refreshQueue, syncOrders]);

  // Hors-ligne
  if (!online) {
    return (
      <div className="sticky top-16 z-30 bg-destructive/95 backdrop-blur text-white px-4 py-2.5 flex items-center gap-3 text-sm shadow-lg">
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
        <div className="flex-1">
          <span className="font-semibold">Pas de connexion internet</span>
          <span className="ml-2 text-white/80">
            Tes commandes seront envoyées à la reconnexion.
          </span>
        </div>
        {queueCount > 0 && (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
            {queueCount} en attente
          </span>
        )}
      </div>
    );
  }

  // En ligne mais commandes en attente
  if (queueCount > 0) {
    return (
      <div className="sticky top-16 z-30 bg-amber-600/95 backdrop-blur text-white px-4 py-2.5 flex items-center gap-3 text-sm shadow-lg">
        <Clock className="h-4 w-4 shrink-0" />
        <div className="flex-1">
          <span className="font-semibold">
            {queueCount} commande{queueCount > 1 ? "s" : ""} en attente d'envoi
          </span>
        </div>
        <button
          onClick={syncOrders}
          disabled={syncing}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30 transition-colors"
        >
          {syncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Envoi…
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" /> Envoyer maintenant
            </>
          )}
        </button>
      </div>
    );
  }

  return null;
}
