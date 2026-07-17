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
    return { agent: data.agent, output };
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
    return { agent: "analytics" as const, output, orderCount: rows.length, days: data.days };
  });
