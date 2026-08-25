import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Agents pilotables depuis l'UI (l'orchestrateur route, les 4 autres produisent).
const AGENT_TYPES = ["orchestrateur", "commercial", "contenu", "analytics", "support"] as const;

// Garde admin — mêmes règles que les autres fonctions admin. Les appels Claude
// coûtent de l'argent réel : réservés au founder/admin, jamais exposés aux clients.
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Réservé aux administrateurs.");
  }
}

/**
 * Enregistre un brouillon généré dans agent_drafts (historique persistant, backbone du
 * panneau de validation). Best-effort volontaire : si la table n'existe pas encore (migration
 * 60 pas encore appliquée en prod) ou si l'insert échoue pour une autre raison, le brouillon
 * généré est quand même renvoyé à l'UI — même philosophie que les notifications WhatsApp
 * ailleurs dans l'app (n'échoue jamais la fonctionnalité principale pour un souci annexe).
 */
// Exporté pour réutilisation par le cron de rapport hebdo (routes/api.cron.weekly-report.ts) —
// même table, même format d'insertion, pas de logique dupliquée.
export async function saveDraft(input: {
  agent: (typeof AGENT_TYPES)[number];
  inputMessage: string | null;
  output: unknown;
  userId: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("agent_drafts")
      .insert({
        agent: input.agent,
        input_message: input.inputMessage,
        output: input.output as any, // AgentOutputs[T] est un objet JSON-compatible (structured outputs), pas besoin de revalider ici
        created_by: input.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } catch (e) {
    console.error("[agent_drafts] échec d'enregistrement (brouillon quand même renvoyé) :", e);
    return null;
  }
}

/** Fait tourner un agent sur un message libre et renvoie son brouillon JSON validé. */
export const runAgentDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        agent: z.enum(AGENT_TYPES),
        message: z.string().trim().min(1).max(6000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runAgent } = await import("@/lib/agents/claude.server");
    const output = await runAgent(data.agent, data.message);
    const draftId = await saveDraft({
      agent: data.agent,
      inputMessage: data.message,
      output,
      userId: context.userId,
    });
    return { agent: data.agent, output, draftId };
  });

/**
 * Analytics « clé en main » : récupère les vraies commandes des N derniers jours
 * côté serveur et les fait analyser par l'agent analytics. L'admin n'a rien à
 * coller à la main — Claude lit les données réelles de LIVROTO.
 */
export const runSalesInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("created_at,status,total_usd,delivery_fee,zone,payment_method,quantity")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = orders ?? [];
    const { runAgent } = await import("@/lib/agents/claude.server");
    const message =
      `Période analysée : les ${data.days} derniers jours (à partir du ${since.slice(0, 10)}).\n` +
      `Nombre de commandes : ${rows.length}.\n` +
      `Données de ventes réelles (JSON Supabase, une ligne par commande) :\n` +
      JSON.stringify(rows);
    const output = await runAgent("analytics", message);
    const draftId = await saveDraft({
      agent: "analytics",
      inputMessage: `Analyse automatique · ${data.days} derniers jours · ${rows.length} commande(s)`,
      output,
      userId: context.userId,
    });
    return { agent: "analytics" as const, output, orderCount: rows.length, days: data.days, draftId };
  });

// ---------- Historique / validation des brouillons ----------

const DRAFT_STATUSES = ["en_attente", "valide", "rejete", "envoye"] as const;
const DRAFTS_PAGE_SIZE = 20;

/** Liste paginée des brouillons enregistrés, filtrable par statut et/ou agent. */
export const listAgentDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(DRAFT_STATUSES).optional(),
        agent: z.enum(AGENT_TYPES).optional(),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("agent_drafts")
      .select("id,agent,input_message,output,status,notes,created_at,reviewed_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + DRAFTS_PAGE_SIZE - 1);
    if (data.status) query = query.eq("status", data.status);
    if (data.agent) query = query.eq("agent", data.agent);
    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

/** Change le statut d'un brouillon (validation humaine) + note optionnelle du validateur. */
export const updateAgentDraftStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        draftId: z.string().uuid(),
        status: z.enum(DRAFT_STATUSES),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agent_drafts")
      .update({
        status: data.status,
        // notes omis du payload si non fourni -> ne pas écraser une note existante en changeant
        // juste le statut (ex: passer "en_attente" -> "valide" sans repasser par le champ note).
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.draftId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
