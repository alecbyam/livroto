import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Store, Bike, Package, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyAsVendor } from "@/lib/vendor.functions";
import { applyAsRider } from "@/lib/rider.functions";
import { getZones } from "@/lib/dashboard.functions";

/* ---------------- HOME ---------------- */
export function HomePanel({ hasVendor, hasRider, onDone }: { hasVendor: boolean; hasRider: boolean; onDone: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        to="/catalog"
        className="group rounded-2xl border bg-card p-6 transition hover:border-primary/50 hover:shadow-md"
      >
        <Package className="h-7 w-7 text-primary" />
        <h3 className="mt-3 font-display text-xl font-bold">Continuer mes achats</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Parcours le catalogue local de Bunia et commande en quelques tapes.
        </p>
      </Link>

      <Link
        to="/profile"
        className="group rounded-2xl border bg-card p-6 transition hover:border-primary/50 hover:shadow-md"
      >
        <UserCircle2 className="h-7 w-7 text-primary" />
        <h3 className="mt-3 font-display text-xl font-bold">Mon profil</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mets à jour ton nom, ton numéro WhatsApp, ta zone et ta photo.
        </p>
      </Link>

      {!hasVendor ? (
        <VendorOnboarding onDone={onDone} />
      ) : (
        <InfoCard
          icon={Store}
          title="Tu es vendeur"
          desc="Gère ta boutique et tes commandes dans l'onglet « Ma boutique »."
        />
      )}

      {!hasRider ? (
        <RiderOnboarding onDone={onDone} />
      ) : (
        <InfoCard
          icon={Bike}
          title="Tu es livreur"
          desc="Vois tes livraisons et active ta disponibilité dans l'onglet « Mes livraisons »."
        />
      )}
    </div>
  );
}

function InfoCard({ icon: I, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <I className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function VendorOnboarding({ onDone }: { onDone: () => void }) {
  const apply = useServerFn(applyAsVendor);
  const fetchZones = useServerFn(getZones);
  const { data: zonesData } = useQuery({ queryKey: ["zones"], queryFn: () => fetchZones() });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ shop_name: "", whatsapp: "", description: "", base_zone_id: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({ data: { ...form, base_zone_id: form.base_zone_id || null } });
      toast.success("Demande envoyée ! Notre équipe te contacte sous 24h.");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
      <Store className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">Devenir vendeur</h3>
      <p className="mt-1 text-sm text-muted-foreground">Ouvre ta boutique sur Livroto en 1 minute.</p>
      <div className="mt-4 space-y-3">
        <div>
          <Label>Nom de la boutique</Label>
          <Input required value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
        </div>
        <div>
          <Label>WhatsApp</Label>
          <Input required placeholder="+243…" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div>
          <Label>Quartier de base</Label>
          <Select value={form.base_zone_id} onValueChange={(v) => setForm({ ...form, base_zone_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir un quartier" /></SelectTrigger>
            <SelectContent>
              {(zonesData?.zones ?? []).map((z: any) => (
                <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Description (optionnel)</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Envoi…" : "Envoyer ma candidature"}
        </Button>
      </div>
    </form>
  );
}

function RiderOnboarding({ onDone }: { onDone: () => void }) {
  const apply = useServerFn(applyAsRider);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", whatsapp: "", vehicle: "moto" as "moto" | "velo" | "pied" | "voiture" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({ data: form });
      toast.success("Demande envoyée ! Notre équipe va te contacter.");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
      <Bike className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">Devenir livreur</h3>
      <p className="mt-1 text-sm text-muted-foreground">Gagne de l'argent en livrant à Bunia.</p>
      <div className="mt-4 space-y-3">
        <div>
          <Label>Nom complet</Label>
          <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <Label>WhatsApp</Label>
          <Input required placeholder="+243…" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div>
          <Label>Véhicule</Label>
          <Select value={form.vehicle} onValueChange={(v: any) => setForm({ ...form, vehicle: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="moto">Moto</SelectItem>
              <SelectItem value="velo">Vélo</SelectItem>
              <SelectItem value="pied">À pied</SelectItem>
              <SelectItem value="voiture">Voiture</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Envoi…" : "Postuler comme livreur"}
        </Button>
      </div>
    </form>
  );
}
