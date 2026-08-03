// Connexion dédiée à une boutique marque blanche — jamais de mention Livroto
// ici, contrairement à /auth (partagé par tout le marketplace). Le compte
// reste techniquement le même système Supabase Auth, mais l'admin d'une
// boutique ne doit jamais voir/atteindre l'expérience Livroto pour se
// connecter à SA gestion.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";

export const Route = createFileRoute("/boutique/connexion")({
  component: ConnexionBoutique,
});

function ConnexionBoutique() {
  const boutique = useBoutique();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({
        to: "/boutique/admin/produits",
        search: { boutique: boutique.slug } as any,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Identifiants incorrects");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          {boutique.logo_url ? (
            <img
              src={boutique.logo_url}
              alt={boutique.nom}
              className="h-16 w-auto max-w-full object-contain"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">
              {boutique.nom.charAt(0)}
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold">{boutique.nom}</h1>
          {boutique.slogan && <p className="mt-0.5 text-xs italic text-muted-foreground">{boutique.slogan}</p>}
          <p className="mt-1 text-sm text-muted-foreground">Connectez-vous à votre gestion</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 min-h-[48px]"
            />
          </div>
          <div>
            <Label htmlFor="c-password">Mot de passe</Label>
            <Input
              id="c-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 min-h-[48px]"
            />
          </div>
          <Button type="submit" size="lg" disabled={busy} className="w-full min-h-[52px]">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Se connecter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
