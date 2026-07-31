// Dialog de paiement FlexPay pour le checkout invité d'une boutique — même
// principe que src/components/livroto/FlexPayDialog.tsx (marketplace) mais
// scopé par boutique_id/commande_id et sans compte utilisateur. Reste invisible
// tant que la boutique n'a pas configuré FlexPay dans Paramètres (`initier`
// renvoie notConfigured) : dans ce cas `onDone()` est appelé immédiatement,
// sans jamais afficher de fenêtre — le mode_paiement "mobile_money" reste un
// simple libellé, comportement inchangé pour une boutique sans identifiants.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Smartphone, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { boutiqueFlexpayInitier, boutiqueFlexpayVerifier } from "@/lib/boutiques/ecommerce.functions";

type Phase = "initiating" | "awaiting" | "success" | "failed" | "timeout" | "skip";

const POLL_MS = 4000;
const MAX_POLLS = 30; // ~2 min

export function BoutiqueFlexPayDialog({
  boutiqueId,
  commandeId,
  phone,
  amountLabel,
  onDone,
}: {
  boutiqueId: string;
  commandeId: string;
  phone: string;
  amountLabel: string;
  onDone: () => void;
}) {
  const initier = useServerFn(boutiqueFlexpayInitier);
  const verifier = useServerFn(boutiqueFlexpayVerifier);
  const [phase, setPhase] = useState<Phase>("initiating");
  const [detail, setDetail] = useState("");
  const polls = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);

  const stop = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const poll = () => {
    stop();
    timer.current = setTimeout(async () => {
      polls.current += 1;
      try {
        const res: any = await verifier({ data: { boutique_id: boutiqueId, commande_id: commandeId } });
        if (res?.status === "success") {
          setPhase("success");
          stop();
          setTimeout(onDone, 1400);
          return;
        }
        if (res?.status === "failed") {
          setPhase("failed");
          stop();
          return;
        }
      } catch {
        /* on retente au prochain intervalle */
      }
      if (polls.current >= MAX_POLLS) {
        setPhase("timeout");
        stop();
        return;
      }
      poll();
    }, POLL_MS);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res: any = await initier({ data: { boutique_id: boutiqueId, commande_id: commandeId, phone } });
        if (res?.notConfigured) {
          setPhase("skip");
          onDone();
          return;
        }
        if (!res?.ok) {
          setPhase("failed");
          setDetail(res?.error ?? "Échec de l'initiation du paiement.");
          return;
        }
        setPhase("awaiting");
        poll();
      } catch (e: any) {
        setPhase("failed");
        setDetail(e?.message ?? "Erreur réseau.");
      }
    })();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "skip") return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[color:var(--brand-dark)]" /> Paiement FlexPay
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-4 text-center">
          {(phase === "initiating" || phase === "awaiting") && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-[color:var(--brand-dark)]" />
              <p className="mt-4 font-display text-lg font-bold">
                {phase === "initiating" ? "Envoi de la demande…" : "Confirme sur ton téléphone"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Un message <b>USSD</b> a été envoyé au <b>{phone}</b>. Saisis ton code secret Mobile
                Money pour payer <b>{amountLabel}</b>.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">Ne ferme pas cette fenêtre…</p>
            </>
          )}

          {phase === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <p className="mt-4 font-display text-lg font-bold">Paiement confirmé ✅</p>
              <p className="mt-1 text-sm text-muted-foreground">Merci ! Ta commande est payée.</p>
            </>
          )}

          {phase === "failed" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="mt-4 font-display text-lg font-bold">Paiement non abouti</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail || "La transaction a échoué ou a été annulée."}
              </p>
              <Button className="mt-4" onClick={onDone}>
                Continuer (payer à la livraison)
              </Button>
            </>
          )}

          {phase === "timeout" && (
            <>
              <Clock className="h-12 w-12 text-amber-500" />
              <p className="mt-4 font-display text-lg font-bold">En attente de confirmation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nous n'avons pas encore reçu la confirmation. Si tu as validé sur ton téléphone, la
                boutique verra le paiement dès qu'il sera confirmé.
              </p>
              <Button className="mt-4" onClick={onDone}>
                Continuer
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
