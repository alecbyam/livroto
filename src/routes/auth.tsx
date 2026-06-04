import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function readableAuthError(err: any) {
  const code = err?.code ?? err?.status;
  const message = String(err?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirme d'abord ton email avant de te connecter.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Connexion impossible pour le moment. Vérifie ta connexion puis réessaie.";
  }
  return err?.message ?? "Erreur de connexion.";
}

async function postLoginRedirect(navigate: ReturnType<typeof useNavigate>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) { navigate({ to: "/" }); return; }
  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);
  if (roles.includes("admin")) { navigate({ to: "/dashboard", search: { tab: "admin" } as any }); return; }
  if (roles.includes("rider")) { navigate({ to: "/dashboard", search: { tab: "rider" } as any }); return; }
  if (roles.includes("vendor")) { navigate({ to: "/dashboard", search: { tab: "vendor" } as any }); return; }
  navigate({ to: "/catalog" });
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Livroto Bunia" },
      { name: "description", content: "Connecte-toi ou crée ton compte Livroto pour commander à Bunia : suivi de commande, favoris et historique." },
      { property: "og:title", content: "Connexion — Livroto" },
      { property: "og:description", content: "Accède à ton espace Livroto Bunia." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) postLoginRedirect(navigate);
    });
  }, [navigate]);

  const switchMode = (nextMode: "signin" | "signup" | "forgot") => {
    setFormMessage(null);
    setMode(nextMode);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        const message = "Email envoyé ! Vérifie ta boîte de réception.";
        toast.success(message);
        setFormMessage({ type: "success", text: message });
        setMode("signin");
      } else if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl, data: { name, phone } },
        });
        if (error) throw error;
        const message = "Compte créé ! Vérifie ton email avant de te connecter.";
        toast.success(message);
        setFormMessage({ type: "success", text: message });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const message = "Connexion réussie. Redirection…";
        toast.success(message);
        setFormMessage({ type: "success", text: message });
        await postLoginRedirect(navigate);
      }
    } catch (err: any) {
      const message = readableAuthError(err);
      setFormMessage({ type: "error", text: message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-12 max-w-md">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-3xl font-bold">
            {mode === "forgot" ? "Mot de passe oublié" : t("auth.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Entre ton email, on t'envoie un lien pour réinitialiser ton mot de passe."
              : t("auth.subtitle")}
          </p>

          {formMessage && (
            <div
              role="alert"
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                formMessage.type === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              {formMessage.text}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="a-name">{t("auth.name")}</Label>
                  <Input id="a-name" required value={name} onChange={(e) => setName(e.target.value)}
                         className="mt-1.5 min-h-[48px]" />
                </div>
                <div>
                  <Label htmlFor="a-phone">{t("auth.phone")}</Label>
                  <Input id="a-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                         className="mt-1.5 min-h-[48px]" placeholder="+243 ..." />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="a-email">{t("auth.email")}</Label>
              <Input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                     className="mt-1.5 min-h-[48px]" />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="a-pwd">{t("auth.password")}</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => switchMode("forgot")}
                            className="text-xs text-primary hover:underline">
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <Input id="a-pwd" type="password" required minLength={6} value={password}
                       onChange={(e) => setPassword(e.target.value)} className="mt-1.5 min-h-[48px]" />
              </div>
            )}

            <Button type="submit" size="lg" disabled={busy} className="w-full min-h-[52px]">
              {busy ? "Traitement…" : mode === "signup" ? t("auth.signUp") : mode === "forgot" ? "Envoyer le lien" : t("auth.signIn")}
            </Button>
          </form>

          {mode === "forgot" ? (
            <button onClick={() => switchMode("signin")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-primary">
              ← Retour à la connexion
            </button>
          ) : (
            <button onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-primary">
              {mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")}
            </button>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}