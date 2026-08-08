// ============================================================================
// Lien de connexion PROPRE à une boutique (ex: /shop/muungano/connexion) —
// page brandée (logo/nom de la boutique), pas la page /auth générique
// Livroto. Après connexion : direction le back-office si la personne a un
// rôle sur CETTE boutique (owner/manager/staff), sinon la vitrine publique.
// Ne réutilise aucune logique de /auth (fragile, cf. incidents auth) —
// implémentation minimale et indépendante : login, inscription client,
// mot de passe oublié.
// ============================================================================
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ShopSiteLayout } from "@/components/shops/ShopSiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getMyShop } from "@/lib/shops/shops.functions";

export const Route = createFileRoute("/shop/$slug/connexion")({
  component: ShopLoginPage,
});

type Shop = { id: string; slug: string; name: string; logo_url: string | null; whatsapp_display: string | null };
type Mode = "signin" | "signup" | "forgot";

function ShopLoginPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchMyShop = useServerFn(getMyShop);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("shops").select("id,slug,name,logo_url,whatsapp_display").eq("slug", slug).eq("status", "approved").maybeSingle();
      if (!cancelled) { setShop(data as Shop | null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const redirectAfterLogin = async () => {
    try {
      const { shop: mine } = await fetchMyShop();
      if (mine?.slug === slug) { navigate({ to: "/shop-admin/$slug", params: { slug } }); return; }
    } catch {}
    navigate({ to: "/shop/$slug", params: { slug } });
  };

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await redirectAfterLogin();
    } catch (e: any) {
      toast.error(e?.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : (e?.message ?? "Connexion impossible."));
    } finally { setBusy(false); }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error("Nom, email et mot de passe (6+ caractères) sont requis."); return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/shop/${slug}`,
          data: { name: name.trim(), phone: phone.trim() },
        },
      });
      if (error) throw error;
      toast.success("Compte créé ! Vérifie ton email pour confirmer, puis reviens te connecter.");
      setMode("signin");
    } catch (e: any) {
      toast.error(e?.message ?? "Inscription impossible.");
    } finally { setBusy(false); }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Email envoyé — vérifie ta boîte de réception.");
      setMode("signin");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'envoyer l'email.");
    } finally { setBusy(false); }
  };

  if (loading) {
    return <ShopSiteLayout shop={null}><div className="container mx-auto px-4 py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></ShopSiteLayout>;
  }
  if (!shop) {
    return <ShopSiteLayout shop={null}><div className="container mx-auto px-4 py-16 text-center"><h1 className="font-display text-2xl font-bold">Boutique introuvable</h1></div></ShopSiteLayout>;
  }

  const titles: Record<Mode, string> = { signin: "Connexion", signup: "Créer un compte", forgot: "Mot de passe oublié" };

  return (
    <ShopSiteLayout shop={shop}>
      <div className="container mx-auto max-w-sm px-4 py-16">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">{titles[mode]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{shop.name}</p>
        </div>

        {mode === "signin" && (
          <form onSubmit={onSignIn} className="mt-8 space-y-4">
            <div><Label className="text-xs">Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Mot de passe</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}</Button>
            <div className="flex justify-between text-xs text-muted-foreground">
              <button type="button" onClick={() => setMode("signup")} className="hover:underline">Créer un compte</button>
              <button type="button" onClick={() => setMode("forgot")} className="hover:underline">Mot de passe oublié ?</button>
            </div>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={onSignUp} className="mt-8 space-y-4">
            <div><Label className="text-xs">Nom complet</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Téléphone (optionnel)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" className="mt-1" /></div>
            <div><Label className="text-xs">Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Mot de passe</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum" className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}</Button>
            <button type="button" onClick={() => setMode("signin")} className="block w-full text-center text-xs text-muted-foreground hover:underline">
              J'ai déjà un compte
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={onForgot} className="mt-8 space-y-4">
            <div><Label className="text-xs">Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer le lien de réinitialisation"}</Button>
            <button type="button" onClick={() => setMode("signin")} className="block w-full text-center text-xs text-muted-foreground hover:underline">
              Retour à la connexion
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <a href={`/shop/${slug}`} className="font-medium text-foreground hover:underline">← Retour au menu</a>
        </p>
      </div>
    </ShopSiteLayout>
  );
}
