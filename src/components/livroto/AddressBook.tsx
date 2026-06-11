import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Pencil, Trash2, Star, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyAddresses, saveAddress, updateAddress, deleteAddress, setDefaultAddress,
  type SavedAddress,
} from "@/lib/addresses.functions";

type Zone = { id: string; name: string };

const EMPTY = {
  id: "",
  label: "",
  address: "",
  zone_id: "",
  lat: null as number | null,
  lng: null as number | null,
  is_default: false,
};

export function AddressBook() {
  const qc = useQueryClient();
  const list = useServerFn(getMyAddresses);
  const create = useServerFn(saveAddress);
  const update = useServerFn(updateAddress);
  const del = useServerFn(deleteAddress);
  const setDef = useServerFn(setDefaultAddress);

  const { data, isLoading } = useQuery({ queryKey: ["my-addresses"], queryFn: () => list() });
  const { data: zones } = useQuery({
    queryKey: ["zones-all"],
    queryFn: async () => {
      const { data } = await supabase.from("zones").select("id,name").eq("active", true).order("name");
      return (data ?? []) as Zone[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const addresses = data?.addresses ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-addresses"] });

  const startNew = () => { setForm({ ...EMPTY, is_default: addresses.length === 0 }); setOpen(true); };
  const startEdit = (a: SavedAddress) => {
    setForm({ id: a.id, label: a.label, address: a.address, zone_id: a.zone_id ?? "", lat: a.lat, lng: a.lng, is_default: a.is_default });
    setOpen(true);
  };

  const captureGPS = () => {
    if (!navigator.geolocation) { toast.error("GPS indisponible sur cet appareil"); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }));
        setGeoBusy(false);
        toast.success("📍 Position ajoutée à l'adresse");
      },
      () => { setGeoBusy(false); toast.error("Impossible d'obtenir ta position. Active le GPS."); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const submit = async () => {
    if (!form.label.trim() || !form.address.trim()) { toast.error("Donne un nom et une adresse"); return; }
    setBusy(true);
    try {
      const payload = {
        label: form.label.trim(),
        address: form.address.trim(),
        zone_id: form.zone_id || null,
        lat: form.lat,
        lng: form.lng,
        is_default: form.is_default,
      };
      if (form.id) await update({ data: { id: form.id, ...payload } });
      else await create({ data: payload });
      toast.success("Adresse enregistrée");
      setOpen(false);
      refresh();
    } catch (e: any) { toast.error(e.message ?? "Erreur"); }
    finally { setBusy(false); }
  };

  const onDelete = async (a: SavedAddress) => {
    if (!confirm(`Supprimer l'adresse « ${a.label} » ?`)) return;
    try { await del({ data: { id: a.id } }); toast.success("Adresse supprimée"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  const onSetDefault = async (a: SavedAddress) => {
    try { await setDef({ data: { id: a.id } }); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Mes adresses</h2>
          <p className="text-sm text-muted-foreground">Réutilise-les en un tap au moment de commander.</p>
        </div>
        {!open && <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Ajouter</Button>}
      </div>

      {open && (
        <div className="mt-4 rounded-2xl border bg-card p-4 space-y-3">
          <div>
            <Label>Nom de l'adresse</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Maison, Boutique, Chez maman…" maxLength={40} className="mt-1.5 min-h-[44px]" />
          </div>
          <div>
            <Label>Adresse / repère</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ex : en face du Marché de Sayo, maison rouge" maxLength={200} className="mt-1.5 min-h-[44px]" />
          </div>
          <div>
            <Label>Quartier</Label>
            <Select value={form.zone_id} onValueChange={(v) => setForm({ ...form, zone_id: v })}>
              <SelectTrigger className="mt-1.5 min-h-[44px]"><SelectValue placeholder="Choisir un quartier" /></SelectTrigger>
              <SelectContent>{(zones ?? []).map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={captureGPS} disabled={geoBusy}>
              <Navigation className="h-4 w-4" /> {form.lat != null ? "Position ✓" : geoBusy ? "Localisation…" : "Ajouter ma position GPS"}
            </Button>
            {form.lat != null && (
              <button type="button" onClick={() => setForm({ ...form, lat: null, lng: null })} className="text-xs text-muted-foreground hover:underline">Retirer GPS</button>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="h-4 w-4 rounded border-border" />
              Par défaut
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={submit} disabled={busy} className="flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {isLoading && <div className="h-16 animate-pulse rounded-xl bg-muted" />}
        {!isLoading && addresses.length === 0 && !open && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Aucune adresse enregistrée. Ajoute-en une pour commander plus vite la prochaine fois.</p>
        )}
        {addresses.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand-dark)]" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium">
                {a.label}
                {a.is_default && <span className="rounded bg-[color:var(--brand-light)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--brand-dark)]">PAR DÉFAUT</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{a.address}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              {!a.is_default && (
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Définir par défaut" onClick={() => onSetDefault(a)}>
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Modifier" onClick={() => startEdit(a)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Supprimer" onClick={() => onDelete(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
