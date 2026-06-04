import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Réinitialiser le mot de passe — Livroto" },
      { name: "description", content: "Définis un nouveau mot de passe pour ton compte Livroto." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Supabase parse automatiquement le hash de recovery et émet PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    // Fallback: si une session existe déjà
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("6 caractères minimum"); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour !");
      navigate({ to: "/auth" });
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-12 max-w-md">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-3xl font-bold">Nouveau mot de passe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? "Choisis un nouveau mot de passe sécurisé."
              : "Vérification du lien de réinitialisation…"}
          </p>

          {ready && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="np">Nouveau mot de passe</Label>
                <Input id="np" type="password" required minLength={6} value={password}
                       onChange={(e) => setPassword(e.target.value)} className="mt-1.5 min-h-[48px]" />
              </div>
              <div>
                <Label htmlFor="cp">Confirmer</Label>
                <Input id="cp" type="password" required minLength={6} value={confirm}
                       onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 min-h-[48px]" />
              </div>
              <Button type="submit" size="lg" disabled={busy} className="w-full min-h-[52px]">
                Mettre à jour
              </Button>
            </form>
          )}

          {!ready && (
            <p className="mt-6 text-sm text-muted-foreground">
              Si rien ne s'affiche après quelques secondes, ton lien est peut-être expiré.{" "}
              <a href="/auth" className="text-primary hover:underline">Demander un nouveau lien</a>.
            </p>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}