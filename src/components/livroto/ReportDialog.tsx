import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { submitReport } from "@/lib/profile.functions";

type Props = {
  targetType: "product" | "vendor" | "rider" | "order";
  targetId: string;
  label?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "default";
};

const REASONS = [
  "Contenu inapproprié",
  "Produit dangereux ou contrefait",
  "Prix abusif",
  "Vendeur injoignable",
  "Description trompeuse",
  "Autre",
];

export function ReportDialog({ targetType, targetId, label = "Signaler", variant = "ghost", size = "sm" }: Props) {
  const submit = useServerFn(submitReport);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Connecte-toi pour signaler");
      return;
    }
    setBusy(true);
    try {
      await submit({ data: { target_type: targetType, target_id: targetId, reason, details: details.trim() || undefined } });
      toast.success("Signalement envoyé. Merci, l'équipe Livroto va vérifier.");
      setOpen(false);
      setDetails("");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Flag className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signaler {targetType === "product" ? "ce produit" : targetType === "vendor" ? "ce vendeur" : targetType === "rider" ? "ce livreur" : "cette commande"}</DialogTitle>
          <DialogDescription>
            Aide-nous à garder Livroto sûr à Bunia. Décris ce qui ne va pas — un admin vérifiera.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="r-reason">Motif</Label>
            <select
              id="r-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {reason === "Autre" && (
            <div>
              <Label htmlFor="r-custom">Précise le motif</Label>
              <Input id="r-custom" maxLength={120} required
                     onChange={(e) => setReason(e.target.value)} className="mt-1.5" />
            </div>
          )}
          <div>
            <Label htmlFor="r-details">Détails (optionnel)</Label>
            <Textarea id="r-details" value={details} onChange={(e) => setDetails(e.target.value)}
                      maxLength={1000} rows={4} className="mt-1.5"
                      placeholder="Donne le maximum de contexte." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Envoyer le signalement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}