// ============================================================================
// Module boutique générique — gestion de l'identité/config d'une boutique
// (table `shops`, indépendante de `vendors` et de `boutiques*` Hugo Collection).
// La lecture publique (storefront) se fait directement depuis le client via
// RLS (comme vendor.$slug.tsx) — pas besoin de server function pour ça.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---------- ADMIN : créer une nouvelle instance de boutique ----------
// C'est ICI que "créer un nouveau restaurant demain" devient une opération de
// configuration : aucune ligne de code à écrire, juste cet appel + la config
// du menu et des intégrations depuis le panneau boutique.
export const adminCreateShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      owner_email: z.string().email(),
      name: z.string().min(2).max(80),
      type: z.enum(["restaurant", "boutique_generale"]).default("restaurant"),
      slug: z.string().min(2).max(60).optional(),
      description: z.string().max(500).optional(),
      whatsapp_display: z.string().max(20).optional(),
      currency: z.enum(["USD", "CDF"]).default("USD"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: users, error: uErr } = await supabaseAdmin.auth.admin.listUsers();
    if (uErr) throw new Error(uErr.message);
    const owner = users.users.find((u) => u.email?.toLowerCase() === data.owner_email.toLowerCase());
    if (!owner) throw new Error(`Aucun compte JuntoxShop avec l'email ${data.owner_email}. Le propriétaire doit d'abord créer un compte.`);

    const slug = slugify(data.slug || data.name);
    const { data: row, error } = await supabaseAdmin
      .from("shops")
      .insert({
        owner_id: owner.id,
        type: data.type,
        slug,
        name: data.name,
        description: data.description ?? null,
        whatsapp_display: data.whatsapp_display ?? null,
        currency: data.currency,
        status: "approved",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { shop: row };
  });

// ---------- Ma boutique (propriétaire OU membre d'équipe délégué) ----------
export const getMyShop = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: owned } = await supabaseAdmin.from("shops").select("*").eq("owner_id", userId).maybeSingle();
    if (owned) return { shop: owned, role: "owner" as const };

    const { data: staff } = await supabaseAdmin
      .from("shop_staff").select("role,shops(*)").eq("user_id", userId).maybeSingle();
    if (staff?.shops) return { shop: staff.shops as any, role: staff.role as "manager" | "staff" };

    return { shop: null, role: null };
  });

export const ownerUpdateShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().min(2).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
      logo_url: z.string().url().max(1000).nullable().optional(),
      cover_url: z.string().url().max(1000).nullable().optional(),
      whatsapp_display: z.string().max(20).nullable().optional(),
      base_zone_id: z.string().uuid().nullable().optional(),
      config: z.record(z.string(), z.any()).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "description", "logo_url", "cover_url", "whatsapp_display", "base_zone_id", "config"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const { error } = await supabase.from("shops").update(patch as never).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
