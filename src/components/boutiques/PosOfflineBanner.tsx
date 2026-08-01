// Bannière + synchronisation de la file d'attente POS hors-ligne. Calque
// exact du composant OfflineBanner (marketplace, src/components/livroto/) :
// même seuil anti-zombie (MAX_SYNC_ATTEMPTS), même stratégie (auto-sync 2s
// après reconnexion + bouton manuel + vérif périodique). Composant séparé
// (pas une réutilisation directe) car la file et le payload sont différents
// (vente boutique, pas commande marketplace) — cf. pos-offline-queue.ts.
import { useEffect, useState, useCallback } from "react";
import { WifiOff, Clock, RefreshCw, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { posOfflineQueue } from "@/lib/boutiques/pos-offline-queue";
import { boutiqueEncaisserVente } from "@/lib/boutiques/pos.functions";

const MAX_SYNC_ATTEMPTS = 5;

export function PosOfflineBanner({ onSynced }: { onSynced?: () => void }) {
  const encaisser = useServerFn(boutiqueEncaisserVente);
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshQueue = useCallback(() => setQueueCount(posOfflineQueue.count()), []);

  const syncVentes = useCallback(async () => {
    const ventes = posOfflineQueue.getAll();
    if (ventes.length === 0) return;

    setSyncing(true);
    let synced = 0;
    let dropped = 0;

    for (const v of ventes) {
      try {
        await encaisser({
          data: {
            boutique_id: v.boutique_id,
            hors_ligne_id: v.id,
            client_id: v.client_id ?? undefined,
            mode_paiement: v.mode_paiement,
            code_promo: v.code_promo ?? undefined,
            // Ne transmet le prix que s'il s'agit d'une VRAIE remise
            // manuelle (prix < prix catalogue mémorisé à l'ajout) — sinon on
            // laisse le serveur recalculer depuis le catalogue/promo en
            // vigueur, potentiellement plus à jour qu'au moment hors-ligne.
            lignes: v.lignes.map((l) => ({
              produit_id: l.produit_id,
              quantite: l.quantite,
              ...(l.prix_unitaire_usd < l.prix_catalogue_usd
                ? { prix_unitaire_usd: l.prix_unitaire_usd }
                : {}),
            })),
          },
        });
        posOfflineQueue.remove(v.id);
        synced++;
      } catch (e) {
        const attempts = posOfflineQueue.bumpAttempt(v.id);
        console.warn(`[pos-offline-sync] échec vente (tentative ${attempts}/${MAX_SYNC_ATTEMPTS})`, (e as Error)?.message ?? e);
        if (attempts >= MAX_SYNC_ATTEMPTS) {
          posOfflineQueue.remove(v.id);
          dropped++;
        }
      }
    }

    setSyncing(false);
    refreshQueue();
    onSynced?.();

    if (synced > 0) toast.success(`${synced} vente${synced > 1 ? "s" : ""} synchronisée${synced > 1 ? "s" : ""}.`);
    if (dropped > 0) toast.error(`${dropped} vente${dropped > 1 ? "s" : ""} abandonnée${dropped > 1 ? "s" : ""} après échecs répétés.`);
  }, [encaisser, onSynced, refreshQueue]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();

    const goOnline = () => { setOnline(true); setTimeout(() => syncVentes(), 2000); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const interval = setInterval(refreshQueue, 30_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, [refreshQueue, syncVentes]);

  if (!online) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-destructive px-4 py-2.5 text-sm text-destructive-foreground">
        <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
        <span className="flex-1 font-semibold">Hors ligne — les ventes sont enregistrées localement.</span>
        {queueCount > 0 && (
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{queueCount} en attente</span>
        )}
      </div>
    );
  }

  if (queueCount > 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-amber-600 px-4 py-2.5 text-sm text-white">
        <Clock className="h-4 w-4 shrink-0" />
        <span className="flex-1 font-semibold">{queueCount} vente{queueCount > 1 ? "s" : ""} en attente d'envoi</span>
        <button
          onClick={syncVentes}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {syncing ? "Envoi..." : "Envoyer maintenant"}
        </button>
      </div>
    );
  }

  return null;
}
