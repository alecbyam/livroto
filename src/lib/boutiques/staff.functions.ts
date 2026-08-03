// Gestion de l'équipe d'une boutique (admin/vendeur/caissier) — jusqu'ici,
// ajouter un membre du staff nécessitait un script exécuté à la main
// (scripts/inviter-admin-boutique.mjs) par quelqu'un ayant accès au projet.
// Un admin de boutique peut désormais inviter/gérer sa propre équipe depuis
// l'interface. Les opérations Auth Admin (inviteUserByEmail, listUsers,
// getUserById) n'ont pas d'équivalent RLS — supabaseAdmin y est nécessaire ;
// tout ce qui touche boutique_users passe par context.supabase (RLS,
// policy boutique_users_admin_manage déjà scopée admin-only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

const SITE_URL = "https://livroto-frontend-production.up.railway.app";
const ROLES = ["admin", "vendeur", "caissier"] as const;

// Le rôle du membre connecté, pour adapter la navigation admin côté client
// (masquer les sections où il n'a de toute façon aucun droit d'écriture) et
// afficher "connecté en tant que X" dans l'en-tête — jamais utilisé pour une
// vérification de sécurité réelle, seulement pour l'affichage (le serveur
// revérifie toujours le rôle via assertBoutiqueStaff sur chaque action).
export const boutiqueObtenirMonRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("boutique_users")
      .select("role")
      .eq("boutique_id", data.boutique_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { role: row?.role ?? null };
  });

export const boutiqueListerStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { data: rows, error } = await context.supabase
      .from("boutique_users")
      .select("id,user_id,role,created_at")
      .eq("boutique_id", data.boutique_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const userIds = (rows ?? []).map((r) => r.user_id);
    const { data: profils } = await supabaseAdmin
      .from("profiles")
      .select("id,name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nomParId = new Map((profils ?? []).map((p) => [p.id, p.name]));

    const membres = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        return {
          id: r.id,
          role: r.role,
          nom: nomParId.get(r.user_id) || u?.user?.email || "(compte supprimé)",
          email: u?.user?.email ?? "",
          created_at: r.created_at,
        };
      }),
    );
    return { membres };
  });

export const boutiqueInviterStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        email: z.string().email(),
        nom: z.string().min(1).max(120),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);

    let userId: string;
    const { data: invite, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { data: { name: data.nom }, redirectTo: `${SITE_URL}/reset-password` },
    );
    if (invite?.user) {
      userId = invite.user.id;
    } else if (inviteErr && /already.*registered|already.*exist/i.test(inviteErr.message)) {
      // Compte déjà existant (ex: déjà client Livroto) — on le retrouve par
      // pagination plutôt que de dupliquer un compte.
      let trouve: { id: string } | undefined;
      for (let page = 1; page <= 10 && !trouve; page++) {
        const { data: liste } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        trouve = liste?.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
        if (!liste || liste.users.length < 200) break;
      }
      if (!trouve) throw new Error("Compte introuvable — réessaie dans un instant.");
      userId = trouve.id;
    } else {
      throw new Error(inviteErr?.message ?? "Invitation impossible.");
    }

    const { data: dejaStaff } = await context.supabase
      .from("boutique_users")
      .select("id")
      .eq("boutique_id", data.boutique_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (dejaStaff) throw new Error("Cette personne fait déjà partie de l'équipe.");

    const { error: insErr } = await context.supabase
      .from("boutique_users")
      .insert({ boutique_id: data.boutique_id, user_id: userId, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

export const boutiqueChangerRoleStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        membre_id: z.string().uuid(),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);

    if (data.role !== "admin") {
      const { data: cible } = await context.supabase
        .from("boutique_users")
        .select("role")
        .eq("id", data.membre_id)
        .eq("boutique_id", data.boutique_id)
        .single();
      if (cible?.role === "admin") {
        const { count } = await context.supabase
          .from("boutique_users")
          .select("id", { count: "exact", head: true })
          .eq("boutique_id", data.boutique_id)
          .eq("role", "admin");
        if ((count ?? 0) <= 1)
          throw new Error("Impossible de rétrograder le dernier admin de la boutique.");
      }
    }

    const { error } = await context.supabase
      .from("boutique_users")
      .update({ role: data.role })
      .eq("id", data.membre_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Définir/réinitialiser le mot de passe d'un membre du staff SANS dépendre
// de l'email d'invitation — un admin peut donner directement un mot de
// passe dictable (par téléphone/WhatsApp) à un membre qui n'a pas un accès
// email pratique ou dont l'email d'invitation n'est jamais arrivé. Même
// besoin que les scripts manuels historiques (inviter-admin-boutique.mjs +
// definir-mdp-utilisateur.mjs), maintenant exposé dans l'interface.
export const boutiqueDefinirMotDePasseStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        membre_id: z.string().uuid(),
        mot_de_passe: z.string().min(6).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);

    const { data: cible, error: cibleErr } = await context.supabase
      .from("boutique_users")
      .select("user_id")
      .eq("id", data.membre_id)
      .eq("boutique_id", data.boutique_id)
      .single();
    if (cibleErr || !cible) throw new Error("Membre introuvable.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(cible.user_id, {
      password: data.mot_de_passe,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const boutiqueRetirerStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), membre_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);

    const { data: cible } = await context.supabase
      .from("boutique_users")
      .select("role")
      .eq("id", data.membre_id)
      .eq("boutique_id", data.boutique_id)
      .single();
    if (cible?.role === "admin") {
      const { count } = await context.supabase
        .from("boutique_users")
        .select("id", { count: "exact", head: true })
        .eq("boutique_id", data.boutique_id)
        .eq("role", "admin");
      if ((count ?? 0) <= 1)
        throw new Error("Impossible de retirer le dernier admin de la boutique.");
    }

    const { error } = await context.supabase
      .from("boutique_users")
      .delete()
      .eq("id", data.membre_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
