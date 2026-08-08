// ============================================================================
// Gestion du menu/catalogue par boutique : sections + articles.
// Toute écriture passe par `supabase` (client RLS, pas supabaseAdmin) : les
// policies shop_*_owner_all garantissent déjà que owner_id = auth.uid().
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertShopAccess } from "@/lib/shops/access.server";

// ---------- Lecture back-office (toutes sections/articles, même inactifs) ----------
export const getShopMenuForOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShopAccess(context.userId, data.shop_id, ["manager", "staff"]);
    const [{ data: sections }, { data: products }] = await Promise.all([
      supabaseAdmin.from("shop_menu_sections").select("*").eq("shop_id", data.shop_id).order("sort_order"),
      supabaseAdmin.from("shop_products").select("*").eq("shop_id", data.shop_id).order("sort_order"),
    ]);
    return { sections: sections ?? [], products: products ?? [] };
  });

// ---------- Sections ----------
export const ownerCreateMenuSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ shop_id: z.string().uuid(), name: z.string().min(1).max(60), sort_order: z.number().int().default(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertShopAccess(context.userId, data.shop_id, ["manager"]);
    const { data: row, error } = await context.supabase
      .from("shop_menu_sections")
      .insert({ shop_id: data.shop_id, name: data.name, sort_order: data.sort_order })
      .select().single();
    if (error) throw new Error(error.message);
    return { section: row };
  });

export const ownerUpdateMenuSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      section_id: z.string().uuid(),
      name: z.string().min(1).max(60).optional(),
      sort_order: z.number().int().optional(),
      active: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { section_id, ...patch } = data;
    const { error } = await context.supabase.from("shop_menu_sections").update(patch).eq("id", section_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ownerDeleteMenuSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ section_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shop_menu_sections").delete().eq("id", data.section_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Articles ----------
export const ownerCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      shop_id: z.string().uuid(),
      menu_section_id: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(120),
      description: z.string().max(800).optional(),
      price_usd: z.number().min(0).max(10000),
      image_url: z.string().url().max(1000).optional(),
      sort_order: z.number().int().default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertShopAccess(context.userId, data.shop_id, ["manager"]);
    const { data: row, error } = await context.supabase
      .from("shop_products")
      .insert({
        shop_id: data.shop_id,
        menu_section_id: data.menu_section_id ?? null,
        name: data.name,
        description: data.description ?? null,
        price_usd: data.price_usd,
        image_url: data.image_url ?? null,
        sort_order: data.sort_order,
      })
      .select().single();
    if (error) throw new Error(error.message);
    return { product: row };
  });

export const ownerUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      product_id: z.string().uuid(),
      menu_section_id: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(800).nullable().optional(),
      price_usd: z.number().min(0).max(10000).optional(),
      image_url: z.string().url().max(1000).nullable().optional(),
      is_available: z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { product_id, ...patch } = data;
    const { error } = await context.supabase.from("shop_products").update(patch as never).eq("id", product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ownerDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ product_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shop_products").delete().eq("id", data.product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
