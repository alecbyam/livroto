import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Garde admin — même pattern que les autres fonctions admin (voir admin.functions.ts).
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

/**
 * Insertion partagée par reportClientError (ci-dessous, appelée depuis le navigateur) et
 * src/server.ts (erreurs SSR catastrophiques, appelée directement côté serveur — pas via le
 * mécanisme createServerFn, ce fichier n'a pas de contexte de requête à ce niveau). Best-effort
 * volontaire : un échec de logging ne doit jamais aggraver un incident déjà en cours.
 */
export async function logServerError(entry: {
  source: "client_boundary" | "client_global" | "ssr";
  message: string;
  stack?: string | null;
  url?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("error_logs").insert({
      source: entry.source,
      message: entry.message.slice(0, 2000),
      stack: entry.stack?.slice(0, 8000) ?? null,
      url: entry.url?.slice(0, 500) ?? null,
      user_id: entry.userId ?? null,
      user_agent: entry.userAgent?.slice(0, 300) ?? null,
      context: (entry.context as any) ?? null,
    });
  } catch (e) {
    console.error("[error_logs] échec d'enregistrement (non bloquant) :", e);
  }
}

/**
 * Volontairement PUBLIC (pas de requireSupabaseAuth) : une erreur peut survenir avant tout
 * login (page d'accueil, catalogue anonyme…), un visiteur non connecté doit pouvoir la
 * signaler. `userId` est auto-déclaré par le client, jamais vérifié serveur — purement
 * indicatif pour le diagnostic admin, ne JAMAIS s'en servir pour une décision de sécurité.
 * Pas de rate-limit dédié en v1 (limite connue) : la déduplication côté client
 * (src/lib/error-reporting.ts) évite déjà le cas le plus probable de flood — une même
 * erreur qui se répète en boucle dans un seul onglet.
 */
export const reportClientError = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        source: z.enum(["client_boundary", "client_global"]),
        message: z.string().trim().min(1).max(2000),
        stack: z.string().max(8000).optional(),
        url: z.string().max(500).optional(),
        userId: z.string().uuid().optional(),
        userAgent: z.string().max(300).optional(),
        context: z.record(z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await logServerError(data);
    return { ok: true };
  });

// ---------- Consultation admin ----------

const ERROR_LOGS_PAGE_SIZE = 30;

export const listErrorLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        resolved: z.boolean().optional(), // undefined = tous
        offset: z.number().int().min(0).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("error_logs")
      .select("id,source,message,stack,url,user_agent,created_at,resolved,resolved_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + ERROR_LOGS_PAGE_SIZE - 1);
    if (data.resolved !== undefined) query = query.eq("resolved", data.resolved);
    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const resolveErrorLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), resolved: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("error_logs")
      .update({
        resolved: data.resolved,
        resolved_at: data.resolved ? new Date().toISOString() : null,
        resolved_by: data.resolved ? context.userId : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
