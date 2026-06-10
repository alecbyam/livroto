import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Upload, User, Save, Gift, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { updateMyProfile } from "@/lib/profile.functions";
import { compressImage } from "@/lib/image";
import { SecuritySettings } from "@/components/livroto/SecuritySettings";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const save = useServerFn(updateMyProfile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    zone: "",
    avatar_url: "" as string | null | "",
  });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUserId(session.user.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("name,phone,zone,avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();
      if (p) {
        setForm({
          name: p.name ?? "",
          phone: p.phone ?? "",
          zone: p.zone ?? "",
          avatar_url: p.avatar_url ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const onUpload = async (file: File) => {
    if (!userId) return;
    file = await compressImage(file, { maxSize: 512 });
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image trop lourde (max 3MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("URL signée");
      setForm((f) => ({ ...f, avatar_url: signed.signedUrl }));
      toast.success("Photo téléversée");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await save({ data: {
        name: form.name.trim(),
        phone: form.phone.trim(),
        zone: form.zone.trim() || null,
        avatar_url: form.avatar_url || null,
      }});
      toast.success("Profil mis à jour");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-16 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto max-w-xl px-4 py-8">
        <Link to="/dashboard" search={{ tab: "home" } as any} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tableau de bord
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Mon profil</h1>
        <p className="text-sm text-muted-foreground">Ces infos sont préremplies à chaque commande.</p>

        <form onSubmit={onSubmit} className="mt-6 rounded-2xl border bg-card p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--brand-light)] overflow-hidden border">
              {form.avatar_url ? (
                <img src={form.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading}
                      onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {form.avatar_url ? "Changer la photo" : "Ajouter une photo"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">JPG ou PNG, max 3MB</p>
            </div>
          </div>

          <div>
            <Label htmlFor="p-name">Nom complet</Label>
            <Input id="p-name" required value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })}
                   className="mt-1.5 min-h-[48px]" maxLength={80} />
          </div>
          <div>
            <Label htmlFor="p-phone">Téléphone WhatsApp</Label>
            <Input id="p-phone" required type="tel" value={form.phone}
                   onChange={(e) => setForm({ ...form, phone: e.target.value })}
                   className="mt-1.5 min-h-[48px]" placeholder="+243 ..." maxLength={20} />
          </div>
          <div>
            <Label htmlFor="p-zone">Quartier / zone par défaut</Label>
            <Input id="p-zone" value={form.zone}
                   onChange={(e) => setForm({ ...form, zone: e.target.value })}
                   className="mt-1.5 min-h-[48px]" placeholder="Ex. Mudzipela, Lumumba..." maxLength={80} />
          </div>

          <Button type="submit" size="lg" disabled={saving} className="w-full min-h-[52px]">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Enregistrer
          </Button>
        </form>

        {/* Parrainage : invite & gagne du crédit */}
        <Link
          to="/parrainage"
          className="mt-8 flex items-center gap-3 rounded-2xl border-2 border-[color:var(--brand-dark)]/20 bg-[color:var(--brand-light)]/50 p-4 transition-colors hover:border-[color:var(--brand-dark)]/50"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--brand-dark)] text-white">
            <Gift className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold">Invite & gagne</p>
            <p className="text-sm text-muted-foreground">Invite un ami : vous gagnez chacun 1&nbsp;$ de crédit.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>

        {/* Sécurité : 2FA + gestion des appareils connectés */}
        <h2 className="mt-10 font-display text-2xl font-bold">Sécurité</h2>
        <p className="text-sm text-muted-foreground">Protège ton compte et gère tes appareils.</p>
        <SecuritySettings />
      </div>
    </SiteLayout>
  );
}