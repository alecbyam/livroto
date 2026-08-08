// ============================================================================
// Dialogue de commande (livraison + paiement) — module boutique générique.
// Ouvert depuis le panier (barre mobile ou sidebar desktop). Gère le dépôt
// partiel (25/50/100%, configurable par boutique) et le partage GPS.
// ============================================================================
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MapPin, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { createShopOrder } from "@/lib/shops/orders.functions";
import { captureGeolocation, classifyGeoError, googleMapsUrl } from "@/lib/geolocation";
import type { ShopCartItem } from "@/lib/shops/cart";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash à la livraison",
  mpesa: "M-Pesa (Vodacom)",
  airtel_money: "Airtel Money",
  orange_money: "Orange Money",
};

type PartialPaymentConfig = { enabled: boolean; percentages: number[] };

export function ShopCheckoutDialog({
  open, onOpenChange, shopId, shopSlug, items, subtotal, partialPayment,
  onOrdered, onNeedPayment,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shopId: string;
  shopSlug: string;
  items: ShopCartItem[];
  subtotal: number;
  partialPayment: PartialPaymentConfig;
  onOrdered: (orderId: string) => void;
  onNeedPayment: (params: { orderId: string; amount: number; percent: number }) => void;
}) {
  const submit = useServerFn(createShopOrder);
  const [form, setForm] = useState({
    name: "", phone: "", address: "", notes: "",
    payment: "cash" as "cash" | "mpesa" | "airtel_money" | "orange_money",
    percent: 100,
  });
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const shareLocation = async () => {
    setGeoBusy(true);
    try {
      const pos = await captureGeolocation();
      setGeo({ lat: pos.lat, lng: pos.lng });
      toast.success("Position partagée");
    } catch (e) {
      const kind = classifyGeoError(e);
      const msg = kind === "denied" ? "Autorisation refusée — active la localisation dans les réglages du navigateur."
        : kind === "unsupported" ? "Géolocalisation non disponible sur cet appareil."
        : "Impossible d'obtenir ta position, réessaie.";
      toast.error(msg);
    } finally { setGeoBusy(false); }
  };

  const onSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
      toast.error("Nom, téléphone et adresse sont requis."); return;
    }
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      toast.message("Connecte-toi pour valider ta commande — ton panier est conservé.");
      onOpenChange(false);
      window.location.href = `/shop/${shopSlug}/connexion`;
      return;
    }
    setBusy(true);
    try {
      const res = await submit({
        data: {
          shop_id: shopId,
          items: items.map((i) => ({ product_id: i.productId, quantity: i.qty, notes: i.notes, selected_choice_ids: i.selectedChoiceIds })),
          zone_id: null,
          customer_name: form.name.trim(),
          customer_phone: form.phone.trim(),
          customer_address: form.address.trim(),
          customer_lat: geo?.lat ?? null,
          customer_lng: geo?.lng ?? null,
          payment_method: form.payment,
          customer_notes: form.notes.trim() || null,
        },
      });
      toast.success(`Commande envoyée ${res.code ? `(${res.code})` : ""} !`);
      onOpenChange(false);
      if (form.payment !== "cash") {
        const amount = partialPayment.enabled ? Math.round(res.total * form.percent / 100 * 100) / 100 : res.total;
        onNeedPayment({ orderId: res.orderId, amount, percent: partialPayment.enabled ? form.percent : 100 });
      } else {
        onOrdered(res.orderId);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Impossible d'envoyer la commande.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Livraison & paiement</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Nom complet</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09xxxxxxxx" className="mt-1" /></div>
          <div><Label className="text-xs">Adresse / repère</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>

          <div>
            <Button type="button" variant="outline" size="sm" onClick={shareLocation} disabled={geoBusy} className="w-full">
              {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : geo ? <Check className="h-4 w-4 text-primary" /> : <MapPin className="h-4 w-4" />}
              {geo ? "Position partagée" : "Partager ma position GPS"}
            </Button>
            {geo && (
              <a href={googleMapsUrl(geo.lat, geo.lng)} target="_blank" rel="noreferrer" className="mt-1 block text-center text-[11px] text-muted-foreground hover:underline">
                Voir sur la carte
              </a>
            )}
          </div>

          <div><Label className="text-xs">Note pour la boutique (optionnel)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Ex : sonner au portail bleu..." /></div>

          <div>
            <Label className="text-xs">Paiement</Label>
            <RadioGroup value={form.payment} onValueChange={(v) => setForm({ ...form, payment: v as any })} className="mt-2 space-y-2">
              {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
                <div key={k} className="flex items-center gap-2 rounded-xl border p-2.5">
                  <RadioGroupItem value={k} id={`pay-${k}`} />
                  <Label htmlFor={`pay-${k}`} className="cursor-pointer font-normal">{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {form.payment !== "cash" && partialPayment.enabled && partialPayment.percentages.length > 1 && (
            <div>
              <Label className="text-xs">Montant à payer maintenant</Label>
              <RadioGroup value={String(form.percent)} onValueChange={(v) => setForm({ ...form, percent: Number(v) })} className="mt-2 grid grid-cols-3 gap-2">
                {partialPayment.percentages.map((p) => (
                  <label key={p} className={`cursor-pointer rounded-xl border p-2.5 text-center text-sm ${form.percent === p ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 font-semibold" : ""}`}>
                    <RadioGroupItem value={String(p)} className="sr-only" />
                    {p}%{p < 100 && <span className="block text-[10px] text-muted-foreground">${(subtotal * p / 100).toFixed(2)}</span>}
                  </label>
                ))}
              </RadioGroup>
              {form.percent < 100 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Reste ${(subtotal * (100 - form.percent) / 100).toFixed(2)} à payer cash à la livraison.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full justify-between font-display text-base font-bold">
            <span>Total</span><span>${subtotal.toFixed(2)}</span>
          </div>
          <Button className="w-full" onClick={onSubmit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer la commande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
