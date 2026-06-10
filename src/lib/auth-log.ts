/**
 * Journal d'auth persistant (anneau, dernières entrées) pour diagnostiquer les incidents
 * de session sur l'appareil RÉEL de l'utilisateur. Écrit en console + localStorage.
 * Récupérable via le bouton « Copier le diagnostic » sur /auth.
 */
const KEY = "livroto.authlog";
const MAX = 50;

export function authLog(event: string, detail?: string): void {
  const line = `${new Date().toISOString()} | ${event}${detail ? " | " + detail : ""}`;
  try { console.info("[auth]", line); } catch {}
  if (typeof window === "undefined") return;
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    arr.push(line);
    while (arr.length > MAX) arr.shift();
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* localStorage indisponible */
  }
}

export function getAuthLog(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

/** Snapshot lisible de l'état d'auth local (sans secret) pour le diagnostic. */
export function authDiagnosticSnapshot(): string {
  const out: string[] = [];
  try {
    out.push(`ua: ${navigator.userAgent}`);
    out.push(`url: ${location.href}`);
    out.push(`online: ${navigator.onLine}`);
    out.push(`webLocks: ${typeof navigator !== "undefined" && !!navigator.locks}`);
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("sb-"));
    out.push(`sb_keys: ${keys.join(", ") || "(aucune)"}`);
    for (const k of keys) {
      if (k.includes("-auth-token") && !k.includes("verifier")) {
        try {
          const v = JSON.parse(localStorage.getItem(k) || "null");
          const exp = v?.expires_at ? new Date(v.expires_at * 1000).toISOString() : "?";
          out.push(`token[${k}]: user=${v?.user?.id ?? "?"} expires_at=${exp} hasRefresh=${!!v?.refresh_token}`);
        } catch {
          out.push(`token[${k}]: (illisible / corrompu)`);
        }
      }
    }
  } catch (e) {
    out.push(`snapshot_error: ${String(e)}`);
  }
  return out.join("\n");
}
