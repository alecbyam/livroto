// ============================================================================
// Lien de connexion PROPRE à une boutique (ex: /shop/muungano/connexion) —
// page brandée (logo/nom de la boutique), pas la page /auth générique
// Livroto. Après connexion : direction le back-office si la personne a un
// rôle sur CETTE boutique (owner/manager/staff), sinon la vitrine publique.
// Ne réutilise aucune logique de /auth (fragile, cf. incidents auth) —
// implémentation minimale et indépendante : login + mot de passe oublié.
// ============================================================================
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getMyShop } from "@/lib/shops/shops.functions";

export const Route = createFileRoute("/shop/$slug/connexion")({
  component: ShopLoginPage,
});

type Shop = { id: string; slug: string; name: string; logo_url: string | null };

function ShopLoginPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchMyShop = useServerFn(getMyShop);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("shops").select("id,slug,name,logo_url").eq("slug", slug).eq("status", "approved").maybeSingle();
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
    return <SiteLayout><div className="container mx-auto px-4 py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></SiteLayout>;
  }
  if (!shop) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Boutique introuvable</h1>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto max-w-sm px-4 py-16">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-muted overflow-hidden">
            {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} className="h-full w-full object-cover" /> : <Store className="h-8 w-8" />}
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">{shop.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Espace boutique — connexion</p>
        </div>

        {mode === "signin" ? (
          <form onSubmit={onSignIn} className="mt-8 space-y-4">
            <div><Label className="text-xs">Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Mot de passe</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}</Button>
            <button type="button" onClick={() => setMode("forgot")} className="block w-full text-center text-xs text-muted-foreground hover:underline">
              Mot de passe oublié ?
            </button>
          </form>
        ) : (
          <form onSubmit={onForgot} className="mt-8 space-y-4">
            <div><Label className="text-xs">Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer le lien de réinitialisation"}</Button>
            <button type="button" onClick={() => setMode("signin")} className="block w-full text-center text-xs text-muted-foreground hover:underline">
              Retour à la connexion
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Tu es client et tu veux juste commander ?{" "}
          <a href={`/shop/${slug}`} className="font-medium text-foreground hover:underline">Voir le menu</a>
        </p>
      </div>
    </SiteLayout>
  );
}
