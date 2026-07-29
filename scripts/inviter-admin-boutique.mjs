// Invite un nouvel utilisateur par email + l'attache comme staff (admin par
// défaut) d'une boutique. Usage :
//   node scripts/inviter-admin-boutique.mjs <boutique_id> <email> <nom> [role]
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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [boutiqueId, email, nom, role = "admin"] = process.argv.slice(2);
if (!boutiqueId || !email || !nom) {
  throw new Error("Usage: node scripts/inviter-admin-boutique.mjs <boutique_id> <email> <nom> [role]");
}
if (!["admin", "vendeur", "caissier"].includes(role)) {
  throw new Error(`Rôle invalide: ${role}`);
}

const SITE_URL = "https://livroto-frontend-production.up.railway.app";

const { data: boutique, error: boutiqueErr } = await supabase
  .from("boutiques")
  .select("id,nom,actif")
  .eq("id", boutiqueId)
  .maybeSingle();
if (boutiqueErr) throw new Error(boutiqueErr.message);
if (!boutique) throw new Error(`Boutique ${boutiqueId} introuvable`);

console.log(`Boutique cible : ${boutique.nom} (actif=${boutique.actif})`);

const { data: existant } = await supabase.auth.admin.listUsers();
let utilisateur = existant.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (utilisateur) {
  console.log(`Compte déjà existant pour ${email} (id=${utilisateur.id}) — réutilisé.`);
} else {
  const { data: invite, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name: nom },
    redirectTo: `${SITE_URL}/reset-password`,
  });
  if (inviteErr) throw new Error(inviteErr.message);
  utilisateur = invite.user;
  console.log(`Invitation envoyée à ${email} (id=${utilisateur.id}).`);
}

const { data: dejaStaff } = await supabase
  .from("boutique_users")
  .select("id,role")
  .eq("boutique_id", boutiqueId)
  .eq("user_id", utilisateur.id)
  .maybeSingle();

if (dejaStaff) {
  console.log(`Déjà staff de cette boutique (rôle actuel: ${dejaStaff.role}) — rien à faire.`);
} else {
  const { error: staffErr } = await supabase
    .from("boutique_users")
    .insert({ boutique_id: boutiqueId, user_id: utilisateur.id, role });
  if (staffErr) throw new Error(staffErr.message);
  console.log(`Ajoutée comme "${role}" de ${boutique.nom}.`);
}

console.log("\nTerminé.");
console.log(`Email invité : ${email}`);
console.log(`Lien admin   : ${SITE_URL}/boutique/admin/produits?boutique=hugo-collection`);
