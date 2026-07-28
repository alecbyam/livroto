// Bannière + synchronisation de la file d'ajustements de stock hors-ligne.
// Calque de PosOfflineBanner (même seuil anti-zombie, même stratégie) pour
// que la GESTION de boutique (pas seulement l'encaissement) reste utilisable
// sans réseau — un gérant peut compter/corriger son stock hors ligne.
import { useEffect, useState, useCallback } from "react";
import { WifiOff, Clock, RefreshCw, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { stockOfflineQueue } from "@/lib/boutiques/stock-offline-queue";
import { boutiqueAjusterStock } from "@/lib/boutiques/produits.functions";

const MAX_SYNC_ATTEMPTS = 5;

export function StockOfflineBanner({ onSynced }: { onSynced?: () => void }) {
  const ajusterFn = useServerFn(boutiqueAjusterStock);
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshQueue = useCallback(() => setQueueCount(stockOfflineQueue.count()), []);

  const synchroniser = useCallback(async () => {
    const items = stockOfflineQueue.getAll();
    if (items.length === 0) return;
    setSyncing(true);
    let synced = 0, dropped = 0;

    for (const it of items) {
      try {
        await ajusterFn({
          data: { boutique_id: it.boutique_id, produit_id: it.produit_id, type: it.type, quantite_delta: it.quantite_delta, motif: it.motif },
        });
        stockOfflineQueue.remove(it.id);
        synced++;
      } catch (e) {
        const attempts = stockOfflineQueue.bumpAttempt(it.id);
        console.warn(`[stock-offline-sync] échec (tentative ${attempts}/${MAX_SYNC_ATTEMPTS})`, (e as Error)?.message ?? e);
        if (attempts >= MAX_SYNC_ATTEMPTS) { stockOfflineQueue.remove(it.id); dropped++; }
      }
    }

    setSyncing(false);
    refreshQueue();
    onSynced?.();
    if (synced > 0) toast.success(`${synced} ajustement${synced > 1 ? "s" : ""} de stock synchronisé${synced > 1 ? "s" : ""}.`);
    if (dropped > 0) toast.error(`${dropped} ajustement${dropped > 1 ? "s" : ""} abandonné${dropped > 1 ? "s" : ""} après échecs répétés.`);
  }, [ajusterFn, onSynced, refreshQueue]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();
    const goOnline = () => { setOnline(true); setTimeout(() => synchroniser(), 2000); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const interval = setInterval(refreshQueue, 30_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, [refreshQueue, synchroniser]);

  if (!online) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-destructive px-4 py-2.5 text-sm text-destructive-foreground">
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
        <span className="flex-1 font-semibold">Hors ligne — les ajustements de stock sont enregistrés localement.</span>
        {queueCount > 0 && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{queueCount} en attente</span>}
      </div>
    );
  }

  if (queueCount > 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-amber-600 px-4 py-2.5 text-sm text-white">
        <Clock className="h-4 w-4 shrink-0" />
        <span className="flex-1 font-semibold">{queueCount} ajustement{queueCount > 1 ? "s" : ""} de stock en attente</span>
        <button onClick={synchroniser} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30">
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {syncing ? "Envoi..." : "Envoyer maintenant"}
        </button>
      </div>
    );
  }

  return null;
}
