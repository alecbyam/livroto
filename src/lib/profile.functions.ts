import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().trim().min(1).max(80),
      phone: z.string().trim().min(8).max(20).regex(/^[+0-9 ()-]+$/, "Numéro invalide"),
      zone: z.string().trim().max(80).nullable().optional(),
      avatar_url: z.string().url().max(500).nullable().optional(),
      preferred_lang: z.enum(["fr", "sw", "ln", "en"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        name: data.name,
        phone: data.phone,
        zone: data.zone ?? null,
        avatar_url: data.avatar_url ?? null,
        ...(data.preferred_lang ? { preferred_lang: data.preferred_lang } : {}),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      target_type: z.enum(["product", "vendor", "rider", "order"]),
      target_id: z.string().uuid(),
      reason: z.string().trim().min(3).max(120),
      details: z.string().trim().max(1000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("reports").insert({
      reporter_id: userId,
      target_type: data.target_type,
      target_id: data.target_id,
      reason: data.reason,
      details: data.details ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });