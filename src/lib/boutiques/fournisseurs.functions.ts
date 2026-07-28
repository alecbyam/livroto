import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

const PAGE_SIZE = 30;

// ---------- Fournisseurs ----------
export const boutiqueListerFournisseurs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: rows, error } = await context.supabase
      .from("fournisseurs")
      .select("*")
      .eq("boutique_id", data.boutique_id)
      .eq("actif", true)
      .order("nom");
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const boutiqueCreerFournisseur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      boutique_id: z.string().uuid(),
      nom: z.string().min(2).max(120),
      contact: z.string().max(120).optional(),
      telephone: z.string().max(30).optional(),
      adresse: z.string().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { boutique_id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("fournisseurs")
      .insert({ boutique_id, ...rest })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { fournisseur: row };
  });

// ---------- Bons de commande ----------
export const boutiqueListerBonsCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid(), offset: z.number().int().min(0).default(0) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: rows, error, count } = await context.supabase
      .from("bons_commande_fournisseur")
      .select("*,fournisseurs(nom),lignes:bon_commande_lignes(id,produit_id,nom_produit,quantite_commandee,quantite_recue,prix_achat_unitaire_usd)", { count: "exact" })
      .eq("boutique_id", data.boutique_id)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const boutiqueCreerBonCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      boutique_id: z.string().uuid(),
      fournisseur_id: z.string().uuid(),
      lignes: z.array(z.object({
        produit_id: z.string().uuid().optional(),
        nom_produit: z.string().max(120).optional(),
        quantite_commandee: z.number().int().positive(),
        prix_achat_unitaire_usd: z.number().min(0),
      }).refine((l) => l.produit_id || l.nom_produit, "produit_id ou nom_produit requis")).min(1).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { data: bc, error: bcErr } = await context.supabase
      .from("bons_commande_fournisseur")
      .insert({
        boutique_id: data.boutique_id,
        fournisseur_id: data.fournisseur_id,
        statut: "envoye",
        date_commande: new Date().toISOString(),
        created_by: context.userId,
      })
      .select()
      .single();
    if (bcErr) throw new Error(bcErr.message);

    const { error: lignesErr } = await context.supabase.from("bon_commande_lignes").insert(
      data.lignes.map((l) => ({
        bon_commande_id: bc.id,
        produit_id: l.produit_id ?? null,
        nom_produit: l.nom_produit ?? null,
        quantite_commandee: l.quantite_commandee,
        prix_achat_unitaire_usd: l.prix_achat_unitaire_usd,
      })),
    );
    if (lignesErr) throw new Error(lignesErr.message);

    return { bon_commande: bc };
  });

// Réception de marchandise : passe par fn_receptionner_ligne (migration 34),
// qui alimente le stock via fn_mouvement_stock ET crée le produit + son QR à
// la volée si c'est une référence encore inconnue au catalogue.
export const boutiqueReceptionnerLigne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      boutique_id: z.string().uuid(),
      ligne_id: z.string().uuid(),
      quantite_recue: z.number().int().positive(),
      prix_vente_usd: z.number().min(0).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { data: ligne, error } = await context.supabase.rpc("fn_receptionner_ligne", {
      p_ligne_id: data.ligne_id,
      p_quantite_recue: data.quantite_recue,
      p_prix_vente_usd: data.prix_vente_usd,
    });
    if (error) throw new Error(error.message);
    return { ligne };
  });
