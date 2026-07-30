import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";
import { genererQrCodePng } from "@/lib/boutiques/qrcode.server";

const PAGE_SIZE = 30;

// Génère l'image QR d'un produit déjà créé (qr_code_data existe déjà, posé par
// le trigger DB) et met à jour qr_code_url. Séparé de la création pour pouvoir
// aussi servir de "backfill" (ex: produits importés par le fournisseur, ou
// semés en base sans image — cf. migration 38).
async function genererEtStockerQr(produitId: string, boutiqueId: string, qrCodeData: string) {
  const png = await genererQrCodePng(qrCodeData);
  const path = `${boutiqueId}/${produitId}.png`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("boutiques-qr")
    .upload(path, png, { contentType: "image/png", upsert: true, cacheControl: "31536000" });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabaseAdmin.storage.from("boutiques-qr").getPublicUrl(path);
  const { error: updErr } = await supabaseAdmin
    .from("produits")
    .update({ qr_code_url: pub.publicUrl })
    .eq("id", produitId);
  if (updErr) throw new Error(updErr.message);
  return pub.publicUrl;
}

export const boutiqueListerProduits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        offset: z.number().int().min(0).default(0),
        recherche: z.string().max(120).optional(),
        stock_bas_uniquement: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    let q = context.supabase
      .from("produits")
      .select("*,sous_categories(id,nom),boutique_categories(id,nom,icone)", { count: "exact" })
      .eq("boutique_id", data.boutique_id)
      .eq("actif", true);
    if (data.recherche?.trim()) q = q.ilike("nom", `%${data.recherche.trim()}%`);
    if (data.stock_bas_uniquement) q = q.eq("stock_bas", true);
    const {
      data: rows,
      error,
      count,
    } = await q
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const boutiqueCreerProduit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        nom: z.string().min(2).max(120),
        categorie_id: z.string().uuid(),
        sous_categorie_id: z.string().uuid().optional(),
        taille: z.string().max(30).optional(),
        couleur: z.string().max(40).optional(),
        prix_usd: z.number().min(0).max(100000),
        // Coût d'achat unitaire — sert à calculer une marge (jusqu'ici
        // seul le prix de vente existait sur le produit). Optionnel : les
        // produits déjà créés n'en ont pas, et un vendeur peut ne pas
        // connaître le coût exact au moment de la saisie.
        prix_achat_usd: z.number().min(0).max(100000).optional(),
        // Prix barré (promotion) — optionnel, jamais actif par défaut : une
        // promotion doit être un choix explicite, pas un état accidentel.
        prix_promo_usd: z.number().min(0).max(100000).optional(),
        promo_debut: z.string().datetime().optional(),
        promo_fin: z.string().datetime().optional(),
        promo_actif: z.boolean().default(false),
        quantite: z.number().int().min(0).max(1000000).default(0),
        seuil_alerte: z.number().int().min(0).max(100000).default(3),
        description: z.string().max(1000).optional(),
        // Jusqu'à 8 photos (l'utilisateur en veut au moins 5) ; images[0]
        // devient automatiquement image_url via un trigger DB (migration 47)
        // — tous les endroits qui lisent encore image_url (grille caisse,
        // vitrine, panier) continuent de fonctionner sans rien changer.
        images: z.array(z.string().url().max(1000)).max(8).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { boutique_id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("produits")
      .insert({
        boutique_id,
        nom: rest.nom,
        categorie_id: rest.categorie_id,
        sous_categorie_id: rest.sous_categorie_id ?? null,
        taille: rest.taille ?? null,
        couleur: rest.couleur ?? null,
        prix_usd: rest.prix_usd,
        prix_achat_usd: rest.prix_achat_usd ?? null,
        prix_promo_usd: rest.prix_promo_usd ?? null,
        promo_debut: rest.promo_debut ?? null,
        promo_fin: rest.promo_fin ?? null,
        promo_actif: rest.promo_actif,
        quantite: rest.quantite,
        seuil_alerte: rest.seuil_alerte,
        description: rest.description ?? null,
        images: rest.images ?? [],
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // qr_code_data est déjà posé par le trigger DB à ce stade (BEFORE INSERT).
    // La génération de l'image PNG est best-effort : un produit reste utilisable
    // (vente, recherche manuelle) même si l'upload échoue transitoirement — la
    // caisse ne doit jamais être bloquée par un souci de stockage d'image.
    let qr_code_url: string | null = null;
    try {
      qr_code_url = await genererEtStockerQr(row.id, boutique_id, row.qr_code_data as string);
    } catch (e) {
      console.error("[boutiqueCreerProduit] génération QR échouée:", e);
    }
    return { produit: { ...row, qr_code_url: qr_code_url ?? row.qr_code_url } };
  });

export const boutiqueRegenererQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), produit_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { data: produit, error } = await context.supabase
      .from("produits")
      .select("id,boutique_id,qr_code_data")
      .eq("id", data.produit_id)
      .eq("boutique_id", data.boutique_id)
      .single();
    if (error) throw new Error(error.message);
    const qr_code_url = await genererEtStockerQr(
      produit.id,
      produit.boutique_id,
      produit.qr_code_data as string,
    );
    return { qr_code_url };
  });

export const boutiqueModifierProduit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        produit_id: z.string().uuid(),
        nom: z.string().min(2).max(120).optional(),
        categorie_id: z.string().uuid().optional(),
        sous_categorie_id: z.string().uuid().nullable().optional(),
        taille: z.string().max(30).nullable().optional(),
        couleur: z.string().max(40).nullable().optional(),
        prix_usd: z.number().min(0).max(100000).optional(),
        prix_achat_usd: z.number().min(0).max(100000).nullable().optional(),
        prix_promo_usd: z.number().min(0).max(100000).nullable().optional(),
        promo_debut: z.string().datetime().nullable().optional(),
        promo_fin: z.string().datetime().nullable().optional(),
        promo_actif: z.boolean().optional(),
        seuil_alerte: z.number().int().min(0).max(100000).optional(),
        description: z.string().max(1000).nullable().optional(),
        images: z.array(z.string().url().max(1000)).max(8).optional(),
        actif: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { boutique_id, produit_id, ...patch } = data;
    // quantite n'est volontairement PAS modifiable ici : le garde-fou DB
    // (trg_produits_garde_quantite) rejetterait de toute façon un UPDATE
    // direct — tout changement de stock passe par boutiqueAjusterStock.
    const { error } = await context.supabase
      .from("produits")
      .update(patch)
      .eq("id", produit_id)
      .eq("boutique_id", boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const boutiqueSupprimerProduit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), produit_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { error } = await context.supabase
      .from("produits")
      .delete()
      .eq("id", data.produit_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Mouvement de stock manuel (réception hors bon de commande, casse, inventaire,
// correction). Passe par fn_mouvement_stock() — seule fonction autorisée à
// toucher produits.quantite — jamais un UPDATE direct.
export const boutiqueAjusterStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        produit_id: z.string().uuid(),
        type: z.enum(["entree", "sortie", "ajustement"]),
        quantite_delta: z
          .number()
          .int()
          .refine((v) => v !== 0, "La quantité ne peut pas être 0"),
        motif: z.string().max(300).optional(),
        // Id généré côté client (file d'attente offline) : rejouer le même
        // ajustement après un échec réseau (accusé de réception perdu) ne doit
        // jamais appliquer le delta une 2e fois — même principe que
        // hors_ligne_id sur boutiqueEncaisserVente.
        hors_ligne_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);

    if (data.hors_ligne_id) {
      const { data: existant } = await context.supabase
        .from("stock_movements")
        .select("*")
        .eq("boutique_id", data.boutique_id)
        .eq("reference_type", "ajustement_manuel")
        .eq("reference_id", data.hors_ligne_id)
        .maybeSingle();
      if (existant) return { mouvement: existant, deja_traite: true };
    }

    const delta =
      data.type === "sortie" ? -Math.abs(data.quantite_delta) : Math.abs(data.quantite_delta);
    const { data: mouvement, error } = await context.supabase.rpc("fn_mouvement_stock", {
      p_produit_id: data.produit_id,
      p_type: data.type,
      p_quantite_delta: data.type === "ajustement" ? data.quantite_delta : delta,
      p_reference_type: data.hors_ligne_id ? "ajustement_manuel" : undefined,
      p_reference_id: data.hors_ligne_id,
      p_motif: data.motif,
    });
    if (error) throw new Error(error.message);
    return { mouvement };
  });

// Données pour l'impression d'une planche d'étiquettes QR (réception de
// marchandise en lot). Pas de génération ici : les QR existent déjà, on
// renvoie juste ce qu'il faut pour la mise en page côté client (impression).
export const boutiqueProduitsPourPlancheQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        produit_ids: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: rows, error } = await context.supabase
      .from("produits")
      .select("id,nom,prix_usd,taille,couleur,qr_code_url,qr_code_data")
      .eq("boutique_id", data.boutique_id)
      .in("id", data.produit_ids);
    if (error) throw new Error(error.message);
    return { produits: rows ?? [] };
  });
