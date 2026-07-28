// Upload d'un logo de boutique vers le bucket public boutiques-assets et mise
// à jour de boutiques.logo_url. Usage :
//   node scripts/uploader-logo-boutique.mjs <boutique_id> <chemin_fichier>
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}
loadEnv();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [boutiqueId, cheminFichier] = process.argv.slice(2);
if (!boutiqueId || !cheminFichier) throw new Error("Usage: node scripts/uploader-logo-boutique.mjs <boutique_id> <chemin_fichier>");

const octets = readFileSync(cheminFichier);
const ext = extname(cheminFichier).toLowerCase().replace(".", "") || "jpg";
const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
const path = `${boutiqueId}/logo.${ext === "jpeg" ? "jpg" : ext}`;

const { error: upErr } = await supabase.storage
  .from("boutiques-assets")
  .upload(path, octets, { contentType, upsert: true, cacheControl: "31536000" });
if (upErr) throw upErr;
console.log("Upload OK:", path, `(${octets.length} octets)`);

const { data: pub } = supabase.storage.from("boutiques-assets").getPublicUrl(path);
const { error: updErr } = await supabase.from("boutiques").update({ logo_url: pub.publicUrl }).eq("id", boutiqueId);
if (updErr) throw updErr;
console.log("logo_url mis à jour:", pub.publicUrl);
