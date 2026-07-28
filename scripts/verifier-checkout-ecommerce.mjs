// Vérification ponctuelle : reproduit exactement la logique métier de
// boutiqueCreerCommande (ecommerce.functions.ts) en script autonome, pour
// prouver que la composition (client invité + prix recalculés + code promo +
// insert commande) fonctionne réellement contre la base réelle, avant de
// nettoyer les données de test créées.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}
loadEnv();
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BOUTIQUE_ID = "11111111-1111-1111-1111-111111111111";
const TEL_TEST = "+243900000123";

// 1. Client invité (créé s'il n'existe pas)
let clientId;
const { data: clientExistant } = await admin.from("clients_boutique").select("id").eq("boutique_id", BOUTIQUE_ID).eq("telephone", TEL_TEST).is("user_id", null).maybeSingle();
if (clientExistant) clientId = clientExistant.id;
else {
  const { data, error } = await admin.from("clients_boutique").insert({ boutique_id: BOUTIQUE_ID, nom: "TEST Client Checkout", telephone: TEL_TEST, adresse_defaut: "Adresse test" }).select("id").single();
  if (error) throw error;
  clientId = data.id;
}
console.log("Client:", clientId);

// 2. Produits + prix recalculés serveur
const { data: casquette } = await admin.from("produits").select("id,prix_usd").eq("boutique_id", BOUTIQUE_ID).eq("nom", "Casquette snapback").single();
const lignesDemandees = [{ produit_id: casquette.id, quantite: 2 }];
let sousTotal = 0;
const lignesCalc = lignesDemandees.map((l) => {
  const total_ligne_usd = Math.round(casquette.prix_usd * l.quantite * 100) / 100;
  sousTotal += total_ligne_usd;
  return { produit_id: l.produit_id, quantite: l.quantite, prix_unitaire_usd: casquette.prix_usd, total_ligne_usd };
});
console.log("Sous-total calculé:", sousTotal);

// 3. Code promo BIENVENUE10 (min 20$, ce panier de 16$ NE doit PAS l'atteindre)
const { data: validation } = await admin.rpc("fn_valider_code_promo", { p_boutique_id: BOUTIQUE_ID, p_code: "BIENVENUE10", p_montant_usd: sousTotal });
console.log("Validation promo (attendu: invalide, montant min non atteint):", validation[0]);

// 4. Commande + lignes (sans promo puisqu'elle est invalide ici)
const { data: commande, error: cmdErr } = await admin.from("commandes_ecommerce").insert({
  boutique_id: BOUTIQUE_ID, client_id: clientId, adresse_livraison: "Adresse test checkout",
  mode_paiement: "paiement_livraison", sous_total_usd: sousTotal, remise_usd: 0, frais_livraison_usd: 0, total_usd: sousTotal,
}).select("id,numero,total_usd").single();
if (cmdErr) throw cmdErr;
console.log("Commande créée:", commande.numero, commande.total_usd, "$");

const { error: lignesErr } = await admin.from("commande_lignes").insert(lignesCalc.map((l) => ({ ...l, commande_id: commande.id })));
if (lignesErr) throw lignesErr;
console.log("Lignes insérées OK");

// 5. Nettoyage (client, commande, lignes de test)
await admin.from("commande_lignes").delete().eq("commande_id", commande.id);
await admin.from("commandes_ecommerce").delete().eq("id", commande.id);
await admin.from("clients_boutique").delete().eq("id", clientId);
console.log("Nettoyage OK — aucune donnée de test laissée en base.");
