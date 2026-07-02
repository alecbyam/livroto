import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCallmebotApiKey } from "@/lib/notifications.functions";

// Petits éléments réutilisés par les panneaux vendeur/livreur/admin du tableau de bord.

export function statusColor(s: string) {
  switch (s) {
    case "delivered": case "approved": case "active": return "bg-primary/15 text-primary border-primary/30";
    case "pending": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "cancelled": case "suspended": case "rejected": return "bg-destructive/15 text-destructive border-destructive/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}

/* ---------- WhatsApp auto (CallMeBot) ---------- */
export function CallMeBotCard({ role, currentKey, currentPhone }: { role: "vendor" | "rider" | "customer"; currentKey: string | null | undefined; currentPhone: string | null | undefined }) {
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
