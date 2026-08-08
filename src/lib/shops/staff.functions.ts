// ============================================================================
// Gestion d'équipe PAR BOUTIQUE — réservée au PROPRIÉTAIRE (shops.owner_id).
// Crée des comptes (ou rattache un compte Livroto existant), attribue un rôle
// (manager/staff), permet de réinitialiser leur mot de passe ou de les retirer.
// Aucun rôle délégué ne peut toucher à cette table (voir RLS shop_staff_owner_all)
// ni aux secrets FlexPay/WhatsApp (shop_integration_settings reste owner-only).
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertShopOwner } from "@/lib/shops/access.server";

export const ownerListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShopOwner(context.userId, data.shop_id);
    const { data: staff, error } = await supabaseAdmin
      .from("shop_staff").select("id,user_id,role,full_name,created_at").eq("shop_id", data.shop_id).order("created_at");
    if (error) throw new Error(error.message);

    // Récupère l'email de chaque membre (auth.users, pas exposé via une table publique).
    const withEmail = await Promise.all(
      (staff ?? []).map(async (s) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(s.user_id);
        return { ...s, email: u.user?.email ?? null };
      }),
    );
    return { staff: withEmail };
  });

const createStaffInput = z.object({
  shop_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1).max(120),
  role: z.enum(["manager", "staff"]),
  password: z.string().min(8).max(72),
});

export const ownerCreateStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createStaffInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertShopOwner(context.userId, data.shop_id);

    // Compte existant (ex: client Livroto qu'on promeut employé) -> on rattache
    // sans toucher à son mot de passe. Sinon on crée un compte tout neuf.
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    let userId = existing.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase())?.id;

    if (!userId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (createErr) throw new Error(createErr.message);
      userId = created.user.id;
    }

    const { data: row, error } = await supabaseAdmin
      .from("shop_staff")
      .insert({ shop_id: data.shop_id, user_id: userId, role: data.role, full_name: data.full_name })
      .select().single();
    if (error) {
      if (error.code === "23505") throw new Error("Cette personne fait déjà partie de l'équipe de cette boutique.");
      throw new Error(error.message);
    }
    return { staff: row };
  });

export const ownerUpdateStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    staff_id: z.string().uuid(), shop_id: z.string().uuid(), role: z.enum(["manager", "staff"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShopOwner(context.userId, data.shop_id);
    const { error } = await supabaseAdmin.from("shop_staff").update({ role: data.role }).eq("id", data.staff_id).eq("shop_id", data.shop_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ownerRemoveStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staff_id: z.string().uuid(), shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShopOwner(context.userId, data.shop_id);
    const { error } = await supabaseAdmin.from("shop_staff").delete().eq("id", data.staff_id).eq("shop_id", data.shop_id);
    if (error) throw new Error(error.message);
    return { ok: true }; // retire l'accès à la boutique ; ne supprime PAS le compte Livroto de la personne
  });

export const ownerResetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    staff_id: z.string().uuid(), shop_id: z.string().uuid(), new_password: z.string().min(8).max(72),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShopOwner(context.userId, data.shop_id);
    const { data: staff } = await supabaseAdmin.from("shop_staff").select("user_id").eq("id", data.staff_id).eq("shop_id", data.shop_id).maybeSingle();
    if (!staff) throw new Error("Membre introuvable.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(staff.user_id, { password: data.new_password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
