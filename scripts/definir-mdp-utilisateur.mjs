// Définit directement un mot de passe pour un utilisateur existant (email déjà
// invité) et confirme son email — utile quand on n'a pas accès à la boîte mail
// du destinataire pour cliquer le lien d'invitation. Le mot de passe doit être
// transmis à la personne par un autre canal (WhatsApp, appel...).
// Usage : node scripts/definir-mdp-utilisateur.mjs <email> [mot_de_passe]
import { randomBytes } from "node:crypto";
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

const [email, motDePasseFourni] = process.argv.slice(2);
if (!email) throw new Error("Usage: node scripts/definir-mdp-utilisateur.mjs <email> [mot_de_passe]");

function genererMotDePasse() {
  // Facile à relire/dicter par téléphone : mots courts + chiffres, pas de symboles ambigus.
  const mots = ["bunia", "livro", "hugo", "sayo", "ituri", "zamba", "kivu", "boma"];
  const mot = mots[randomBytes(1)[0] % mots.length];
  const chiffres = (randomBytes(2).readUInt16BE() % 9000 + 1000).toString();
  return `${mot[0].toUpperCase()}${mot.slice(1)}${chiffres}!`;
}

const motDePasse = motDePasseFourni || genererMotDePasse();

const { data: existant } = await supabase.auth.admin.listUsers();
const utilisateur = existant.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!utilisateur) throw new Error(`Aucun compte pour ${email} — crée-le d'abord (inviter-admin-boutique.mjs)`);

const { error } = await supabase.auth.admin.updateUserById(utilisateur.id, {
  password: motDePasse,
  email_confirm: true,
});
if (error) throw new Error(error.message);

console.log("Mot de passe défini avec succès.");
console.log(`Email        : ${email}`);
console.log(`Mot de passe : ${motDePasse}`);
console.log(`Connexion    : https://livroto-frontend-production.up.railway.app/auth`);
