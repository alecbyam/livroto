import { reportLovableError } from "./lovable-error-reporting";

// Dédup en mémoire pour la durée de l'onglet : évite de spammer error_logs si une même
// erreur se répète en boucle (ex: un composant qui re-render en erreur en continu).
const seen = new Set<string>();

function fingerprint(message: string, stack?: string) {
  return `${message}::${(stack ?? "").slice(0, 300)}`;
}

function toError(x: unknown): Error {
  if (x instanceof Error) return x;
  if (typeof x === "string") return new Error(x);
  try {
    return new Error(JSON.stringify(x));
  } catch {
    return new Error("Erreur inconnue (non sérialisable)");
  }
}

// Mis à jour par __root.tsx depuis son abonnement onAuthStateChange déjà existant —
// purement indicatif (voir avertissement côté serveur dans error-reporting.functions.ts).
let currentUserId: string | null = null;
export function setCurrentUserIdForErrorReporting(id: string | null) {
  currentUserId = id;
}

type ReportFn = (input: { data: Record<string, unknown> }) => Promise<unknown>;

/**
 * Point d'entrée unique pour signaler une erreur front. Appelle aussi reportLovableError
 * (gratuit, no-op hors de l'éditeur Lovable) puis persiste via le serverFn passé en
 * paramètre (lié par l'appelant via useServerFn, un hook ne peut pas être appelé ici) —
 * best-effort, ne bloque jamais l'utilisateur, jamais de flood (dédup par onglet).
 */
export function reportError(
  error: unknown,
  opts: {
    source: "client_boundary" | "client_global";
    context?: Record<string, unknown>;
    report: ReportFn;
  },
) {
  if (typeof window === "undefined") return;
  const err = toError(error);
  reportLovableError(err, opts.context);

  const fp = fingerprint(err.message, err.stack);
  if (seen.has(fp)) return;
  seen.add(fp);

  opts
    .report({
      data: {
        source: opts.source,
        message: err.message,
        stack: err.stack,
        url: window.location.href,
        userId: currentUserId ?? undefined,
        userAgent: navigator.userAgent,
        context: opts.context,
      },
    })
    .catch(() => {});
}

/** Installe les écouteurs globaux (erreurs hors du boundary React : handlers d'event, code async). */
export function installGlobalErrorReporting(report: ReportFn) {
  if (typeof window === "undefined") return () => {};
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message, { source: "client_global", report });
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, { source: "client_global", report });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
