import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Monitor,
  LogOut,
  Loader2,
  KeyRound,
  Check,
  X,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type DeviceSession = {
  id: string;
  created_at: string;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
};

/** Décode le session_id du JWT courant (sans vérif — usage cosmétique : marquer "cet appareil"). */
function currentSessionId(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json.session_id ?? null;
  } catch {
    return null;
  }
}

function deviceLabel(ua: string | null, t: (k: string) => string): string {
  if (!ua) return t("security.deviceUnknown");
  const os = /android/i.test(ua)
    ? "Android"
    : /iphone|ipad|ios/i.test(ua)
      ? "iPhone / iPad"
      : /windows/i.test(ua)
        ? "Windows"
        : /mac os/i.test(ua)
          ? "Mac"
          : /linux/i.test(ua)
            ? "Linux"
            : t("security.deviceGeneric");
  const br = /edg/i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : t("security.browserGeneric");
  return `${br} · ${os}`;
}

function deviceIcon(ua: string | null) {
  if (ua && /android|iphone|ipad|mobile/i.test(ua)) return Smartphone;
  if (ua && /windows|mac os|linux/i.test(ua)) return Laptop;
  return Monitor;
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function SecuritySettings() {
  const { t } = useI18n();
  const navigate = useNavigate();

  /* ---------- Appareils connectés ---------- */
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [currentSid, setCurrentSid] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [signingOut, setSigningOut] = useState<"others" | "global" | null>(null);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    const { data: s } = await supabase.auth.getSession();
    setCurrentSid(currentSessionId(s.session?.access_token));
    const { data, error } = await (supabase.rpc as any)("get_my_sessions");
    if (!error && data) setSessions(data as DeviceSession[]);
    setLoadingSessions(false);
  }, []);

  /* ---------- 2FA (TOTP) ---------- */
  type MfaState = "loading" | "none" | "enrolling" | "active";
  const [mfaState, setMfaState] = useState<MfaState>("loading");
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const loadMfa = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaState("none");
      return;
    }
    const verified = data.totp?.find((f) => f.status === "verified");
    setMfaState(verified ? "active" : "none");
  }, []);

  useEffect(() => {
    loadSessions();
    loadMfa();
  }, [loadSessions, loadMfa]);

  const signOutOthers = async () => {
    setSigningOut("others");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setSigningOut(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("security.toast.othersSignedOut"));
    loadSessions();
  };

  const signOutEverywhere = async () => {
    setSigningOut("global");
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setSigningOut(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("security.toast.everywhereSignedOut"));
    navigate({ to: "/auth" });
  };

  const startEnroll = async () => {
    setMfaBusy(true);
    try {
      // Nettoie d'éventuels facteurs TOTP non vérifiés (évite l'erreur "déjà existant")
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setMfaState("enrolling");
    } catch (e: any) {
      toast.error(e.message ?? t("security.toast.mfaEnrollError"));
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enroll || code.trim().length < 6) return;
    setMfaBusy(true);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast.success(t("security.toast.mfaEnabled"));
      setEnroll(null);
      setCode("");
      setMfaState("active");
    } catch (e: any) {
      toast.error(e.message ?? t("security.toast.mfaWrongCode"));
    } finally {
      setMfaBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId }).catch(() => {});
    setEnroll(null);
    setCode("");
    setMfaState("none");
  };

  const disable2fa = async () => {
    setMfaBusy(true);
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const verified = list?.totp?.find((f) => f.status === "verified");
      if (!verified) {
        setMfaState("none");
        return;
      }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
      if (error) throw error;
      toast.success(t("security.toast.mfaDisabled"));
      setMfaState("none");
    } catch (e: any) {
      // unenroll exige souvent une session aal2 (2FA validée durant cette session)
      toast.error(
        /assurance|aal|insufficient/i.test(e.message ?? "")
          ? t("security.toast.mfaReauthRequired")
          : (e.message ?? t("security.toast.mfaDisableError")),
      );
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* ---------------- 2FA ---------------- */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${mfaState === "active" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
          >
            {mfaState === "active" ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-bold">{t("security.mfa.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {mfaState === "active"
                ? t("security.mfa.activeDesc")
                : t("security.mfa.inactiveDesc")}
            </p>
          </div>
          {mfaState === "active" && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-600">
              <Check className="h-3.5 w-3.5" /> {t("security.mfa.activeBadge")}
            </span>
          )}
        </div>

        {mfaState === "loading" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("security.mfa.loading")}
          </div>
        )}

        {mfaState === "none" && (
          <Button onClick={startEnroll} disabled={mfaBusy} className="mt-4">
            {mfaBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {t("security.mfa.enable")}
          </Button>
        )}

        {mfaState === "enrolling" && enroll && (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4">
            <p className="text-sm font-medium">{t("security.mfa.step1")}</p>
            <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <img
                src={enroll.qr}
                alt="QR code 2FA"
                className="h-44 w-44 rounded-lg border bg-white p-2"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t("security.mfa.orManual")}</p>
                <code className="mt-1 block break-all rounded-lg bg-muted px-2 py-1.5 text-xs font-mono">
                  {enroll.secret}
                </code>
                <p className="mt-3 text-sm font-medium">{t("security.mfa.step2")}</p>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="h-11 max-w-[140px] text-center text-lg font-mono tracking-[0.3em]"
                  />
                  <Button
                    onClick={confirmEnroll}
                    disabled={mfaBusy || code.length < 6}
                    className="h-11"
                  >
                    {mfaBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {t("security.mfa.verify")}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={cancelEnroll}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> {t("security.mfa.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}

        {mfaState === "active" && (
          <Button
            onClick={disable2fa}
            disabled={mfaBusy}
            variant="outline"
            className="mt-4 text-destructive hover:text-destructive"
          >
            {mfaBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {t("security.mfa.disable")}
          </Button>
        )}
      </section>

      {/* ---------------- Appareils connectés ---------------- */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--brand-light)] text-[color:var(--brand-dark)]">
            <Monitor className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">{t("security.devices.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("security.devices.subtitle")}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loadingSessions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("security.devices.loading")}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("security.devices.empty")}</p>
          ) : (
            sessions.map((s) => {
              const Icon = deviceIcon(s.user_agent);
              const isCurrent = s.id === currentSid;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {deviceLabel(s.user_agent, t)}
                      {isCurrent && (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                          {t("security.devices.current")}
                        </span>
                      )}
                      {s.aal === "aal2" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--brand-light)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--brand-dark)]">
                          <ShieldCheck className="h-3 w-3" /> 2FA
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip ? `${s.ip} · ` : ""}
                      {t("security.devices.connectedOn").replace("{date}", fmtDate(s.created_at))}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={signOutOthers}
            disabled={!!signingOut || sessions.length <= 1}
            variant="outline"
            className="flex-1"
          >
            {signingOut === "others" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {t("security.devices.signOutOthers")}
          </Button>
          <Button
            onClick={signOutEverywhere}
            disabled={!!signingOut}
            variant="outline"
            className="flex-1 text-destructive hover:text-destructive"
          >
            {signingOut === "global" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {t("security.devices.signOutEverywhere")}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("security.devices.expiryNote")}</p>
      </section>
    </div>
  );
}
