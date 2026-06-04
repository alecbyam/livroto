import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff } from "lucide-react";

const SUPABASE_PROJECT = "kbsjmshirukgnrljhdye";
const AUTH_TIMEOUT_MS = 12000;

/** Nettoie les sessions Supabase d'anciens projets dans localStorage */
function cleanStaleSupabaseSessions() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-") && key.includes("-auth-token") && !key.includes(SUPABASE_PROJECT)) {
        localStorage.removeItem(key);
      }
    });
  } catch {}
}

function readableAuthError(err: any): string {
  const code = err?.code ?? err?.status;
  const message = String(err?.message ?? "").toLowerCase();
  if (message.includes("timeout") || message.includes("aborted") || message.includes("connexion trop lente")) {
    return "Connexion trop lente. Vérifie ta connexion internet et réessaie.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirme d'abord ton email avant de te connecter.";
  }
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("fetch")) {
    return "Impossible de joindre le serveur. Vérifie ta connexion internet.";
  }
  if (message.includes("too many requests") || message.includes("rate limit")) {
    return "Trop de tentatives. Attends quelques minutes avant de réessayer.";
  }
  return err?.message ?? "Erreur de connexion inconnue.";
}

/** Wrapper avec timeout pour éviter un loading infini */
async function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(msg)), ms),
  );
  return Promise.race([promise, timeout]);
}

async function postLoginRedirect(navigate: ReturnType<typeof useNavigate>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) { navigate({ to: "/" }); return; }
  const { data: roleRows } = await supabase
    .from("user_roles").select("role").eq("user_id", u.user.id);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);
  if (roles.includes("admin"))  { navigate({ to: "/dashboard", search: { tab: "admin" }  as any }); return; }
  if (roles.includes("rider"))  { navigate({ to: "/dashboard", search: { tab: "rider" }  as any }); return; }
  if (roles.includes("vendor")) { navigate({ to: "/dashboard", search: { tab: "vendor" } as any }); return; }
  navigate({ to: "/catalog" });
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Livroto Bunia" },
      { name: "description", content: "Connecte-toi ou crée ton compte Livroto." },
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
  const [online, setOnline] = useState(true);
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // Nettoie les sessions d'anciens projets Supabase
    cleanStaleSupabaseSessions();

    // Détecte l'état réseau
    setOnline(navigator.onLine);
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    // Redirige si déjà connecté
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) postLoginRedirect(navigate);
    });

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [navigate]);

  const switchMode = (next: "signin" | "signup" | "forgot") => {
    setFormMessage(null);
    setMode(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);

    if (!online) {
      setFormMessage({ type: "error", text: "Tu n'es pas connecté à internet." });
      return;
    }

    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await withTimeout(
          supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          }),
          AUTH_TIMEOUT_MS,
          "Connexion trop lente.",
        );
        if (error) throw error;
        const msg = "Email envoyé ! Vérifie ta boîte de réception.";
        toast.success(msg);
        setFormMessage({ type: "success", text: msg });
        setMode("signin");

      } else if (mode === "signup") {
        const { error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
              data: { name, phone },
            },
          }),
          AUTH_TIMEOUT_MS,
          "Connexion trop lente.",
        );
        if (error) throw error;
        const msg = "Compte créé ! Vérifie ton email pour confirmer.";
        toast.success(msg);
        setFormMessage({ type: "success", text: msg });

      } else {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          AUTH_TIMEOUT_MS,
          "Connexion trop lente. Vérifie ta connexion internet et réessaie.",
        );
        if (error) throw error;
        toast.success("Connexion réussie !");
        await postLoginRedirect(navigate);
      }
    } catch (err: any) {
      const msg = readableAuthError(err);
      setFormMessage({ type: "error", text: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-12 max-w-md">

        {/* Indicateur connexion hors-ligne */}
        {!online && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <WifiOff className="h-4 w-4 shrink-0" />
            Tu es hors-ligne. Reconnecte-toi à internet pour te connecter.
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="font-display text-3xl font-bold">
            {mode === "forgot" ? "Mot de passe oublié" : t("auth.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Entre ton email, on t'envoie un lien de réinitialisation."
              : t("auth.subtitle")}
          </p>

          {formMessage && (
            <div
              role="alert"
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
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
                  <Input
                    id="a-name" required value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 min-h-[48px]"
                    placeholder="Ton prénom et nom"
                  />
                </div>
                <div>
                  <Label htmlFor="a-phone">{t("auth.phone")}</Label>
                  <Input
                    id="a-phone" type="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1.5 min-h-[48px]"
                    placeholder="+243 ..."
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="a-email">{t("auth.email")}</Label>
              <Input
                id="a-email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 min-h-[48px]"
                placeholder="ton@email.com"
                autoComplete="email"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="a-pwd">{t("auth.password")}</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <Input
                  id="a-pwd" type="password" required minLength={6}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 min-h-[48px]"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={busy || !online}
              className="w-full min-h-[52px] text-base font-bold"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {mode === "signup" ? "Création du compte…" : mode === "forgot" ? "Envoi…" : "Connexion en cours…"}
                </>
              ) : (
                mode === "signup"
                  ? t("auth.signUp")
                  : mode === "forgot"
                  ? "Envoyer le lien"
                  : t("auth.signIn")
              )}
            </Button>

            {busy && (
              <p className="text-center text-xs text-muted-foreground animate-pulse">
                Connexion à Supabase… (max 12 secondes)
              </p>
            )}
          </form>

          {mode === "forgot" ? (
            <button
              onClick={() => switchMode("signin")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-primary"
            >
              ← Retour à la connexion
            </button>
          ) : (
            <button
              onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-primary"
            >
              {mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")}
            </button>
          )}
        </div>

        {/* Debug info (dev uniquement) */}
        <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
          Projet Supabase : {SUPABASE_PROJECT}
        </p>
      </div>
    </SiteLayout>
  );
}
