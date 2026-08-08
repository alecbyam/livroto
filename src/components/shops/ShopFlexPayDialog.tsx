// Miroir de FlexPayDialog.tsx (marketplace natif), branché sur les server
// functions shop-scoped (initiateShopFlexpayPayment / checkShopFlexpayStatus).
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Smartphone, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { initiateShopFlexpayPayment, checkShopFlexpayStatus } from "@/lib/shops/orders.functions";

type Phase = "initiating" | "awaiting" | "success" | "failed" | "timeout" | "error";
const POLL_MS = 4000;
const MAX_POLLS = 30;

export function ShopFlexPayDialog({
  orderId, phone, amountLabel, open, onPaid, onClose,
}: {
  orderId: string | null; phone: string; amountLabel: string; open: boolean; onPaid: () => void; onClose: () => void;
}) {
  const initiate = useServerFn(initiateShopFlexpayPayment);
  const check = useServerFn(checkShopFlexpayStatus);
  const [phase, setPhase] = useState<Phase>("initiating");
  const [detail, setDetail] = useState("");
  const polls = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedFor = useRef<string | null>(null);
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  useEffect(() => {
    if (!open || !orderId) return;
    if (startedFor.current === orderId) return;
    startedFor.current = orderId;
    polls.current = 0;
    setPhase("initiating"); setDetail("");
    (async () => {
      try {
        const res: any = await initiate({ data: { order_id: orderId, phone } });
        if (!res?.ok) { setPhase("error"); setDetail(res?.error ?? "Échec de l'initiation."); return; }
        setPhase("awaiting"); poll();
      } catch (e: any) { setPhase("error"); setDetail(e?.message ?? "Erreur réseau."); }
    })();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const poll = () => {
    stop();
    timer.current = setTimeout(async () => {
      if (!orderId) return;
      polls.current += 1;
      try {
        const res: any = await check({ data: { order_id: orderId } });
        if (res?.status === "success") { setPhase("success"); stop(); setTimeout(onPaid, 1400); return; }
        if (res?.status === "failed") { setPhase("failed"); stop(); return; }
      } catch { /* on retente */ }
      if (polls.current >= MAX_POLLS) { setPhase("timeout"); stop(); return; }
      poll();
    }, POLL_MS);
  };

  const retry = () => {
    if (!orderId) return;
    startedFor.current = orderId; polls.current = 0;
    (async () => {
      try {
        const res: any = await initiate({ data: { order_id: orderId, phone } });
        if (!res?.ok) { setPhase("error"); setDetail(res?.error ?? "Échec."); return; }
        setPhase("awaiting"); poll();
      } catch (e: any) { setPhase("error"); setDetail(e?.message ?? "Erreur réseau."); }
    })();
  };

  const close = () => { stop(); startedFor.current = null; onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[color:var(--brand-dark)]" /> Paiement Mobile Money
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center py-4 text-center">
          {(phase === "initiating" || phase === "awaiting") && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-[color:var(--brand-dark)]" />
              <p className="mt-4 font-display text-lg font-bold">{phase === "initiating" ? "Envoi de la demande…" : "Confirme sur ton téléphone"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Un message USSD a été envoyé au <b>{phone}</b>. Saisis ton code secret pour payer <b>{amountLabel}</b>.</p>
            </>
          )}
          {phase === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <p className="mt-4 font-display text-lg font-bold">Paiement confirmé ✅</p>
            </>
          )}
          {(phase === "failed" || phase === "error") && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="mt-4 font-display text-lg font-bold">Paiement non abouti</p>
              <p className="mt-1 text-sm text-muted-foreground">{detail || "La transaction a échoué ou a été annulée."}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={close}>Payer cash</Button>
                <Button onClick={retry}>Réessayer</Button>
              </div>
            </>
          )}
          {phase === "timeout" && (
            <>
              <Clock className="h-12 w-12 text-amber-500" />
              <p className="mt-4 font-display text-lg font-bold">En attente de confirmation</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={retry}>Vérifier encore</Button>
                <Button onClick={onPaid}>Continuer</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
